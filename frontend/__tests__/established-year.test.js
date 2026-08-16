/**
 * MEH-1581 — established_year client bound parity with the server (Israel tz).
 *
 * The number input's `max` must reflect Asia/Jerusalem's year (the server uses
 * israel_today().year), NOT the browser's local year. At the New-Year boundary
 * a UTC-5 user is still in the previous year while Israel has already rolled
 * over — the helper must follow Israel, closing the drift flagged on MEH-1541.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { MIN_ESTABLISHED_YEAR, currentIsraelYear } from "@/lib/established-year";

afterEach(() => {
  vi.useRealTimers();
});

describe("currentIsraelYear", () => {
  it("follows Israel across the year boundary while UTC-America is still behind", () => {
    // 2026-12-31T22:30:00Z → Israel (UTC+2, winter) is 2027-01-01 00:30,
    // while UTC / the Americas are still on 2026-12-31.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T22:30:00Z"));

    expect(currentIsraelYear()).toBe(2027);
    // Guard the whole point of the ticket: at this instant the raw browser
    // year (UTC in CI) is the OLD year, so the helper genuinely diverges.
    expect(currentIsraelYear()).not.toBe(2026);
  });

  it("returns the plain year mid-year (no boundary ambiguity)", () => {
    // 2026-06-15T09:00:00Z → Israel (IDT, UTC+3) and most of the globe agree.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T09:00:00Z"));

    expect(currentIsraelYear()).toBe(2026);
  });

  it("returns a number, never a string", () => {
    expect(typeof currentIsraelYear()).toBe("number");
  });
});

describe("MIN_ESTABLISHED_YEAR", () => {
  it("mirrors the server floor (schemas.py: v < 1800)", () => {
    expect(MIN_ESTABLISHED_YEAR).toBe(1800);
  });
});
