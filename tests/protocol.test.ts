// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { sign, verify, WINDOW_MS } from "../lib/protocol";
import {
  signer,
  verifyCode,
  workflows,
} from "../scripts/generate-workflows.mjs";

const secret = "incoming-".padEnd(64, "x");
const outgoing = "outgoing-".padEnd(64, "y");
const require = createRequire(import.meta.url);
function execute(code: string, body: unknown, items?: unknown[]) {
  return new Function("require", "Buffer", "$env", "$input", code)(
    require,
    Buffer,
    { CONVEX_TO_N8N_SECRET: secret, N8N_TO_CONVEX_SECRET: outgoing },
    {
      first: () => ({ json: { body } }),
      all: () => (items ?? []).map((json) => ({ json })),
    },
  );
}
describe("signed integration protocol", () => {
  it("round trips Unicode payloads", async () => {
    const payload = { name: "邻居’s drill 🌱" };
    expect(
      await verify(
        secret,
        "POST",
        "/x",
        await sign(secret, "POST", "/x", payload),
      ),
    ).toEqual(payload);
  });
  it("rejects forged payloads, wrong methods, wrong secrets and expired envelopes", async () => {
    const signed = await sign(secret, "POST", "/x", {});
    await expect(verify(secret, "GET", "/x", signed)).rejects.toThrow();
    await expect(verify(outgoing, "POST", "/x", signed)).rejects.toThrow();
    await expect(
      verify(secret, "POST", "/x", {
        ...signed,
        payload: btoa('{"forged":true}'),
      }),
    ).rejects.toThrow();
    await expect(
      verify(secret, "POST", "/x", signed, signed.timestamp + WINDOW_MS + 1),
    ).rejects.toThrow();
    await expect(
      verify(secret, "POST", "/x", { ...signed, signature: "not a MAC" }),
    ).rejects.toThrow();
  });
  it("executes the actual n8n verifier and signs a Convex-compatible callback", async () => {
    const body = await sign(secret, "POST", "/webhook/lendloop-request", {
      eventId: "event123",
      toolName: "Drill 🌱",
      recipientId: "private",
    });
    const result = execute(verifyCode, body);
    expect(result).toHaveLength(1);
    expect(
      await verify(
        outgoing,
        "POST",
        "/automation/event",
        result[0].json.envelope,
      ),
    ).toEqual({ eventId: "event123" });
    expect(() => execute(verifyCode, { ...body, signature: "a" })).toThrow(
      "Unauthorized",
    );
    expect(() => execute(verifyCode, { ...body, timestamp: 1 })).toThrow(
      "Unauthorized",
    );
  });
  it("executes overdue workflow code for empty and multiple loan responses", async () => {
    const workflow = workflows["overdue-reminders.json"];
    const code = workflow.nodes.find((n) => n.id === "prepare-reminders")!
      .parameters.jsCode as string;
    expect(execute(code, null, [])).toEqual([]);
    const items = execute(code, null, [
      { loanId: "loan1", day: "2026-11-01", extra: "not forwarded" },
      { loanId: "loan2", day: "2026-11-01" },
    ]);
    expect(items).toHaveLength(2);
    expect(
      await verify(
        outgoing,
        "POST",
        "/automation/reminder",
        items[0].json.envelope,
      ),
    ).toEqual({ loanId: "loan1", day: "2026-11-01" });
    const query = execute(
      `${signer}\nreturn [signed('/automation/overdue', {})];`,
      null,
    );
    expect(
      await verify(
        outgoing,
        "POST",
        "/automation/overdue",
        query[0].json.envelope,
      ),
    ).toEqual({});
  });
  it("exports connected workflows without inline credentials", () => {
    for (const workflow of Object.values(workflows)) {
      const names = new Set(workflow.nodes.map((n) => n.name));
      for (const [from, outputs] of Object.entries(workflow.connections)) {
        expect(names.has(from)).toBe(true);
        for (const group of outputs.main)
          for (const edge of group) expect(names.has(edge.node)).toBe(true);
      }
      for (const node of workflow.nodes)
        expect(node).not.toHaveProperty("credentials");
    }
  });
});
