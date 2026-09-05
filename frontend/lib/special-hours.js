/**
 * Module:   special-hours
 * Purpose:  Convert between the backend `producers.special_hours` JSONB shape
 *           ({"YYYY-MM-DD": {ranges: [{open, close}], note?}}) and the
 *           date-row editor model the dashboard renders, plus the client-side
 *           mirror of the backend's rules (ranges via the order-window mirror,
 *           note ≤ 200, no past dates, no duplicate dates).
 * Does NOT: derive "open now" or which override is in force — that is the
 *           public page's lib/orderWindow.js (`getOrderWindowStatus`,
 *           `getUpcomingSpecialDates`). Nothing here renders.
 * Related:  frontend/lib/order-window.js (range helpers REUSED verbatim, so
 *           a valid range means the same thing on both editors),
 *           frontend/lib/holidays.js (HOLIDAYS — the suggestion-chip source,
 *           per Sapir's 05/09 ruling; MEH-2263 owns any wrong date in it),
 *           backend/app/schemas/schemas.py (_special_hours_validator — the
 *           authority these rules mirror).
 * History:  MEH-2264 (MEH-1889 chunk B) — creation.
 */

import { israelToday } from "@/lib/israel-date";
import { HOLIDAYS } from "@/lib/holidays";
import { emptyOrderRange, orderDayIssues } from "@/lib/order-window";

export const MAX_SPECIAL_NOTE_LENGTH = 200;
// Mirrors `_MAX_SPECIAL_DATES` in the backend validator.
export const MAX_SPECIAL_DATES = 60;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A fresh row: closed on the given date, no note. */
export function emptySpecialRow(date = "") {
  return { date, closed: true, ranges: [emptyOrderRange()], note: "" };
}

/**
 * Stored map → editor rows, oldest first, TODAY-AND-LATER ONLY.
 *
 * Past dates are dropped on load (Sapir's ruling ג — readers ignore them), so
 * the next save no longer carries them and the row cleans itself up. A stored
 * entry with `ranges: []` is a closed row; a closed row still holds one
 * default range so re-opening it prefills sensibly, exactly as a closed weekly
 * day does in daysFromOrderWindow.
 */
export function rowsFromSpecialHours(specialHours, today = israelToday()) {
  if (!specialHours || typeof specialHours !== "object") return [];
  return Object.keys(specialHours)
    .filter((date) => ISO_DATE.test(date) && date >= today)
    .sort()
    .map((date) => {
      const entry = specialHours[date];
      const stored = Array.isArray(entry?.ranges) ? entry.ranges : [];
      const ranges = stored
        .filter((r) => HHMM.test(r?.open ?? "") && HHMM.test(r?.close ?? ""))
        .map((r) => ({ from: r.open, to: r.close }));
      return {
        date,
        closed: ranges.length === 0,
        ranges: ranges.length > 0 ? ranges : [emptyOrderRange()],
        note: typeof entry?.note === "string" ? entry.note : "",
      };
    });
}

/**
 * Editor rows → the special_hours payload. `null` when there are no rows, which
 * is the explicit-clear body the backend expects (same contract as
 * serializeOrderWindow). A closed row writes `ranges: []`; an empty note is
 * omitted rather than written as "".
 */
export function serializeSpecialHours(rows) {
  const out = {};
  for (const row of rows) {
    if (!row?.date) continue;
    const entry = {
      ranges: row.closed ? [] : row.ranges.map((r) => ({ open: r.from, close: r.to })),
    };
    const note = (row.note ?? "").trim();
    if (note) entry.note = note;
    out[row.date] = entry;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * The client mirror of the backend's rejections, per row:
 *   - `invalid_date`   — empty, malformed, in the past, or a duplicate of an
 *                        earlier row (two rows for one date cannot both win)
 *   - `invalid_range` / `invalid_overlap` — from orderDayIssues, REUSED so the
 *                        two editors cannot disagree on what a valid range is
 *
 * @returns {Array<{index: number, reason: string}>}
 */
export function specialHoursIssues(rows, today = israelToday()) {
  const issues = [];
  const seen = new Set();
  rows.forEach((row, index) => {
    const date = row?.date ?? "";
    if (!ISO_DATE.test(date) || date < today || seen.has(date)) {
      issues.push({ index, reason: "invalid_date" });
    }
    seen.add(date);
  });
  // Range rules: a closed row's ranges are ignored, like a closed weekly day.
  const asDays = rows.map((row) => ({ open: !row?.closed, ranges: row?.ranges ?? [] }));
  for (const issue of orderDayIssues(asDays)) {
    if (!issues.some((existing) => existing.index === issue.index)) issues.push(issue);
  }
  return issues.sort((a, b) => a.index - b.index);
}

function eachDate(start, end) {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const out = [];
  for (let t = Date.UTC(sy, sm - 1, sd); t <= Date.UTC(ey, em - 1, ed); t += DAY_MS) {
    // Date ARITHMETIC on UTC-midnight instants built from the ISO dates above —
    // not a "today" read; israelToday() owns today (see the callers).
    // guard-ok: UTC date arithmetic on fixed ISO inputs, not a clock read
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Suggestion chips — the upcoming entries of lib/holidays.js, oldest first:
 *   [{ key, name, dates: ["YYYY-MM-DD", …], added: boolean }]
 *
 * `dates` are the holiday's calendar days from today onward; `added` is true
 * when EVERY one of them is already a row, so the chip can render as taken.
 * Never applied automatically (ruling ב) — the caller adds rows on tap.
 * Reads HOLIDAYS as-is: a wrong date there is MEH-2263's to fix, and this
 * function is correct by construction the moment it lands.
 */
export function holidayChips(rows, today = israelToday()) {
  const present = new Set(rows.map((row) => row.date));
  return Object.entries(HOLIDAYS)
    .filter(([, holiday]) => holiday.end >= today)
    .sort(([, a], [, b]) => a.start.localeCompare(b.start))
    .map(([key, holiday]) => {
      const dates = eachDate(holiday.start < today ? today : holiday.start, holiday.end);
      return {
        key,
        name: holiday.name,
        dates,
        added: dates.length > 0 && dates.every((date) => present.has(date)),
      };
    });
}

/**
 * Rows after tapping a chip: one CLOSED row per holiday date not yet present,
 * note prefilled with the holiday name, list kept sorted by date. Rows the
 * owner already has are left exactly as they are — a chip never overwrites.
 */
export function addHolidayRows(rows, chip) {
  const present = new Set(rows.map((row) => row.date));
  const added = chip.dates
    .filter((date) => !present.has(date))
    .map((date) => ({ ...emptySpecialRow(date), note: chip.name }));
  return [...rows, ...added].sort((a, b) => a.date.localeCompare(b.date));
}

/** How many stored overrides are still ahead — the accordion summary count. */
export function upcomingSpecialCount(specialHours, today = israelToday()) {
  return rowsFromSpecialHours(specialHours, today).length;
}
