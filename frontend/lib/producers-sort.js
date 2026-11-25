// @ts-check

/**
 * Module:   producers-sort
 * Purpose:  The /producers sort axis (?sort=): which values are legal, how a
 *           URL value is read, and what each sends to the API.
 * Does NOT: render the select or refetch — components/ProducersClient.jsx.
 * History:  MEH-1483, MEH-1864, MEH-2294 (the axis); MEH-3810 (moved here out
 *           of ProducersClient.jsx, unchanged, to keep that file under the
 *           1,500-line cap).
 */

// MEH-1483: the backend-driven sort axis (?sort=). "newest" is the default —
// omitted from the request so the default listing stays byte-identical to
// today's created_at-DESC order; "rating" maps to the backend's avg_rating
// nulls-last ordering. Two options only (over-engineering guard).
export const SORT_DEFAULT = "newest";
const SORT_VALUES = ["newest", "rating"];
// MEH-1864: "rating" is only a legal axis once the catalog actually has
// reviewed businesses (RATING_SORT_THRESHOLD, lib/rating-gate.js). Below the
// threshold the option is not rendered, and a hand-typed ?sort=rating degrades
// to the default here — the backend still answers that URL with 200, the
// frontend just doesn't present an ordering with no data behind it.
// MEH-2294: "distance" (nearest-first, backend MEH-1829 #3538) is legal only
// while the visitor has a location fix (useUserLocation) — the backend 422s a
// sort=distance without lat+lng, and has no origin to measure from anyway. No
// radius is ever sent: sorting reorders, it never hides a row.
export const SORT_DISTANCE = "distance";
export function sortValuesFor(ratingSortEnabled, hasLocation = false) {
  const values = ratingSortEnabled ? [...SORT_VALUES] : [SORT_DEFAULT];
  if (hasLocation) values.push(SORT_DISTANCE);
  return values;
}
export function initSortFromParams(searchParams, ratingSortEnabled) {
  const s = searchParams.get("sort");
  // unknown (or gated-off) → default. MEH-2294: a ?sort=distance deep-link is
  // KEPT here even though the location is unknown on the first render
  // (useUserLocation hydrates in an effect); until a fix arrives the effective
  // order is the default — see `effectiveSort` in the component.
  return sortValuesFor(ratingSortEnabled, true).includes(s) ? s : SORT_DEFAULT;
}
// MEH-2294: the request params for one sort axis. {} at the default (byte-
// identical to the pre-sort listing); distance without a fix also → {}.
export function sortRequestParams(sort, loc) {
  if (sort === SORT_DEFAULT) return {};
  if (sort === SORT_DISTANCE) return loc ? { sort, lat: loc.lat, lng: loc.lng } : {};
  return { sort };
}
