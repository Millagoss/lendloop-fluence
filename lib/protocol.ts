// Portable Web Crypto implementation: Convex actions and the test runtime use this.
// The method and path prevent a valid signed request being reused at another endpoint.
export type Envelope = {
  timestamp: number;
  payload: string;
  signature: string;
};
export const WINDOW_MS = 5 * 60_000;
function base64(bytes: Uint8Array) {
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
}
function bytes(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
async function key(secret: string) {
  if (secret.length < 32)
    throw new Error("Integration secret must have at least 32 characters.");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
function message(
  timestamp: number,
  method: string,
  path: string,
  payload: string,
) {
  return new TextEncoder().encode(
    `${timestamp}.${method.toUpperCase()}.${path}.${payload}`,
  );
}
export async function sign(
  secret: string,
  method: string,
  path: string,
  value: unknown,
  now = Date.now(),
): Promise<Envelope> {
  const payload = base64(new TextEncoder().encode(JSON.stringify(value)));
  const mac = await crypto.subtle.sign(
    "HMAC",
    await key(secret),
    message(now, method, path, payload),
  );
  return { timestamp: now, payload, signature: base64(new Uint8Array(mac)) };
}
export async function verify<T>(
  secret: string,
  method: string,
  path: string,
  value: unknown,
  now = Date.now(),
): Promise<T> {
  if (!value || typeof value !== "object") throw new Error("Invalid envelope.");
  const { timestamp, payload, signature } = value as Envelope;
  if (
    !Number.isSafeInteger(timestamp) ||
    Math.abs(now - timestamp) > WINDOW_MS ||
    typeof payload !== "string" ||
    typeof signature !== "string" ||
    payload.length > 200_000
  )
    throw new Error("Invalid or expired envelope.");
  if (
    !(await crypto.subtle.verify(
      "HMAC",
      await key(secret),
      bytes(signature),
      message(timestamp, method, path, payload),
    ))
  )
    throw new Error("Invalid signature.");
  return JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes(payload)),
  ) as T;
}
