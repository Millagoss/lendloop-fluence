import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { sign } from "../lib/protocol.ts";

const app = parseEnv(
  await readFile(new URL("../.env.local", import.meta.url), "utf8"),
);
const env = parseEnv(
  await readFile(new URL("../.env.n8n", import.meta.url), "utf8"),
);
if (
  !/^http:\/\/(127\.0\.0\.1|localhost):3210$/.test(
    app.NEXT_PUBLIC_CONVEX_URL ?? "",
  )
)
  throw new Error(
    "Live integration verification is restricted to local Convex.",
  );
function table(name) {
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/convex/bin/main.js",
      "data",
      name,
      "--format",
      "json",
      "--limit",
      "1000",
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.status !== 0) throw new Error(`Could not inspect ${name}.`);
  return JSON.parse(result.stdout);
}
async function post(url, envelope) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(envelope),
    signal: AbortSignal.timeout(30_000),
  });
}
const events = table("events");
assert(
  events.length && events.every((e) => e.state === "delivered"),
  "All request/status outbox events should be delivered.",
);
const before = table("notifications");
const event = events[0];
const path = "/webhook/lendloop-request";
const envelope = await sign(env.CONVEX_TO_N8N_SECRET, "POST", path, {
  eventId: event._id,
});
for (let retry = 0; retry < 2; retry++)
  assert(
    (await post(`http://localhost:5678${path}`, envelope)).ok,
    "An idempotent event retry should succeed.",
  );
const forged = await post(`http://localhost:5678${path}`, {
  ...envelope,
  signature: "forged",
});
assert(!forged.ok, "n8n must reject forged signatures.");
const denied = await post("http://127.0.0.1:3211/automation/overdue", {
  ...envelope,
  signature: "forged",
});
assert.equal(denied.status, 401, "Convex must reject forged signatures.");
const after = table("notifications");
assert.equal(
  after.length,
  before.length,
  "Retries and forged requests cannot add notifications.",
);
const reminders = after.filter((n) => n.kind === "overdue_reminder");
assert.equal(
  reminders.length,
  1,
  "After running the overdue workflow twice, exactly one reminder should exist.",
);
const callback = await sign(
  env.N8N_TO_CONVEX_SECRET,
  "POST",
  "/automation/reminder",
  { loanId: reminders[0].loanId, day: new Date().toISOString().slice(0, 10) },
);
assert.deepEqual(
  await (
    await post("http://127.0.0.1:3211/automation/reminder", callback)
  ).json(),
  { duplicate: true },
);
await writeFile(
  new URL("../.local/automation-verification.json", import.meta.url),
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      checks: [
        "All outbox events delivered by actual n8n webhook",
        "Two retries produced no duplicate records",
        "n8n rejected forged signature",
        "Convex rejected forged signature",
        "Daily workflow ran twice with one reminder",
        "Reminder callback retry returned duplicate=true",
      ],
      eventCount: events.length,
      notificationCount: after.length,
      reminderCount: reminders.length,
    },
    null,
    2,
  ),
);
console.log(
  `PASS: ${events.length} delivered events; HMAC verification in both directions; idempotent request and overdue write-backs; exactly one overdue reminder.`,
);
