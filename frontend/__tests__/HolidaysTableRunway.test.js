/**
 * MEH-2998 → MEH-3017 — the holiday dates must never run out.
 *
 * Until MEH-3017 lib/holidays.js was a hand-typed table of one Hebrew year,
 * and this guard went red 90 days before its last entry so somebody would type
 * the next year. The dates are now computed from the Hebrew calendar
 * (lib/hebrew-holidays.js), so the failure this guards against changed shape:
 * not "the table ends" but "the computation returns nothing" (a runtime with
 * no Hebrew calendar, a month name ICU renamed, a year where the roll-over
 * misfires). Any of those leaves the banner silently quiet, exactly as before.
 *
 * So the guard is now stronger than the old one, not looser: instead of
 * checking one table against today, it walks every day from today for ten
 * years and requires that a holiday is always ahead, and never further away
 * than the longest real gap in the calendar (Shavuot → Rosh Hashana, under
 * 130 days; 140 allows for the eve offset and leap years).
 */
import { describe, it, expect } from "vitest";
import { holidaysOn } from "@/lib/holidays";
import { holidayDatesForYear } from "@/lib/hebrew-holidays";
import { israelToday } from "@/lib/israel-date";

const DAY_MS = 86400000;
const YEARS_AHEAD = 10;
const MAX_GAP_DAYS = 140;

const dayMs = (iso) => Date.parse(`${iso}T00:00:00Z`);
const isoOf = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Days from `iso` to the nearest holiday in `holidays` that has not ended (Infinity if none). */
function gapFrom(holidays, iso) {
  const ahead = Object.values(holidays)
    .filter((h) => h.end >= iso)
    .map((h) => Math.max(0, (dayMs(h.start) - dayMs(iso)) / DAY_MS));
  return ahead.length ? Math.min(...ahead) : Infinity;
}

describe("holiday dates never run out (MEH-2998, MEH-3017)", () => {
  // Control: the measurement goes red for both ways the banner could go quiet
  // (no dates at all, or the next one too far away) and green for a real day.
  it("control — empty or too-far dates read as red, a real day reads as green", () => {
    const day = "2027-06-12";
    expect(gapFrom({}, day)).toBeGreaterThan(MAX_GAP_DAYS);
    expect(gapFrom({ x: { start: "2028-01-01", end: "2028-01-01" } }, day)).toBeGreaterThan(MAX_GAP_DAYS);
    expect(gapFrom(holidaysOn(day), day)).toBeLessThanOrEqual(MAX_GAP_DAYS);
  });

  it(`every day for ${YEARS_AHEAD} years from today has a holiday within ${MAX_GAP_DAYS} days`, () => {
    const start = dayMs(israelToday());
    const end = start + YEARS_AHEAD * 366 * DAY_MS;
    const misses = [];
    for (let t = start; t <= end; t += DAY_MS) {
      const iso = isoOf(t);
      const gap = gapFrom(holidaysOn(iso), iso);
      if (gap > MAX_GAP_DAYS) misses.push(`${iso}: ${gap}`);
    }
    expect(misses, "lib/hebrew-holidays.js returned no upcoming holiday on these days").toEqual([]);
  });

  it("every one of the next ten Hebrew years has all six holidays", () => {
    const year = Number(
      new Intl.DateTimeFormat("en-u-ca-hebrew", { year: "numeric", timeZone: "UTC" }).format(new Date()),
    );
    for (let y = year; y < year + YEARS_AHEAD; y++) {
      expect(Object.keys(holidayDatesForYear(y)).sort(), `Hebrew year ${y}`).toEqual(
        ["chanuka", "pesach", "rosh_hashana", "shavuot", "sukkot", "tu_bishvat"],
      );
    }
  });
});
