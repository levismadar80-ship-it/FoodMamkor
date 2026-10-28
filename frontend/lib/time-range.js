/**
 * Module:   time-range
 * Purpose:  One owner for how an event's time reads: «09:30», or «09:30–15:00»
 *           when it has an end time (MEH-2469).
 * Does NOT: isolate direction — callers render the result inside
 *           `<span dir="ltr">`, because the en dash (bidi class ON) between two
 *           numbers in an RTL paragraph otherwise resolves RTL and the range
 *           reads «15:00–09:30» (review #3717). Precedent: OpeningHours.jsx.
 * History:  MEH-2469 (creation).
 */

/** "HH:MM[:SS]" | null → "HH:MM" | "" */
const hhmm = (t) => (t ? String(t).slice(0, 5) : "");

/** «09:30», «09:30–15:00», or "" when there is no start time. An end time
 *  without a start is not displayed (the API rejects that pair anyway). */
export function formatTimeRange(start, end) {
  const s = hhmm(start);
  if (!s) return "";
  const e = hhmm(end);
  return e ? `${s}–${e}` : s;
}
