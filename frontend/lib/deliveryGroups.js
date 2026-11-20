// @ts-check
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
 * History:  MEH-1305 A (creation — dispatch-day pivot); MEH-3484 (several
 *           days per city: grouped by the city's whole day set).
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
 * Row shape is preserved from the input
 * ({ id, city, min_order, delivery_day, delivery_fee }), original order kept;
 * day groups are ordered by first appearance.
 *
 * ⚠️ The map below is an EXPLICIT WHITELIST, not a spread — every field a row
 * needs downstream must be named here or it is silently dropped on the way to
 * DeliveryBlock. No error, no warning: the column exists in the API payload and
 * simply never arrives. `delivery_fee` (MEH-1772) spent two chunks in exactly
 * that state — DB column and serializer both shipped, UI still saw nothing.
 * When adding a delivery_areas column, add it here in the same PR; the
 * exact-shape assertion in deliveryGroups.test.js is what reds if you don't.
 *
 * @param {Array<{id?: any, city?: string, min_order?: number, delivery_day?: string, delivery_fee?: number, delivery_days?: string[] | null, zone_name?: string | null, free_delivery_above?: number | null, delivery_days_min?: number | null, delivery_days_max?: number | null, order_cutoff_day?: string | null, order_cutoff_time?: string | null}>} areas
 */
export function groupDeliveryAreas(areas = []) {
  const rows = areas.map((a) => ({
    id: a.id,
    city: a.city,
    min_order: a.min_order,
    delivery_day: a.delivery_day || null,
    // MEH-1794: `?? null` and never `|| null` — 0 is a real fee ("משלוח חינם"
    // to this area) and `||` would forward it as "no override, inherit".
    delivery_fee: a.delivery_fee ?? null,
    // MEH-3484: every day of the city; a row saved before the column (or a
    // fixture without it) reads its single day.
    delivery_days: daysOf(a),
    zone_name: a.zone_name ?? null,
    free_delivery_above: a.free_delivery_above ?? null,
    // MEH-3511: the zone's delivery time and own order cutoff.
    delivery_days_min: a.delivery_days_min ?? null,
    delivery_days_max: a.delivery_days_max ?? null,
    order_cutoff_day: a.order_cutoff_day ?? null,
    order_cutoff_time: a.order_cutoff_time ?? null,
  }));

  const missing = rows.filter((r) => r.delivery_days.length === 0);
  // MEH-3484: a city on several days is grouped by its whole day set
  // («שני וחמישי»), so it is listed once, not once per day.
  const labelOf = (r) => dayLabel(r.delivery_days);
  const distinctDays = [...new Set(rows.filter((r) => r.delivery_days.length).map(labelOf))];

  if (distinctDays.length === 0) {
    return { mode: "flat", rows };
  }

  if (distinctDays.length === 1 && missing.length === 0) {
    return { mode: "hoist", day: distinctDays[0], rows };
  }

  const groups = distinctDays.map((day) => ({
    day,
    rows: rows.filter((r) => r.delivery_days.length && labelOf(r) === day),
  }));
  return { mode: "group", groups, arranged: missing };
}

const DAY_LIST = new Intl.ListFormat("he", { style: "long", type: "conjunction" });

/** @param {string[]} days — one day reads as itself («שני»), two as «שני וחמישי». */
function dayLabel(days) {
  return DAY_LIST.format(days);
}

/** @param {{delivery_day?: string | null, delivery_days?: string[] | null}} a */
function daysOf(a) {
  const many = (a.delivery_days || []).filter(Boolean);
  if (many.length) return [...new Set(many)];
  return a.delivery_day ? [a.delivery_day] : [];
}
