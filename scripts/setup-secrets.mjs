import { randomBytes } from "node:crypto";
import { access, writeFile } from "node:fs/promises";
const filename = new URL("../.env.n8n", import.meta.url);
try {
  await access(filename);
  console.log(".env.n8n already exists; nothing changed.");
} catch {
  const secret = () => randomBytes(32).toString("hex");
  const content = `# Local secrets. Never commit this file.\nN8N_ENCRYPTION_KEY=${secret()}\nN8N_RUNNERS_AUTH_TOKEN=${secret()}\nCONVEX_TO_N8N_SECRET=${secret()}\nN8N_TO_CONVEX_SECRET=${secret()}\nCONVEX_SITE_URL=http://host.docker.internal:3211\n`;
  await writeFile(filename, content, { flag: "wx", mode: 0o600 });
  console.log(
    "Created .env.n8n with random secrets. Values were not printed. Set CONVEX_SITE_URL for your deployment.",
  );
}
