import { convexTest } from "convex-test";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { sign } from "../lib/protocol";
import { today } from "../lib/domain";

const modules = import.meta.glob("../convex/**/*.ts");
const listing = {
  name: "Cordless drill",
  category: "Power tools" as const,
  condition: "Good" as const,
  description: "Two batteries, bits and a case. Please return charged.",
};
async function setup() {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ subject: "owner", name: "Olive" });
  const borrower = t.withIdentity({ subject: "borrower", name: "Ben" });
  const stranger = t.withIdentity({ subject: "stranger", name: "Sam" });
  const operator = t.withIdentity({ subject: "admin", name: "Ada" });
  const ownerId = await owner.mutation(api.users.ensure, {});
  const borrowerId = await borrower.mutation(api.users.ensure, {});
  await stranger.mutation(api.users.ensure, {});
  await operator.mutation(api.users.ensure, {});
  await t.mutation(internal.users.setRole, { subject: "admin", role: "admin" });
  const toolId = await owner.mutation(api.tools.create, listing);
  return {
    t,
    owner,
    borrower,
    stranger,
    operator,
    ownerId,
    borrowerId,
    toolId,
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-31T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("Convex authorization and borrowing", () => {
  it("returns only name and category publicly and blocks unauthenticated access", async () => {
    const { t } = await setup();
    expect(await t.query(api.tools.publicList, { day: today() })).toEqual([
      { name: listing.name, category: listing.category },
    ]);
    await expect(t.query(api.tools.list, { day: today() })).rejects.toThrow(
      "Sign in",
    );
    await expect(t.query(api.loans.list, { day: today() })).rejects.toThrow(
      "Sign in",
    );
    await expect(t.mutation(api.tools.create, listing)).rejects.toThrow(
      "Sign in",
    );
  });
  it("does not let a client select its own role or ownership", async () => {
    const { borrower, ownerId } = await setup();
    expect((await borrower.query(api.users.me, {}))?.role).toBe("user");
    await expect(
      borrower.mutation(api.users.trust, { userId: ownerId, trusted: true }),
    ).rejects.toThrow("Admin");
    await expect(borrower.query(api.users.list, {})).rejects.toThrow("Admin");
  });
  it("only lets owners edit and owners or admins remove", async () => {
    const { owner, borrower, operator, toolId } = await setup();
    await expect(
      borrower.mutation(api.tools.update, { toolId, ...listing }),
    ).rejects.toThrow("owner");
    await expect(
      borrower.mutation(api.tools.remove, { toolId }),
    ).rejects.toThrow("cannot remove");
    await owner.mutation(api.tools.update, {
      toolId,
      ...listing,
      name: "Updated drill",
    });
    await operator.mutation(api.tools.remove, { toolId });
    expect(await owner.query(api.tools.list, { day: today() })).toEqual([]);
  });
  it("supports request, approve and return with private views", async () => {
    const { owner, borrower, stranger, toolId, t } = await setup();
    const loanId = await borrower.mutation(api.loans.request, {
      toolId,
      start: today(),
      end: today(),
    });
    expect(
      (await owner.query(api.loans.list, { day: today() }))[0].status,
    ).toBe("pending");
    expect(await stranger.query(api.loans.list, { day: today() })).toEqual([]);
    await expect(
      stranger.mutation(api.loans.transition, { loanId, action: "approve" }),
    ).rejects.toThrow("does not belong");
    await expect(
      borrower.mutation(api.loans.transition, { loanId, action: "approve" }),
    ).rejects.toThrow("lender");
    await owner.mutation(api.loans.transition, { loanId, action: "approve" });
    expect(await t.query(api.tools.publicList, { day: today() })).toEqual([]);
    await borrower.mutation(api.loans.transition, { loanId, action: "return" });
    expect(
      (await borrower.query(api.loans.list, { day: today() }))[0].status,
    ).toBe("returned");
    expect(await t.query(api.tools.publicList, { day: today() })).toHaveLength(
      1,
    );
    await expect(
      owner.mutation(api.loans.transition, { loanId, action: "return" }),
    ).rejects.toThrow("approved");
  });
  it("declines colliding pending requests atomically and rejects overlapping bookings", async () => {
    const { owner, borrower, stranger, toolId } = await setup();
    const first = await borrower.mutation(api.loans.request, {
      toolId,
      start: "2026-11-01",
      end: "2026-11-03",
    });
    const second = await stranger.mutation(api.loans.request, {
      toolId,
      start: "2026-11-03",
      end: "2026-11-04",
    });
    await owner.mutation(api.loans.transition, {
      loanId: first,
      action: "approve",
    });
    expect(
      (await stranger.query(api.loans.list, { day: today() }))[0].status,
    ).toBe("declined");
    await expect(
      owner.mutation(api.loans.transition, {
        loanId: second,
        action: "approve",
      }),
    ).rejects.toThrow("pending");
    await expect(
      stranger.mutation(api.loans.request, {
        toolId,
        start: "2026-11-02",
        end: "2026-11-05",
      }),
    ).rejects.toThrow("unavailable");
    await expect(
      stranger.mutation(api.loans.request, {
        toolId,
        start: "2026-11-04",
        end: "2026-11-05",
      }),
    ).resolves.toBeTruthy();
  });
  it("prevents own-tool borrowing, duplicate pending requests, and invalid dates", async () => {
    const { owner, borrower, toolId } = await setup();
    const args = { toolId, start: today(), end: today() };
    await expect(owner.mutation(api.loans.request, args)).rejects.toThrow(
      "own tool",
    );
    await borrower.mutation(api.loans.request, args);
    await expect(borrower.mutation(api.loans.request, args)).rejects.toThrow(
      "already",
    );
    await expect(
      borrower.mutation(api.loans.request, { ...args, start: "bad" }),
    ).rejects.toThrow("valid");
  });
  it("cancels pending requests when moderated but preserves approved loan history", async () => {
    const { t, owner, borrower, stranger, operator, toolId } = await setup();
    const active = await borrower.mutation(api.loans.request, {
      toolId,
      start: today(),
      end: today(),
    });
    await owner.mutation(api.loans.transition, {
      loanId: active,
      action: "approve",
    });
    await stranger.mutation(api.loans.request, {
      toolId,
      start: "2026-11-05",
      end: "2026-11-06",
    });
    await expect(owner.mutation(api.tools.remove, { toolId })).rejects.toThrow(
      "Return all",
    );
    await operator.mutation(api.tools.remove, { toolId });
    expect(
      (await stranger.query(api.loans.list, { day: today() }))[0].status,
    ).toBe("cancelled");
    expect(await t.query(api.tools.publicList, { day: today() })).toEqual([]);
    await owner.mutation(api.loans.transition, {
      loanId: active,
      action: "return",
    });
    expect(
      (await borrower.query(api.loans.list, { day: today() }))[0].status,
    ).toBe("returned");
  });
  it("exposes trust management and all loans to admins only", async () => {
    const { operator, ownerId, borrower, toolId } = await setup();
    await operator.mutation(api.users.trust, {
      userId: ownerId,
      trusted: true,
    });
    expect(
      (await borrower.query(api.tools.list, { day: today() }))[0].trusted,
    ).toBe(true);
    await borrower.mutation(api.loans.request, {
      toolId,
      start: today(),
      end: today(),
    });
    expect(await operator.query(api.loans.list, { day: today() })).toHaveLength(
      1,
    );
  });
});
describe("automation correctness and security", () => {
  it("requires valid HMAC on HTTP integration endpoints, binding signatures to a path", async () => {
    const { t } = await setup();
    vi.stubEnv("N8N_TO_CONVEX_SECRET", "x".repeat(64));
    const envelope = await sign(
      "x".repeat(64),
      "POST",
      "/automation/overdue",
      {},
    );
    const valid = await t.fetch("/automation/overdue", {
      method: "POST",
      body: JSON.stringify(envelope),
    });
    expect(valid.status).toBe(200);
    const invalid = await t.fetch("/automation/overdue", {
      method: "POST",
      body: "{}",
    });
    expect(invalid.status).toBe(401);
    const wrongPath = await t.fetch("/automation/event", {
      method: "POST",
      body: JSON.stringify(envelope),
    });
    expect(wrongPath.status).toBe(401);
    const invalidId = await t.fetch("/automation/event", {
      method: "POST",
      body: JSON.stringify(
        await sign("x".repeat(64), "POST", "/automation/event", {
          eventId: "garbage",
        }),
      ),
    });
    expect(invalidId.status).toBe(400);
  });
  it("records request mock notifications exactly once across retries", async () => {
    const { t, borrower, toolId } = await setup();
    await borrower.mutation(api.loans.request, {
      toolId,
      start: today(),
      end: today(),
    });
    const event = await t.run((ctx) => ctx.db.query("events").first());
    expect(
      await t.mutation(internal.automation.recordEvent, {
        eventId: event!._id,
      }),
    ).toEqual({ duplicate: false });
    expect(
      await t.mutation(internal.automation.recordEvent, {
        eventId: event!._id,
      }),
    ).toEqual({ duplicate: true });
    expect(
      await t.run((ctx) => ctx.db.query("notifications").collect()),
    ).toHaveLength(1);
  });
  it("limits overdue reminders to one per loan per UTC day and stops after return", async () => {
    const { t, owner, borrower, toolId } = await setup();
    const loanId = await borrower.mutation(api.loans.request, {
      toolId,
      start: today(),
      end: today(),
    });
    await owner.mutation(api.loans.transition, { loanId, action: "approve" });
    vi.setSystemTime(new Date("2026-11-01T09:00:00Z"));
    expect(
      await t.query(internal.automation.overdue, { day: today() }),
    ).toHaveLength(1);
    expect(await t.query(api.tools.publicList, { day: today() })).toEqual([]);
    expect(
      (await borrower.query(api.tools.list, { day: today() }))[0].unavailable,
    ).toBe(true);
    await t.mutation(internal.automation.recordReminder, {
      loanId,
      day: today(),
    });
    await t.mutation(internal.automation.recordReminder, {
      loanId,
      day: today(),
    });
    expect(
      await t.query(internal.automation.overdue, { day: today() }),
    ).toEqual([]);
    expect(
      await t.run((ctx) => ctx.db.query("notifications").collect()),
    ).toHaveLength(1);
    vi.setSystemTime(new Date("2026-11-02T09:00:00Z"));
    expect(
      await t.query(internal.automation.overdue, { day: today() }),
    ).toHaveLength(1);
    await borrower.mutation(api.loans.transition, { loanId, action: "return" });
    expect(
      await t.mutation(internal.automation.recordReminder, {
        loanId,
        day: today(),
      }),
    ).toEqual({ skipped: true });
  });
  it("keeps delivery failures visible and restricts retry controls", async () => {
    const { t, borrower, stranger, toolId } = await setup();
    await borrower.mutation(api.loans.request, {
      toolId,
      start: today(),
      end: today(),
    });
    const event = (await t.run((ctx) => ctx.db.query("events").first()))!;
    await t.run((ctx) => ctx.db.patch(event._id, { attempts: 5 }));
    await t.mutation(internal.automation.finish, {
      eventId: event._id,
      attempt: 5,
      error: "Failed",
    });
    expect(
      (await t.query(internal.automation.getEvent, { eventId: event._id }))
        ?.state,
    ).toBe("failed");
    await expect(
      stranger.mutation(api.automation.retry, { eventId: event._id }),
    ).rejects.toThrow("does not belong");
    await borrower.mutation(api.automation.retry, { eventId: event._id });
    expect(
      (await t.query(internal.automation.getEvent, { eventId: event._id }))
        ?.attempts,
    ).toBe(0);
  });
});
