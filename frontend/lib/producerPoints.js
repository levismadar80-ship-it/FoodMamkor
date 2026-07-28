/**
 * Module:   producerPoints
 * Purpose:  Derive a producer's map-able points from its own data — the single
 *           answer to "where is this business on the map?", shared by the marker
 *           layer and the /map viewport filter so the two can never disagree.
 * Does NOT: read rendered Leaflet markers — that is MapComponent's `usablePoints`
 *           (MapComponent.jsx:346), which answers a different question ("where
 *           did we actually draw it?") and is unusable before render. Does NOT
 *           compute distance or sort; see frontend/lib/distance.js.
 * Related:  frontend/components/MapComponent.jsx (marker loop);
 *           frontend/app/[locale]/map/state/useMapFilters.js (viewport filter).
 * History:  MEH-1670 (extracted from the MapComponent marker loop, where it was
 *           the only implementation; MEH-1412 wrote it, MEH-1402 defined the
 *           fallback semantics it mirrors).
 */

// A row is map-able only when both coordinates are real numbers. `typeof` alone
// lets NaN through — it is a number — and a NaN point would poison any bounds
// test or Leaflet call downstream (rule 19).
const isUsableCoord = (value) => typeof value === "number" && !isNaN(value);

// MEH-1412: pickup + market_stand are the SECONDARY layer, hidden by the /map
// toggle. `branch` (and the synthesised Producer.lat/lng fallback) are primary.
const isSecondary = (kind) => kind === "pickup" || kind === "market_stand";

/**
 * The points a producer contributes to the map.
 *
 * Three rules, all inherited verbatim from the marker loop this replaced:
 *
 * 1. A `locations[]` row counts when lat AND lng are both usable numbers.
 * 2. A secondary row (pickup / market_stand) is dropped when `includeSecondary`
 *    is false — the layer toggle.
 * 3. The `Producer.lat/lng` fallback fires ONLY when the producer had no usable
 *    location row **at all**. Crucially that is judged BEFORE rule 2, so a
 *    business whose only points are hidden pickups yields `[]` rather than
 *    reappearing at its own coordinates. This mirrors the backend's
 *    `haversine_min_km` COALESCE (MEH-1402).
 *
 * Each point carries `location`: the ORIGINAL row it came from (or, for the
 * fallback, the synthesised branch row the marker loop used to build inline).
 * The marker layer needs the whole row — `createLocationIcon` reads `precision`
 * for the approximate halo and the selected card reads `label` — so returning a
 * reduced {lat,lng,kind} would have quietly changed marker rendering. Bounds
 * consumers just use lat/lng and can ignore it.
 *
 * @param {object|null} producer  a ProducerListOut-shaped object
 * @param {{includeSecondary?: boolean}} [opts]  defaults to including secondary
 * @returns {Array<{lat: number, lng: number, kind: string|null, location: object}>}
 */
export function producerPoints(producer, { includeSecondary = true } = {}) {
  const locations = Array.isArray(producer?.locations) ? producer.locations : [];

  // Rule 1 + 3: "had a usable row" is decided across ALL rows, toggle-blind.
  const usable = locations.filter((loc) => isUsableCoord(loc?.lat) && isUsableCoord(loc?.lng));

  if (usable.length > 0) {
    // Rule 2 applies only to what we RETURN, never to the fallback decision.
    return usable
      .filter((loc) => includeSecondary || !isSecondary(loc?.kind))
      .map((loc) => ({ lat: loc.lat, lng: loc.lng, kind: loc.kind ?? null, location: loc }));
  }

  // Rule 3: no usable row anywhere → the producer's own mirrored point, if any.
  // The row shape is byte-for-byte what MapComponent's inline fallback built.
  if (isUsableCoord(producer?.lat) && isUsableCoord(producer?.lng)) {
    const synthesized = {
      kind: "branch",
      is_primary: true,
      lat: producer.lat,
      lng: producer.lng,
      precision: "exact",
      label: null,
    };
    return [{ lat: producer.lat, lng: producer.lng, kind: "branch", location: synthesized }];
  }

  return [];
}

/**
 * Is any of the producer's points inside `bounds`?
 *
 * `bounds` is the /map `committedBounds` shape ({north, south, east, west}).
 * A producer with zero points is never inside anything — which is how a
 * delivery-only business with its pickup layer hidden leaves the list at the
 * same moment it leaves the map (Sapir, 27/07: the two must agree).
 */
export function producerInBounds(producer, bounds, opts) {
  if (!bounds) return true; // no committed viewport → no filtering
  return producerPoints(producer, opts).some(
    (pt) =>
      pt.lat >= bounds.south &&
      pt.lat <= bounds.north &&
      pt.lng >= bounds.west &&
      pt.lng <= bounds.east,
  );
}
