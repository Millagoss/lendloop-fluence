import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";

// Configure the local development backend without passing secrets in shell arguments.
const app = parseEnv(
  await readFile(new URL("../.env.local", import.meta.url), "utf8"),
);
const n8n = parseEnv(
  await readFile(new URL("../.env.n8n", import.meta.url), "utf8"),
);
if (
  !app.NEXT_PUBLIC_CONVEX_URL?.match(/^http:\/\/(127\.0\.0\.1|localhost):3210$/)
) {
  throw new Error(
    "This helper configures a local Convex backend only. Configure cloud environments in the dashboard.",
  );
}
const publishable = app.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
if (!publishable) throw new Error("Configure Clerk first.");
const domain = Buffer.from(publishable.split("_").slice(2).join("_"), "base64")
  .toString("utf8")
  .replace(/\$$/, "");
if (!/^[a-z0-9.-]+$/i.test(domain))
  throw new Error("Invalid Clerk publishable key domain.");
const variables = {
  CLERK_JWT_ISSUER_DOMAIN: `https://${domain}`,
  N8N_WEBHOOK_URL: "http://localhost:5678/webhook/lendloop-request",
  CONVEX_TO_N8N_SECRET: n8n.CONVEX_TO_N8N_SECRET,
  N8N_TO_CONVEX_SECRET: n8n.N8N_TO_CONVEX_SECRET,
};
for (const [name, value] of Object.entries(variables)) {
  if (!value)
    throw new Error(`Missing ${name}. Run npm run setup:secrets first.`);
  const result = spawnSync(
    process.execPath,
    ["node_modules/convex/bin/main.js", "env", "set", name],
    {
      input: `${value}\n`,
      encoding: "utf8",
      cwd: new URL("..", import.meta.url),
      env: process.env,
      windowsHide: true,
    },
  );
  if (result.status !== 0)
    throw new Error(
      `Could not configure ${name}. Ensure the local Convex deployment is running.`,
    );
  console.log(`Configured ${name}.`);
}
