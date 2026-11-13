/**
 * MEH-2998 — the holiday table runs out, and nothing else would say so.
 *
 * lib/holidays.js is a hand-written table of one Hebrew year (5787: Rosh
 * Hashana 09/2026 → Shavuot 06/2027). After its last entry the home banner and
 * the dashboard hint simply never fire again: no error, no red test, the site
 * just goes quiet before Rosh Hashana 5788 (eve 01/10/2027).
 *
 * This guard reads the REAL clock on purpose (the one exception to the
 * frozen-clock rule in .claude/rules/testing.md): its whole job is to go red
 * on a calendar date. From 89 days before the table's last day (14/03/2027)
 * it fails with the instruction below — a scheduled red for EVERY PR and
 * staging run, on purpose, so the roll (MEH-3017, due 01/03/2027) cannot be
 * forgotten. That still leaves ~6 months before the 5788 Rosh Hashana banner
 * would be due (it opens 7 days before the eve, 01/10/2027).
 *
 * To fix a red here: add the next year's dates to lib/holidays.js AND pin them
 * in __tests__/holidays.test.js (MEH-2263 convention: start = erev, end = last
 * festival day, both inclusive). Do not raise or remove the threshold.
 */
import { describe, it, expect } from "vitest";
import { HOLIDAYS } from "@/lib/holidays";
import { israelToday } from "@/lib/israel-date";

const MIN_RUNWAY_DAYS = 90;
const DAY_MS = 86400000;

const dayMs = (iso) => Date.parse(`${iso}T00:00:00Z`);

/** Days from Israel-today until the last `end` in the table (negative = past). */
function runwayDays(now) {
  const lastEnd = Math.max(...Object.values(HOLIDAYS).map((h) => dayMs(h.end)));
  return Math.round((lastEnd - dayMs(israelToday(now))) / DAY_MS);
}

const LAST_END = Object.values(HOLIDAYS)
  .map((h) => h.end)
  .sort()
  .at(-1);

describe("holiday table has runway (MEH-2998)", () => {
  // Control: proves the measurement can go red AND green, against the real
  // table, so a green below is not the output of a dead check.
  it("control — 89 days before the last entry is red, 90 and 91 are green", () => {
    const at = (daysBefore) => new Date(dayMs(LAST_END) - daysBefore * DAY_MS + 12 * 3600000);
    expect(runwayDays(at(89))).toBeLessThan(MIN_RUNWAY_DAYS);
    expect(runwayDays(at(90))).toBeGreaterThanOrEqual(MIN_RUNWAY_DAYS);
    expect(runwayDays(at(91))).toBeGreaterThanOrEqual(MIN_RUNWAY_DAYS);
  });

  it(`today is at least ${MIN_RUNWAY_DAYS} days before the table's last day (${LAST_END})`, () => {
    const left = runwayDays(new Date());
    expect(
      left,
      `lib/holidays.js runs out on ${LAST_END} (${left} days from today). ` +
        "Add the next Hebrew year's dates there and pin them in __tests__/holidays.test.js.",
    ).toBeGreaterThanOrEqual(MIN_RUNWAY_DAYS);
  });
});
