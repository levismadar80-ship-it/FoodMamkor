/** MEH-2469 — lib/time-range.js: one owner for «09:30» / «09:30–15:00». */
import { describe, it, expect } from "vitest";
import { formatTimeRange } from "@/lib/time-range";

describe("formatTimeRange", () => {
  it("start + end → «09:30–15:00» (seconds dropped)", () => {
    expect(formatTimeRange("09:30:00", "15:00:00")).toBe("09:30–15:00");
  });
  it("start only → «09:30»", () => {
    expect(formatTimeRange("09:30:00", null)).toBe("09:30");
  });
  it("no start → empty, even with an end", () => {
    expect(formatTimeRange(null, "15:00:00")).toBe("");
    expect(formatTimeRange(null, null)).toBe("");
  });
});
