import { describe, it, expect } from "vitest";
import { clampPercent } from "@/lib/percent";

describe("clampPercent (MEH-1118 — conversion line never exceeds 100%)", () => {
  it("caps values above 100 at 100 (the reported 133.3% case)", () => {
    expect(clampPercent(133.3)).toBe(100);
    expect(clampPercent(400)).toBe(100);
  });

  it("passes the 100 boundary through unchanged", () => {
    expect(clampPercent(100)).toBe(100);
  });

  it("preserves fractional in-range values", () => {
    expect(clampPercent(45.5)).toBe(45.5);
    expect(clampPercent(0)).toBe(0);
  });

  it("floors negatives at 0", () => {
    expect(clampPercent(-5)).toBe(0);
  });

  it("coerces numeric strings", () => {
    expect(clampPercent("80")).toBe(80);
  });

  it("collapses non-finite input (null/undefined/NaN) to 0", () => {
    expect(clampPercent(null)).toBe(0);
    expect(clampPercent(undefined)).toBe(0);
    expect(clampPercent(NaN)).toBe(0);
  });
});
