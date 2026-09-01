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

  // MEH-1988: the month is Israel's, not the browser's or UTC's.
  //
  // This case is the whole point of the change, and it is chosen so that the
  // three candidate clocks DISAGREE — otherwise it would pass against the old
  // implementation too and prove nothing:
  //
  //   2026-02-28T23:30:00Z  ->  UTC          = 28 Feb, month 1  -> WINTER
  //                             Asia/Jerusalem = 1 Mar 01:30, month 2 -> SPRING
  //
  // vitest runs with TZ unset in CI, i.e. UTC, so the pre-MEH-1988 body
  // (`now.getMonth()`) returned WINTER here. Verified by construction: reverting
  // getSeasonalPlaceholder to `now.getMonth()` reds THIS case and leaves the six
  // fixed-month cases above green.
  it("MEH-1988: uses the Israel month, not UTC — 28 Feb 23:30Z is already March in Israel", () => {
    expect(getSeasonalPlaceholder(new Date("2026-02-28T23:30:00Z"))).toBe(SPRING_PLACEHOLDER);
  });

  // The mirror case, so the assertion above cannot pass by always returning
  // SPRING: an instant that is the SAME calendar month in both zones.
  it("MEH-1988: control — mid-month is unambiguous and still resolves by its own season", () => {
    expect(getSeasonalPlaceholder(new Date("2026-02-15T12:00:00Z"))).toBe(WINTER_PLACEHOLDER);
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
