// @ts-check
/**
 * Module:   delivery-time
 * Purpose:  Which «מגיע תוך … ימי עסקים» line a delivery time reads as
 *           (MEH-3511): a range «3–5», an upper bound only «עד 5», or one
 *           number. Returns an i18n key + values; the caller translates.
 * Touches:  nothing — pure.
 * Does NOT: validate (backend app/schemas/delivery_time.py: 1..30, low ≤ high)
 *           or pick the zone-vs-business value (the caller passes the row
 *           first, the business second — the same inheritance the server
 *           states in its column comments).
 * Related:  components/DeliveryTerms.jsx (renders it).
 * History:  MEH-3511 (creation).
 */

/** @param {unknown} v @returns {number | null} */
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * @param {number | null | undefined} low @param {number | null | undefined} high
 * @returns {{ key: string, values: Record<string, number> } | null}
 */
export function deliveryTimeMessage(low, high) {
  const lo = num(low);
  const hi = num(high);
  if (lo === null && hi === null) return null;
  if (lo === null && hi !== null) return { key: "business_days_upto", values: { max: hi } };
  if (hi === null || lo === hi) return { key: "business_days_exact", values: { days: /** @type {number} */ (lo) } };
  return { key: "business_days_range", values: { min: /** @type {number} */ (lo), max: hi } };
}

