import { describe, it, expect } from "vitest";

import { humanTime } from "@/lib/time-format";

/**
 * MEH-1924 — the shared time-of-day display formatter.
 *
 * The cases that matter are the boundaries, not the happy path: midnight
 * (where a naive strip would eat a digit it must keep), a two-digit hour
 * (which must not change at all), and non-strings (which reach this from
 * callers whose data may be absent — rendering "null" would be worse than
 * rendering nothing).
 */
describe("humanTime", () => {
  it("strips the leading zero from a single-digit hour", () => {
    expect(humanTime("09:00")).toBe("9:00");
    expect(humanTime("08:30")).toBe("8:30");
  });

  it("leaves a two-digit hour completely alone", () => {
    expect(humanTime("14:00")).toBe("14:00");
    expect(humanTime("10:05")).toBe("10:05");
    expect(humanTime("23:59")).toBe("23:59");
  });

  it("midnight keeps its bare zero hour — 00:30 is 0:30, never 0:3", () => {
    expect(humanTime("00:30")).toBe("0:30");
    expect(humanTime("00:00")).toBe("0:00");
  });

  it("never touches the minutes", () => {
    // The regex is anchored to the hour; a zero-padded MINUTE must survive.
    expect(humanTime("09:05")).toBe("9:05");
    expect(humanTime("12:09")).toBe("12:09");
  });

  it("passes non-strings through untouched", () => {
    // Callers hand this whatever their data gave them. An absent window has to
    // stay absent rather than render as the string "null"/"undefined".
    expect(humanTime(null)).toBe(null);
    expect(humanTime(undefined)).toBe(undefined);
  });

  it("is idempotent — applying it twice changes nothing", () => {
    // Load-bearing: several call sites compose it around israelTime(), and a
    // future refactor could route a value through it more than once.
    expect(humanTime(humanTime("09:00"))).toBe("9:00");
  });

  it("does not strip a zero that is not the hour's leading digit", () => {
    // Guards the anchor. Without `^` this would corrupt a range string if one
    // were ever passed in whole instead of per-endpoint.
    expect(humanTime("19:00")).toBe("19:00");
  });
});
