/**
 * Module:   delivery-days
 * Purpose:  The canonical delivery-day vocabulary — bare Hebrew day names, the
 *           exact values the backend whitelist accepts on DeliveryArea writes.
 * Does NOT: translate for display (labels come from i18n at the call site) or
 *           validate — the backend DeliveryDayField is the authority; this is
 *           its frontend mirror so selects offer only storable values.
 * Related:  backend/app/schemas/schemas.py (DELIVERY_DAYS + DeliveryDayField —
 *           keep byte-identical), app/[locale]/producer/dashboard/edit/cards.jsx
 *           (DeliveryCard day select).
 * History:  MEH-1644 — structured delivery-day capture.
 */

// REUSES: backend/app/schemas/schemas.py DELIVERY_DAYS — same order (sun→sat),
// same bare form (no "יום" prefix; composes with "יוצאים בימי {day}").
export const DELIVERY_DAYS = [
  "ראשון",
  "שני",
  "שלישי",
  "רביעי",
  "חמישי",
  "שישי",
  "שבת",
];
