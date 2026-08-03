/**
 * Module:   hours-serialize
 * Purpose:  The inverse of lib/hours.parseHours — turn the structured 7-day
 *           opening-hours editor model into the canonical backend string
 *           ("Sun-Thu 09:00-18:00, Fri 09:00-14:00"), compressing consecutive
 *           identical days into ranges, and seed the editor model back from an
 *           existing string. Pure functions, no React.
 * Does NOT: render, fetch, or change the storage format. The API and the parser
 *           (lib/hours.js) are untouched; this only builds the string HoursCard
 *           persists and prefills the editor from what the API already returns.
 * Related:  frontend/lib/hours.js (DAY_ABBR + parseHours + toMinutes — the read
 *           axis this mirrors), frontend/app/[locale]/producer/dashboard/edit/
 *           HoursEditor.jsx (the only UI consumer).
 * History:  MEH-1276 — structured Hebrew hours editor replaces the free-text
 *           HoursCard field (MEH-1242 PR5); serializer keeps the stored string
 *           byte-compatible so DB/API/parseHours never change.
 */
import { DAY_ABBR, parseHours, toMinutes } from "./hours";

// Sensible defaults for a freshly-opened day row (editor UX only — never
// persisted unless the row is toggled open).
export const DEFAULT_OPEN = "09:00";
export const DEFAULT_CLOSE = "17:00";

// One editor row: an open flag plus two "HH:MM" strings. `<input type="time">`
// always yields zero-padded 24h values, which is exactly what parseHours'
// /\d{2}:\d{2}/ axis expects — so the serialized output round-trips.
export function emptyDay() {
  return { open: false, ranges: [emptyRange()] };
}

/**
 * MEH-1870: a day carries a LIST of ranges (lunch break, or Friday morning +
 * מוצ"ש). Capped so the editor stays a form rather than a scheduler.
 */
export const MAX_RANGES_PER_DAY = 3;

/** A single editor range carrying the defaults. */
export function emptyRange() {
  return { from: DEFAULT_OPEN, to: DEFAULT_CLOSE };
}

const MINUTES_IN_DAY = 24 * 60;
const NEW_RANGE_LENGTH_MIN = 2 * 60;
const LAST_MINUTE_OF_DAY = "23:59";
const HHMM_RE = /^\d{2}:\d{2}$/;

const toHHMM = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * The range to append after `last` — starts where it ended (adjacency is legal
 * in this grammar) and runs two hours, clamped to the end of the day. Appending
 * the generic 09:00 default instead would collide with any existing morning
 * block, so the owner would meet a validation error she did not cause.
 */
export function nextRange(last) {
  if (!last || !HHMM_RE.test(last.to ?? "")) return emptyRange();
  const from = toMinutes(last.to);
  // No room left in the day. Returning {from: "23:59", to: "23:59"} here would
  // hand the owner a row that fails validation the moment it appears — an
  // unsaveable form she did not break. `canAddRange` hides the control instead.
  if (from >= MINUTES_IN_DAY - 1) return null;
  return { from: toHHMM(from), to: toHHMM(Math.min(from + NEW_RANGE_LENGTH_MIN, MINUTES_IN_DAY - 1)) };
}

/**
 * Whether "+ range" should be offered for this row: under the cap AND with
 * room left in the day after the last range. Both conditions, because the cap
 * alone would still offer an append that cannot produce a valid range.
 */
export function canAddRange(day) {
  if (!day?.open) return false;
  const ranges = day.ranges ?? [];
  if (ranges.length >= MAX_RANGES_PER_DAY) return false;
  return nextRange(ranges[ranges.length - 1]) !== null;
}

// Build the 7-row editor model (index 0=Sun … 6=Sat) from an existing
// opening_hours string. Unparseable / empty → all-closed rows. Callers detect
// the "existing value could not be parsed" case separately (parseHours(raw)
// === null on a non-empty string) so they can warn without discarding the
// original value until an explicit save.
export function daysFromString(raw) {
  const map = parseHours(raw); // null when empty or unparseable
  return DAY_ABBR.map((_, i) => {
    const slots = map?.[i];
    if (!slots?.length) return emptyDay();
    return {
      open: true,
      ranges: slots
        .slice(0, MAX_RANGES_PER_DAY)
        .map((slot) => ({ from: slot.open, to: slot.close })),
    };
  });
}

// Per-day validity. Returns the indices of the offending rows (empty = valid).
export function invalidDayIndices(days) {
  return dayIssues(days).map((issue) => issue.index);
}

/**
 * MEH-1870: the same rule set, but keeping WHY the row is bad so the editor can
 * name the actual mistake. A pair that ends before it starts and two ranges
 * that overlap are different errors; one shared message would describe at most
 * one of them correctly.
 *
 * Ordering and overlap are one comparison: a later range starting before the
 * previous one ended is unrepresentable either way. Adjacency (13:00 → 13:00)
 * is allowed — it is a contiguous stretch, not an overlap.
 *
 * @returns {Array<{index: number, reason: "invalid_range"|"invalid_overlap"}>}
 */
export function dayIssues(days) {
  const issues = [];
  days.forEach((day, i) => {
    if (!day?.open) return;
    const ranges = day.ranges ?? [];
    if (ranges.length === 0 || ranges.length > MAX_RANGES_PER_DAY) {
      issues.push({ index: i, reason: "invalid_range" });
      return;
    }
    let prevTo = null;
    for (const range of ranges) {
      if (
        !HHMM_RE.test(range?.from ?? "") ||
        !HHMM_RE.test(range?.to ?? "") ||
        toMinutes(range.to) <= toMinutes(range.from)
      ) {
        issues.push({ index: i, reason: "invalid_range" });
        return;
      }
      if (prevTo !== null && toMinutes(range.from) < prevTo) {
        issues.push({ index: i, reason: "invalid_overlap" });
        return;
      }
      prevTo = toMinutes(range.to);
    }
  });
  return issues;
}

/** The range list of one editor row, rendered as "09:00-13:00 16:00-19:00". */
function rangesToString(day) {
  return day.ranges.map((r) => `${r.from}-${r.to}`).join(" ");
}

// Serialize the editor model into the canonical string. Consecutive open days
// (no week-wrap) sharing identical from/to collapse into a single range
// ("Sun-Thu 09:00-18:00"); a lone open day or a break in the run emits a single
// day ("Fri 09:00-14:00"). Closed days are omitted; all-closed → "".
export function serializeHours(days) {
  const parts = [];
  let i = 0;
  while (i < days.length) {
    const d = days[i];
    if (!d.open) {
      i += 1;
      continue;
    }
    // MEH-1870: days collapse only when their WHOLE range list matches. Two
    // days sharing a morning block but differing in the evening are different
    // schedules, and merging them would silently drop one day's second range.
    const signature = rangesToString(d);
    let j = i;
    while (
      j + 1 < days.length &&
      days[j + 1].open &&
      rangesToString(days[j + 1]) === signature
    ) {
      j += 1;
    }
    const label = i === j ? DAY_ABBR[i] : `${DAY_ABBR[i]}-${DAY_ABBR[j]}`;
    parts.push(`${label} ${signature}`);
    i = j + 1;
  }
  return parts.join(", ");
}
