import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseEnv } from "node:util";
import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

// Optional operator-driven verification for a disposable local deployment.
// Creates explicitly fictional development users; never runs against production.
const env = parseEnv(
  await readFile(new URL("../.env.local", import.meta.url), "utf8"),
);
if (
  !/^http:\/\/(127\.0\.0\.1|localhost):3210$/.test(
    env.NEXT_PUBLIC_CONVEX_URL ?? "",
  ) ||
  !env.CLERK_SECRET_KEY?.startsWith("sk_test_")
)
  throw new Error("Only local Convex and Clerk development keys are allowed.");
const today = () => new Date().toISOString().slice(0, 10);
const client = () => new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
async function clerk(path, body) {
  const response = await fetch(`https://api.clerk.com/v1${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${env.CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    throw new Error(
      `Clerk ${path.split("/")[1]} returned ${response.status}: ${details.errors?.map((e) => e.code).join(", ") ?? "unknown error"}`,
    );
  }
  return response.json();
}
await mkdir(new URL("../.local/", import.meta.url), { recursive: true });
const stateFile = new URL("../.local/demo-users.json", import.meta.url);
let users;
try {
  users = JSON.parse(await readFile(stateFile, "utf8"));
} catch {
  users = {};
  for (const [key, first] of [
    ["owner", "Olive"],
    ["borrower", "Ben"],
    ["stranger", "Sam"],
  ]) {
    const user = await clerk("/users", {
      email_address: [`lendloop.${key}+clerk_test@example.com`],
      first_name: first,
      last_name: "Demo",
      skip_password_requirement: true,
    });
    users[key] = user.id;
    await writeFile(stateFile, JSON.stringify(users, null, 2));
  }
}
async function authenticated(subject) {
  const session = await clerk("/sessions", { user_id: subject });
  const token = await clerk(`/sessions/${session.id}/tokens/convex`, {});
  const convex = client();
  convex.setAuth(token.jwt);
  await convex.mutation(api.users.ensure, {});
  return { convex, sessionId: session.id };
}
const sessions = [];
try {
  const owner = await authenticated(users.owner);
  sessions.push(owner.sessionId);
  const borrower = await authenticated(users.borrower);
  sessions.push(borrower.sessionId);
  const stranger = await authenticated(users.stranger);
  sessions.push(stranger.sessionId);
  const existing = await owner.convex.query(api.tools.list, { day: today() });
  const tools = [
    {
      name: "Cordless drill & bit set",
      category: "Power tools",
      condition: "Good",
      description:
        "A handy 18V drill, two batteries and a case of bits. For the shelf you've been meaning to put up. [Fictional demo listing]",
    },
    {
      name: "The weekend garden kit",
      category: "Garden",
      condition: "Like new",
      description:
        "Trowel, fork, gloves and a little encouragement for your next planting day. [Fictional demo listing]",
    },
    {
      name: "Pasta maker",
      category: "Kitchen",
      condition: "Good",
      description:
        "Hand-cranked pasta roller with fettuccine attachment. Sunday dinner, sorted. [Fictional demo listing]",
    },
    {
      name: "A tent for two",
      category: "Camping",
      condition: "Good",
      description:
        "Two-person tent with flysheet, pegs and groundsheet. Ready for fresh air. [Fictional demo listing]",
    },
    {
      name: "Socket & spanner set",
      category: "Hand tools",
      condition: "Well loved",
      description:
        "A trusty metric set for bikes, furniture and the odd weekend repair. [Fictional demo listing]",
    },
    {
      name: "Step ladder",
      category: "Other",
      condition: "Good",
      description:
        "A sturdy three-step ladder. For the lightbulb, the high shelf, the finishing touch. [Fictional demo listing]",
    },
  ];
  for (const tool of tools)
    if (!existing.some((t) => t.mine && t.name === tool.name))
      await owner.convex.mutation(api.tools.create, tool);
  const board = await owner.convex.query(api.tools.list, { day: today() });
  const drill = board.find((t) => t.mine && t.name === tools[0].name);
  assert(drill);
  const publicTools = await client().query(api.tools.publicList, {
    day: today(),
  });
  assert(
    publicTools.every(
      (t) => Object.keys(t).sort().join(",") === "category,name",
    ),
  );
  await assert.rejects(
    stranger.convex.mutation(api.tools.update, {
      toolId: drill._id,
      ...tools[0],
    }),
  );
  const loanId = await borrower.convex.mutation(api.loans.request, {
    toolId: drill._id,
    start: today(),
    end: today(),
  });
  await assert.rejects(
    borrower.convex.mutation(api.loans.transition, {
      loanId,
      action: "approve",
    }),
  );
  await owner.convex.mutation(api.loans.transition, {
    loanId,
    action: "approve",
  });
  assert.equal(
    (await stranger.convex.query(api.loans.list, { day: today() })).length,
    0,
  );
  await borrower.convex.mutation(api.loans.transition, {
    loanId,
    action: "return",
  });
  const loan = (
    await borrower.convex.query(api.loans.list, { day: today() })
  ).find((l) => l._id === loanId);
  assert.equal(loan?.status, "returned");
  await writeFile(
    new URL("../.local/live-verification.json", import.meta.url),
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        loanId,
        checks: [
          "Clerk-issued JWT accepted by Convex",
          "public name/category projection",
          "cross-user listing edit denied",
          "borrower approval denied",
          "private loan visibility",
          "request/approve/return lifecycle",
        ],
        demoUsers: users,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: live Clerk → Convex authentication, authorization and complete borrowing lifecycle. Six fictional demo listings are available.",
  );
} finally {
  for (const id of sessions)
    await clerk(`/sessions/${id}/revoke`, {}).catch(() => {});
}
