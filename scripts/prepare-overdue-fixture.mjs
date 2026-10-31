import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";

// Operator-only fixture import, never an application mutation. Local deployment only.
const env = parseEnv(
  await readFile(new URL("../.env.local", import.meta.url), "utf8"),
);
if (
  !/^http:\/\/(127\.0\.0\.1|localhost):3210$/.test(
    env.NEXT_PUBLIC_CONVEX_URL ?? "",
  )
)
  throw new Error("Overdue fixtures are allowed only on local Convex.");
const previous = JSON.parse(
  await readFile(
    new URL("../.local/live-verification.json", import.meta.url),
    "utf8",
  ),
);
const result = spawnSync(
  process.execPath,
  [
    "node_modules/convex/bin/main.js",
    "data",
    "loans",
    "--format",
    "json",
    "--limit",
    "100",
  ],
  { encoding: "utf8", windowsHide: true },
);
if (result.status !== 0) throw new Error("Could not read local loans.");
const loans = JSON.parse(result.stdout);
const original = loans.find(
  (loan) => loan._id === previous.loanId && loan.status === "returned",
);
if (!original)
  throw new Error("Run scripts/verify-live.mjs successfully first.");
if (
  loans.some(
    (loan) => loan.toolId === original.toolId && loan.status === "approved",
  )
)
  throw new Error(
    "A fixture/active loan already exists; resolve it before importing another.",
  );
const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const { _id, _creationTime, ...fields } = original;
void _id;
void _creationTime;
await writeFile(
  new URL("../.local/overdue.jsonl", import.meta.url),
  JSON.stringify({
    ...fields,
    start: yesterday,
    end: yesterday,
    status: "approved",
    updatedAt: Date.now(),
  }) + "\n",
);
console.log(
  "Prepared one fictional overdue loan in .local/overdue.jsonl for an operator import. Existing records are unchanged.",
);
