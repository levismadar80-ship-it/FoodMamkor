/**
 * Module:   availability
 * Purpose:  One enum-first read of a business's availability, so every surface
 *           answers "is this business on vacation"
 *           from the same rule instead of four hand-rolled fallback chains.
 * Does NOT: write availability. The owner-facing writes live in
 *           backend/app/routers/producer_me.py; this is read-side only.
 * Related:  lib/schemas.js (`availability_state`, the only availability
 *           field in the contract); __tests__/LegacyAvailabilityFieldsGone.test.js.
 * History:  MEH-1854 (creation — MEH-291 Phase 4, readers to enum-first) ·
 *           MEH-2271 (chunk 3a — legacy fallback removed; the enum is the
 *           only thing written and the only thing read) · MEH-2272 (the
 *           legacy pair and the server's state_to_legacy removed) ·
 *           MEH-2782 (available_today / full_this_week removed).
 */

/**
 * The canonical enum, `availability_state` on the API. Pause-only since
 * MEH-2782: «זמין היום» and «עמוס השבוע» were removed end to end.
 */
export const AVAILABILITY_STATES = Object.freeze({
  ACCEPTING_ORDERS: "accepting_orders",
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

/** True when the business is on vacation. */
export function isOnVacation(producer) {
  return deriveAvailability(producer) === AVAILABILITY_STATES.ON_VACATION;
}
