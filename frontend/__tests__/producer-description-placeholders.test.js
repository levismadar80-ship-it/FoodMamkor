import { describe, it, expect } from "vitest";
import {
  SPRING_PLACEHOLDER,
  SUMMER_PLACEHOLDER,
  FALL_PLACEHOLDER,
  WINTER_PLACEHOLDER,
  getSeasonalPlaceholder,
} from "@/lib/producer-description-placeholders";

// MEH-532: rotation by Date.getMonth() — 0-indexed.

describe("getSeasonalPlaceholder", () => {
  it("returns SPRING for month=3 (April)", () => {
    // new Date(2026, 3, 15) → April 15
    expect(getSeasonalPlaceholder(new Date(2026, 3, 15))).toBe(SPRING_PLACEHOLDER);
  });

  it("returns WINTER for month=0 (January)", () => {
    expect(getSeasonalPlaceholder(new Date(2026, 0, 15))).toBe(WINTER_PLACEHOLDER);
  });

  it("all four placeholders are Hebrew strings longer than 50 chars", () => {
    const hebrewLetter = /[֐-׿]/;
    for (const text of [
      SPRING_PLACEHOLDER,
      SUMMER_PLACEHOLDER,
      FALL_PLACEHOLDER,
      WINTER_PLACEHOLDER,
    ]) {
      expect(typeof text).toBe("string");
      expect(text.length).toBeGreaterThan(50);
      expect(hebrewLetter.test(text)).toBe(true);
    }
  });
});
