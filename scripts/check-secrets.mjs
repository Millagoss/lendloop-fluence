import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { execFileSync } from "node:child_process";

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const secrets = [];
for (const filename of [".env.local", ".env.n8n"]) {
  let values;
  try { values = parseEnv(await readFile(filename, "utf8")); } catch { continue; }
  for (const [name, value] of Object.entries(values)) if (value.length >= 24 && /SECRET|ENCRYPTION_KEY|AUTH_TOKEN|DEPLOY_KEY/.test(name)) secrets.push({ name, value });
}
const problems = [];
for (const filename of new Set(files)) {
  const body = await readFile(filename);
  for (const secret of secrets) if (body.includes(Buffer.from(secret.value))) problems.push(`${filename}: contains local ${secret.name}`);
  if (/sk_(?:test|live)_[A-Za-z0-9]{20,}/.test(body.toString("utf8"))) problems.push(`${filename}: possible Clerk secret key`);
}
if (problems.length) { console.error(problems.join("\n")); process.exitCode = 1; }
else console.log(`PASS: ${new Set(files).size} repository files checked; no local secrets or Clerk secret-key patterns found.`);
