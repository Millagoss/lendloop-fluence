export const categories = [
  "Power tools",
  "Garden",
  "Kitchen",
  "Camping",
  "Hand tools",
  "Other",
] as const;
export const conditions = ["Like new", "Good", "Well loved"] as const;
export type Category = (typeof categories)[number];
export type Condition = (typeof conditions)[number];
export const DAY = 86_400_000;
export function today(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}
export function validRange(start: string, end: string, now = Date.now()) {
  const valid = (s: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s;
  if (!valid(start) || !valid(end))
    throw new Error("Choose valid calendar dates.");
  if (start < today(now)) throw new Error("A loan cannot start in the past.");
  if (end < start)
    throw new Error("Return date must be on or after the start date.");
  if (Date.parse(end) - Date.parse(start) >= 30 * DAY)
    throw new Error("Loans can last at most 30 days.");
  if (Date.parse(start) - Date.parse(today(now)) > 180 * DAY)
    throw new Error("Book within the next 180 days.");
}
export function overlaps(a: string, b: string, c: string, d: string) {
  return a <= d && c <= b;
}
export function text(value: string, label: string, max: number) {
  const result = value.trim();
  if (!result || result.length > max)
    throw new Error(`${label} must be between 1 and ${max} characters.`);
  return result;
}
