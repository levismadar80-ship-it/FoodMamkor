/**
 * Module:   time-format
 * Purpose:  The single owner of how a time-of-day is SHOWN to a reader —
 *           "09:00" becomes "9:00". One definition, called by every consumer
 *           surface, so the same hour cannot print two ways on one page.
 * Touches:  nothing — a pure string transform, no I/O, no clock, no locale data.
 * Does NOT: parse, validate, sort, or store. HH:MM stays the stored and
 *           transported shape: it is what sorts lexicographically, what
 *           `<input type="time">` requires, and what schema.org's
 *           openingHoursSpecification expects. This module is the LAST step
 *           before ink, never a step before a write. It also does not own the
 *           range/joiner grammar ("–" inside a range, ", " between them) —
 *           that stays with each card.
 * Related:  app/[locale]/producer/[id]/components/OrderWindowStrip.jsx (origin),
 *           components/OpeningHours.jsx, components/ProducerCard.jsx,
 *           app/[locale]/producer/[id]/components/ProducerHeader.jsx,
 *           app/[locale]/producer/[id]/lib/order-status.js (israelTime — the
 *           HH:MM primitive this is applied TO, deliberately left padded).
 * History:  MEH-1917 (born local to OrderWindowStrip);
 *           MEH-1924 (extracted here so the order window and the opening-hours
 *           card stop disagreeing by one leading zero on the same page).
 *
 * WHY THE PADDING IS A STORAGE ARTIFACT, NOT A STYLE
 *   HH:MM is zero-padded because that is what makes "09:00" < "10:00" as a
 *   plain string compare. Nobody says "oh nine hundred" about a bakery. The
 *   pad earns its keep everywhere the value is machine-handled and nowhere it
 *   is read, which is exactly why the split lives here and not in the store.
 *
 * WHY ONLY THE HOUR
 *   "00:30" → "0:30", never "0:3". Midnight keeps a bare "0" hour, which is
 *   what Intl renders with `hour: "numeric"`, and the minutes are never
 *   touched — a trailing "09:05" → "9:05" must not become "9:5".
 */

/**
 * Strip a leading zero from the HOUR of an "HH:MM" string.
 *
 * Non-strings pass through untouched: callers hand this whatever their data
 * gave them, and a null/undefined window must render as nothing rather than
 * as the string "null".
 *
 * @param {string} hhmm - a time of day, normally zero-padded "HH:MM"
 * @returns {string} the same value with a leading zero-hour removed
 */
export function humanTime(hhmm) {
  return typeof hhmm === "string" ? hhmm.replace(/^0(\d:)/, "$1") : hhmm;
}
