/**
 * Module:   availability
 * Purpose:  One enum-first read of a business's availability, so every surface
 *           answers "is she available today / on vacation / full this week"
 *           from the same rule instead of four hand-rolled fallback chains.
 * Does NOT: write availability. The owner-facing writes live in
 *           backend/app/routers/producer_me.py; this is read-side only.
 * Related:  backend/app/routers/producer_me.py:604-615 (_legacy_to_state — the
 *           mapping this mirrors), lib/schemas.js:228-229 (the two legacy fields).
 * History:  MEH-1854 (creation — MEH-291 Phase 4, readers to enum-first).
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
 * Enum-first: `availability_state` wins whenever it is present. The legacy
 * fallback exists only for the MEH-291 expand-contract overlap — rows written
 * before the enum landed still carry only `availability_status` /
 * `is_available_today`, and a business whose enum is null must keep rendering
 * correctly until the backfill (chunk 2) completes.
 *
 * The legacy branch mirrors `_legacy_to_state` in
 * `backend/app/routers/producer_me.py:604-615` **including its precedence**:
 * vacation > full > is_available_today > default. Four call sites previously
 * open-coded this and three of them dropped the `"full"` rung, so a business
 * marked full-this-week on the legacy columns read as merely accepting orders.
 *
 * @param {object|null|undefined} producer
 * @returns {string} one of AVAILABILITY_STATES
 */
export function deriveAvailability(producer) {
  if (!producer) return AVAILABILITY_STATES.ACCEPTING_ORDERS;

  if (producer.availability_state) return producer.availability_state;

  if (producer.availability_status === "vacation") {
    return AVAILABILITY_STATES.ON_VACATION;
  }
  if (producer.availability_status === "full") {
    return AVAILABILITY_STATES.FULL_THIS_WEEK;
  }
  if (producer.is_available_today) return AVAILABILITY_STATES.AVAILABLE_TODAY;
  return AVAILABILITY_STATES.ACCEPTING_ORDERS;
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
