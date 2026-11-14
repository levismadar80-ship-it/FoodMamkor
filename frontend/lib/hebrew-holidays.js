// @ts-check
/**
 * Module:   hebrew-holidays
 * Purpose:  Computes the Israeli dates of the food holidays from the Hebrew
 *           calendar, for any year, so nobody has to type next year's table
 *           (MEH-3017). Same approach as Google/Outlook holiday calendars:
 *           the dates are derived from the calendar, never hand-entered.
 * Touches:  nothing — pure date math on the built-in Intl Hebrew calendar
 *           (ICU). Node is tested in vitest; WebKit (Safari's own ICU) by
 *           e2e/flows/manual/holiday-calendar.spec.ts. No library.
 * Does NOT: decide which holiday is shown when, or hold any words/icons —
 *           that is lib/holidays.js (and messages/{he,en}.json `holidays.*`).
 * Related:  lib/holidays.js (the only consumer); __tests__/holidays.test.js
 *           pins 5787 and 5788 against dates typed from outside this module.
 * History:  MEH-3017 (creation, 14/11/2026) — replaced the hand-typed 5787
 *           table that MEH-2263 / MEH-2998 had to roll every year.
 */

const DAY_MS = 86400000;
// Hebrew year Y starts in Tishri of Gregorian year Y - 3761.
const HEBREW_TO_GREGORIAN_OFFSET = 3761;
// Rosh Hashana never falls before 5 September or after 5 October, so a scan
// that starts on 15 August reaches 1 Tishri and runs on past 6 Sivan (the
// last anchor needed) within 400 days. It does not reach the end of Elul.
const SCAN_START_MONTH = 7; // August (0-based)
const SCAN_START_DAY = 15;
const SCAN_DAYS = 400;
const MIN_HEBREW_YEAR = 5000;

/**
 * Each holiday as an anchor day of the Hebrew calendar plus offsets in days.
 * Israel lengths (one festival day, not two). Convention kept from the old
 * table (MEH-2263): `start` = the eve (erev), `end` = the last festival day,
 * both inclusive. Chanuka and Tu Bishvat have no eve in that table: they start
 * on the day itself.
 * @type {Record<string, { month: string, day: number, startOffset: number, endOffset: number }>}
 */
const HOLIDAY_RULES = {
  rosh_hashana: { month: "Tishri", day: 1, startOffset: -1, endOffset: 1 },
  sukkot: { month: "Tishri", day: 15, startOffset: -1, endOffset: 7 }, // to Shemini Atzeret
  chanuka: { month: "Kislev", day: 25, startOffset: 0, endOffset: 7 },
  tu_bishvat: { month: "Shevat", day: 15, startOffset: 0, endOffset: 0 },
  pesach: { month: "Nisan", day: 15, startOffset: -1, endOffset: 6 },
  shavuot: { month: "Sivan", day: 6, startOffset: -1, endOffset: 0 },
};

/** @type {Intl.DateTimeFormat | null} */
let formatter = null;
function hebrewFormatter() {
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-u-ca-hebrew", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  return formatter;
}

/** @param {number} t UTC-midnight instant */
function isoOf(t) {
  return new Date(t).toISOString().slice(0, 10);
}

/** @param {string} iso "YYYY-MM-DD" */
function msOf(iso) {
  return Date.parse(`${iso}T00:00:00Z`);
}

/**
 * Hebrew year, month name and day of one Gregorian day.
 * @param {number} t UTC-midnight instant
 */
function hebrewPartsOf(t) {
  /** @type {Record<string, string>} */
  const parts = {};
  for (const p of hebrewFormatter().formatToParts(new Date(t))) parts[p.type] = p.value;
  return { year: Number(parts.year), month: parts.month, day: Number(parts.day) };
}

/** @type {Map<number, Record<string, { start: string, end: string }>>} */
const cache = new Map();

/**
 * The six holidays of one Hebrew year, as ISO dates.
 * Returns `{}` when the runtime has no Hebrew calendar, so the banner stays
 * quiet instead of showing a wrong date.
 * @param {number} hebrewYear e.g. 5787
 * @returns {Record<string, { start: string, end: string }>}
 */
export function holidayDatesForYear(hebrewYear) {
  const hit = cache.get(hebrewYear);
  if (hit) return hit;
  // A runtime that ignores u-ca-hebrew answers in Gregorian years (≈2026);
  // a nonsense year would scan for nothing. Both say nothing, once.
  if (!Number.isInteger(hebrewYear) || hebrewYear < MIN_HEBREW_YEAR) return {};

  /** @type {Map<string, number>} "Month day" → UTC instant */
  const anchors = new Map();
  const from = Date.UTC(hebrewYear - HEBREW_TO_GREGORIAN_OFFSET, SCAN_START_MONTH, SCAN_START_DAY);
  try {
    for (let i = 0; i < SCAN_DAYS; i++) {
      const t = from + i * DAY_MS;
      const h = hebrewPartsOf(t);
      if (h.year === hebrewYear) anchors.set(`${h.month} ${h.day}`, t);
    }
  } catch {
    return {};
  }

  /** @type {Record<string, { start: string, end: string }>} */
  const out = {};
  for (const [key, rule] of Object.entries(HOLIDAY_RULES)) {
    const t = anchors.get(`${rule.month} ${rule.day}`);
    if (t === undefined) {
      cache.set(hebrewYear, {}); // no usable Hebrew calendar — say nothing, and don't rescan
      return {};
    }
    out[key] = {
      start: isoOf(t + rule.startOffset * DAY_MS),
      end: isoOf(t + rule.endOffset * DAY_MS),
    };
  }
  cache.set(hebrewYear, out);
  return out;
}

/**
 * The holiday year in force on an Israel day: the Hebrew year of that day,
 * until its Shavuot is over — then the next one. This is the moment the old
 * hand-typed table was rolled, so nothing users see changes, it just never
 * runs out.
 * @param {string} isoDay Israel calendar day, "YYYY-MM-DD"
 * @returns {Record<string, { start: string, end: string }>}
 */
export function holidayDatesOn(isoDay) {
  let year;
  try {
    year = hebrewPartsOf(msOf(isoDay)).year;
  } catch {
    return {};
  }
  if (!Number.isFinite(year)) return {};
  const current = holidayDatesForYear(year);
  if (current.shavuot && current.shavuot.end < isoDay) return holidayDatesForYear(year + 1);
  return current;
}
