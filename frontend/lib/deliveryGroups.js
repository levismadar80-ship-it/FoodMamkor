/**
 * Module:   deliveryGroups
 * Purpose:  Pivot a producer's delivery_areas by dispatch day (MEH-1305 A) so
 *           a shared "יוצאים בימי שישי" is stated ONCE instead of repeating on
 *           every city row (the differentiator — the per-city minimum — was
 *           being drowned out). Riverford/Wolt idiom: shared info once at the
 *           business level.
 * Touches:  nothing — pure function, no React/i18n/I-O.
 * Does NOT: render or translate. DeliveryBlock.jsx maps the returned mode to
 *           JSX + i18n; nationwide / arranged (no-areas) states never reach here.
 * Related:  frontend/components/DeliveryBlock.jsx (sole consumer).
 * History:  MEH-1305 A (creation — dispatch-day pivot).
 */

/**
 * Group delivery_areas into one of three display modes:
 *
 *   hoist  — every row shares ONE dispatch day → the day is hoisted to a
 *            heading subline; rows carry city ↔ minimum only.
 *   group  — 2+ distinct days, OR one day with some dayless rows → one group
 *            per day (day as the group header) + an "arranged" group at the end
 *            for rows with no day.
 *   flat   — no row carries a day at all → plain city ↔ minimum rows.
 *
 * Row shape is preserved from the input ({ id, city, min_order, delivery_day }),
 * original order kept; day groups are ordered by first appearance.
 *
 * @param {Array<{id?: any, city?: string, min_order?: number, delivery_day?: string}>} areas
 */
export function groupDeliveryAreas(areas = []) {
  const rows = areas.map((a) => ({
    id: a.id,
    city: a.city,
    min_order: a.min_order,
    delivery_day: a.delivery_day || null,
  }));

  const missing = rows.filter((r) => !r.delivery_day);
  const distinctDays = [...new Set(rows.filter((r) => r.delivery_day).map((r) => r.delivery_day))];

  if (distinctDays.length === 0) {
    return { mode: "flat", rows };
  }

  if (distinctDays.length === 1 && missing.length === 0) {
    return { mode: "hoist", day: distinctDays[0], rows };
  }

  const groups = distinctDays.map((day) => ({
    day,
    rows: rows.filter((r) => r.delivery_day === day),
  }));
  return { mode: "group", groups, arranged: missing };
}
