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
  return { open: false, from: DEFAULT_OPEN, to: DEFAULT_CLOSE };
}

// Build the 7-row editor model (index 0=Sun … 6=Sat) from an existing
// opening_hours string. Unparseable / empty → all-closed rows. Callers detect
// the "existing value could not be parsed" case separately (parseHours(raw)
// === null on a non-empty string) so they can warn without discarding the
// original value until an explicit save.
export function daysFromString(raw) {
  const map = parseHours(raw); // null when empty or unparseable
  return DAY_ABBR.map((_, i) => {
    const slot = map?.[i];
    return slot ? { open: true, from: slot.open, to: slot.close } : emptyDay();
  });
}

// Per-day validity: an open day's close must be strictly after its open.
// Returns the indices of the offending rows (empty array = all valid).
export function invalidDayIndices(days) {
  const bad = [];
  days.forEach((d, i) => {
    if (d.open && toMinutes(d.to) <= toMinutes(d.from)) bad.push(i);
  });
  return bad;
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
    let j = i;
    while (
      j + 1 < days.length &&
      days[j + 1].open &&
      days[j + 1].from === d.from &&
      days[j + 1].to === d.to
    ) {
      j += 1;
    }
    const label = i === j ? DAY_ABBR[i] : `${DAY_ABBR[i]}-${DAY_ABBR[j]}`;
    parts.push(`${label} ${d.from}-${d.to}`);
    i = j + 1;
  }
  return parts.join(", ");
}
