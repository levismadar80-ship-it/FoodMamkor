/**
 * Module:   order-window
 * Purpose:  Convert between the backend `producers.order_window` JSONB shape
 *           ({"sunday": {open, close}, …}) and the 7-row editor model the
 *           dashboard renders, plus the client-side mirror of the backend's
 *           close>open rule.
 * Does NOT: derive "open now" — that is the public page's job (MEH-1546,
 *           lib/orderWindow status helper). Nothing here reads the clock.
 * Related:  frontend/lib/hours-serialize.js (same day-row model for the
 *           free-text opening_hours axis — deliberately NOT shared: that one
 *           serializes to a string, this one to a JSON object),
 *           backend/app/schemas/schemas.py:16 (_order_window_validator — the
 *           authority these rules mirror).
 * History:  MEH-1544 — dashboard order-window editor (chunk 2/3).
 */

// Storage keys, index-aligned with lib/hours.js DAY_KEYS (sun…sat) so a row
// index means the same weekday on both axes. The backend accepts any subset of
// these seven; a day absent = orders closed that day.
// REUSES: backend/app/schemas/schemas.py:22 (_ORDER_WINDOW_DAYS) — same order.
export const ORDER_WINDOW_DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export const DEFAULT_ORDER_OPEN = "09:00";
export const DEFAULT_ORDER_CLOSE = "14:00";

// Zero-padded 24h — mirrors the backend regex so the client rejects the same
// strings the API would 422 on. `<input type="time">` already emits this shape;
// the guard matters for a value loaded from an older/hand-edited record.
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A closed row carrying the default times, so toggling it on is one click. */
export function emptyOrderDay() {
  return { open: false, from: DEFAULT_ORDER_OPEN, to: DEFAULT_ORDER_CLOSE };
}

/**
 * order_window object → 7 editor rows. `null`/`undefined`/`{}` (the
 * feature-unused state) yields seven closed rows. Unknown day keys and
 * malformed times are ignored rather than thrown — a corrupt stored value
 * should still open an editable form, not blank the dashboard.
 */
export function daysFromOrderWindow(orderWindow) {
  return ORDER_WINDOW_DAYS.map((key) => {
    const entry = orderWindow?.[key];
    if (!entry || !HHMM.test(entry.open ?? "") || !HHMM.test(entry.close ?? "")) {
      return emptyOrderDay();
    }
    return { open: true, from: entry.open, to: entry.close };
  });
}

/**
 * 7 editor rows → the order_window payload. Returns `null` when no day is
 * open, which is exactly the "clear the field" body the backend expects
 * (explicit null clears; see producer_me PUT).
 */
export function serializeOrderWindow(days) {
  const out = {};
  days.forEach((day, i) => {
    if (day?.open) out[ORDER_WINDOW_DAYS[i]] = { open: day.from, close: day.to };
  });
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Indices of open rows whose close is not strictly after open — the client
 * mirror of the backend's close>open rule. String compare is valid because
 * both values are zero-padded HH:MM. A malformed time also counts as invalid
 * so the row is flagged before the API rejects it.
 */
export function invalidOrderDayIndices(days) {
  const bad = [];
  days.forEach((day, i) => {
    if (!day?.open) return;
    if (!HHMM.test(day.from) || !HHMM.test(day.to) || day.to <= day.from) bad.push(i);
  });
  return bad;
}
