import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Kept as readable source as well as importable exports. No credentials are embedded.
export const signer = `
const crypto = require('crypto');
const secret = $env.N8N_TO_CONVEX_SECRET;
if (!secret || secret.length < 32) throw new Error('Integration not configured');
function signed(path, value) {
  const timestamp = Date.now();
  const payload = Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
  const signature = crypto.createHmac('sha256', secret).update(timestamp + '.POST.' + path + '.' + payload).digest('base64');
  return { json: { endpoint: path, envelope: { timestamp, payload, signature } } };
}
`;
export const verifyCode = `
const crypto = require('crypto');
const secret = $env.CONVEX_TO_N8N_SECRET;
if (!secret || secret.length < 32) throw new Error('Integration not configured');
const envelope = $input.first().json.body;
if (!envelope || typeof envelope !== 'object') throw new Error('Unauthorized');
const { timestamp, payload, signature } = envelope;
if (!Number.isSafeInteger(timestamp) || Math.abs(Date.now() - timestamp) > 300000 || typeof payload !== 'string' || payload.length > 200000 || typeof signature !== 'string') throw new Error('Unauthorized');
const expected = crypto.createHmac('sha256', secret).update(timestamp + '.POST./webhook/lendloop-request.' + payload).digest();
const supplied = Buffer.from(signature, 'base64');
if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) throw new Error('Unauthorized');
const event = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
if (!event || typeof event.eventId !== 'string') throw new Error('Invalid event');
// A durable mock notification is recorded atomically by Convex. No contact data is needed.
${signer}
return [signed('/automation/event', { eventId: event.eventId })];
`
  .replace(
    "const crypto = require('crypto');\nconst secret = $env.N8N_TO_CONVEX_SECRET;",
    "const signingCrypto = require('crypto');\nconst outgoingSecret = $env.N8N_TO_CONVEX_SECRET;",
  )
  .replace(
    "if (!secret || secret.length < 32) throw new Error('Integration not configured');\nfunction signed",
    "if (!outgoingSecret || outgoingSecret.length < 32) throw new Error('Integration not configured');\nfunction signed",
  )
  .replace(
    "const signature = crypto.createHmac('sha256', secret)",
    "const signature = signingCrypto.createHmac('sha256', outgoingSecret)",
  );

const errorId = "LendLoopErrors01";
/** @param {string} id @param {string} name @param {string} type @param {Record<string, unknown>} parameters @param {number} x @param {number} y @param {Record<string, unknown>} extra */
function node(id, name, type, parameters, x, y = 0, extra = {}) {
  return {
    id,
    name,
    type: `n8n-nodes-base.${type}`,
    typeVersion:
      type === "code"
        ? 2
        : type === "httpRequest"
          ? 4.2
          : type === "webhook"
            ? 2
            : type === "scheduleTrigger"
              ? 1.2
              : 1,
    position: [x, y],
    parameters,
    ...extra,
  };
}
function http(id, name, x) {
  return node(
    id,
    name,
    "httpRequest",
    {
      method: "POST",
      url: "={{ $env.CONVEX_SITE_URL + $json.endpoint }}",
      sendBody: true,
      specifyBody: "json",
      jsonBody: "={{ JSON.stringify($json.envelope) }}",
      options: {
        timeout: 20000,
        redirect: { redirect: { followRedirects: false } },
        response: { response: { responseFormat: "json" } },
      },
    },
    x,
    0,
    { retryOnFail: true, maxTries: 3, waitBetweenTries: 1000 },
  );
}
/** @param {string} id @param {string} name @param {ReturnType<typeof node>[]} nodes @param {string[][]} edges @param {boolean} error */
function flow(id, name, nodes, edges, error = true) {
  /** @type {Record<string, {main: {node: string; type: string; index: number}[][]}>} */
  const connections = {};
  for (const [from, to] of edges)
    connections[from] = { main: [[{ node: to, type: "main", index: 0 }]] };
  return {
    id,
    name,
    active: false,
    nodes,
    connections,
    settings: {
      executionOrder: "v1",
      timezone: "UTC",
      saveDataErrorExecution: "all",
      saveDataSuccessExecution: error ? "none" : "all",
      executionTimeout: 120,
      ...(error ? { errorWorkflow: errorId } : {}),
    },
    pinData: {},
    tags: [],
  };
}
export const workflows = {
  "request-notifications.json": flow(
    "LendLoopRequest1",
    "LendLoop — request notifications",
    [
      node(
        "request-trigger",
        "Borrow request webhook",
        "webhook",
        {
          httpMethod: "POST",
          path: "lendloop-request",
          responseMode: "lastNode",
          options: {},
        },
        0,
        0,
        { webhookId: "lendloop-request" },
      ),
      node(
        "verify-request",
        "Verify HMAC and prepare mock notification",
        "code",
        { jsCode: verifyCode },
        260,
      ),
      http("record-event", "Record mock notification idempotently", 560),
    ],
    [
      ["Borrow request webhook", "Verify HMAC and prepare mock notification"],
      [
        "Verify HMAC and prepare mock notification",
        "Record mock notification idempotently",
      ],
    ],
  ),
  "overdue-reminders.json": flow(
    "LendLoopOverdue1",
    "LendLoop — daily overdue reminders",
    [
      node(
        "daily-trigger",
        "Every day at 09 UTC",
        "scheduleTrigger",
        {
          rule: {
            interval: [{ field: "cronExpression", expression: "0 9 * * *" }],
          },
        },
        0,
      ),
      node(
        "sign-fetch",
        "Sign overdue query",
        "code",
        { jsCode: `${signer}\nreturn [signed('/automation/overdue', {})];` },
        220,
      ),
      http("fetch-overdue", "Fetch overdue loans", 440),
      node(
        "prepare-reminders",
        "Prepare signed reminder writebacks",
        "code",
        {
          jsCode: `${signer}\nconst rows = $input.all().flatMap(i => Array.isArray(i.json) ? i.json : [i.json]);\nreturn rows.filter(row => typeof row.loanId === 'string' && typeof row.day === 'string').map(row => signed('/automation/reminder', { loanId: row.loanId, day: row.day }));`,
        },
        660,
      ),
      http(
        "record-reminder",
        "Deliver logged mock reminder and record status",
        920,
      ),
    ],
    [
      ["Every day at 09 UTC", "Sign overdue query"],
      ["Sign overdue query", "Fetch overdue loans"],
      ["Fetch overdue loans", "Prepare signed reminder writebacks"],
      [
        "Prepare signed reminder writebacks",
        "Deliver logged mock reminder and record status",
      ],
    ],
  ),
  "automation-errors.json": flow(
    errorId,
    "LendLoop — visible automation failures",
    [
      node("error-trigger", "Workflow failed", "errorTrigger", {}, 0),
      node(
        "error-log",
        "Log safe failure reference",
        "code",
        {
          jsCode:
            "return $input.all().map(item => { const reference = { workflowId: String(item.json.workflow?.id || 'unknown'), executionId: String(item.json.execution?.id || 'unknown'), message: 'LendLoop automation failed. Inspect the original execution in n8n.' }; console.error(JSON.stringify(reference)); return { json: reference }; });",
        },
        260,
      ),
    ],
    [["Workflow failed", "Log safe failure reference"]],
    false,
  ),
};
export async function generate() {
  const directory = fileURLToPath(
    new URL("../n8n/workflows/", import.meta.url),
  );
  await mkdir(directory, { recursive: true });
  for (const [name, content] of Object.entries(workflows))
    await writeFile(
      path.join(directory, name),
      JSON.stringify(content, null, 2) + "\n",
    );
  console.log("Generated 3 credential-free n8n workflow exports.");
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await generate();
