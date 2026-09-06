/**
 * Module:   availability
 * Purpose:  One enum-first read of a business's availability, so every surface
 *           answers "is she available today / on vacation / full this week"
 *           from the same rule instead of four hand-rolled fallback chains.
 * Does NOT: write availability. The owner-facing writes live in
 *           backend/app/routers/producer_me.py; this is read-side only.
 * Related:  backend/app/schemas/schemas.py (state_to_legacy — the derivation
 *           that now produces the legacy pair server-side), lib/schemas.js
 *           (the two legacy Zod fields, removed by MEH-2272).
 * History:  MEH-1854 (creation — MEH-291 Phase 4, readers to enum-first) ·
 *           MEH-2271 (chunk 3a — legacy fallback removed; the enum is the
 *           only thing written and the only thing read).
 */

/** The canonical 4-state enum. `availability_state` on the API. */
export const AVAILABILITY_STATES = Object.freeze({
  ACCEPTING_ORDERS: "accepting_orders",
  AVAILABLE_TODAY: "available_today",
  FULL_THIS_WEEK: "full_this_week",
  ON_VACATION: "on_vacation",
});

/**
 * Derive the canonical availability state for a producer.
 *
 * Enum-only as of MEH-2271. `availability_state` is `NOT NULL` in the DB with
 * a server default, and every API surface that serves a producer now derives
 * the legacy pair FROM it rather than the other way round — so a row whose
 * enum is absent no longer exists, and a fallback onto `availability_status` /
 * `is_available_today` would be reading a value the server computed from the
 * enum one step earlier.
 *
 * The removed fallback was not dead weight while it lived: it mirrored
 * `_legacy_to_state`'s precedence (vacation > full > is_available_today >
 * default), and three of the four call sites it replaced had dropped the
 * `"full"` rung, so a business marked full-this-week read as merely accepting
 * orders. That bug is fixed by the enum being authoritative, not by the chain.
 *
 * The `||` default below covers only a missing/empty value — an undefined
 * producer, or a fixture that omits the field.
 *
 * @param {object|null|undefined} producer
 * @returns {string} one of AVAILABILITY_STATES
 */
export function deriveAvailability(producer) {
  return producer?.availability_state || AVAILABILITY_STATES.ACCEPTING_ORDERS;
}

/** True when the business is taking orders for today specifically. */
export function isAvailableToday(producer) {
  return deriveAvailability(producer) === AVAILABILITY_STATES.AVAILABLE_TODAY;
}

/** True when the business is on vacation. */
export function isOnVacation(producer) {
  return deriveAvailability(producer) === AVAILABILITY_STATES.ON_VACATION;
}

/** True when the business is full for this week. */
export function isFullThisWeek(producer) {
  return deriveAvailability(producer) === AVAILABILITY_STATES.FULL_THIS_WEEK;
}
