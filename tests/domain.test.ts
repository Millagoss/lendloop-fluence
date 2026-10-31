import { describe, it, expect } from "vitest";
import { validRange, overlaps } from "../lib/domain";
describe("loan calendar rules", () => {
  const now = Date.parse("2026-10-31T15:00:00Z");
  it("accepts an inclusive same-day loan", () =>
    expect(() => validRange("2026-10-31", "2026-10-31", now)).not.toThrow());
  it.each([
    ["2026-02-30", "2026-11-01"],
    ["2026-10-30", "2026-11-01"],
    ["2026-11-02", "2026-11-01"],
    ["2026-11-01", "2026-12-03"],
    ["2027-08-01", "2027-08-02"],
  ])("rejects invalid range %s – %s", (start, end) =>
    expect(() => validRange(start, end, now)).toThrow(),
  );
  it("treats shared return/start dates as a collision", () =>
    expect(
      overlaps("2026-11-01", "2026-11-03", "2026-11-03", "2026-11-04"),
    ).toBe(true));
});
