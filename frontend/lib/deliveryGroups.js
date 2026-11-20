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
 *           days per city: a city sits in each of its day groups).
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
 * @param {Array<{id?: any, city?: string, min_order?: number, delivery_day?: string, delivery_fee?: number, delivery_days?: string[] | null, zone_name?: string | null, free_delivery_above?: number | null}>} areas
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
  }));

  const missing = rows.filter((r) => r.delivery_days.length === 0);
  const distinctDays = [...new Set(rows.flatMap((r) => r.delivery_days))];

  if (distinctDays.length === 0) {
    return { mode: "flat", rows };
  }

  if (distinctDays.length === 1 && missing.length === 0) {
    return { mode: "hoist", day: distinctDays[0], rows };
  }

  // MEH-3484: a city on several days is listed under each of them.
  const groups = distinctDays.map((day) => ({
    day,
    rows: rows.filter((r) => r.delivery_days.includes(day)),
  }));
  return { mode: "group", groups, arranged: missing };
}

/** @param {{delivery_day?: string | null, delivery_days?: string[] | null}} a */
function daysOf(a) {
  const many = (a.delivery_days || []).filter(Boolean);
  if (many.length) return [...new Set(many)];
  return a.delivery_day ? [a.delivery_day] : [];
}
