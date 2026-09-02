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
 *           fallback semantics it mirrored). MEH-1938 chunk 5a (Contract): the
 *           Producer.lat/lng fallback is GONE — location rows are the only
 *           source of a point, matching the backend's haversine_min_km, whose
 *           COALESCE went in the same chunk. `primaryPoint()` added for the
 *           business page.
 */

// A row is map-able only when both coordinates are real numbers. `typeof` alone
// lets NaN through — it is a number — and a NaN point would poison any bounds
// test or Leaflet call downstream (rule 19).
const isUsableCoord = (value) => typeof value === "number" && !isNaN(value);

// MEH-1412: pickup + market_stand are the SECONDARY layer, hidden by the /map
// toggle. `branch` is primary.
const isSecondary = (kind) => kind === "pickup" || kind === "market_stand";

/**
 * The points a producer contributes to the map.
 *
 * Two rules, inherited from the marker loop this replaced:
 *
 * 1. A `locations[]` row counts when lat AND lng are both usable numbers.
 * 2. A secondary row (pickup / market_stand) is dropped when `includeSecondary`
 *    is false — the layer toggle.
 *
 * There is NO fallback to `Producer.lat/lng`. Until MEH-1938 chunk 5a a third
 * rule synthesised a branch point from those columns when the producer had no
 * usable row at all — the Expand overlap, mirroring the backend's
 * `haversine_min_km` COALESCE (MEH-1402). Both went in the same chunk: every
 * write path creates the row (registration MEH-1939, admin MEH-2059, import
 * MEH-2140, seeds MEH-2056) and revision 7c1e2a9f4b3d backfilled the rest, so
 * a producer without a usable row has NO point, on the map and in "near me"
 * alike. DO NOT reintroduce it here — the columns are dropped in chunk 5b.
 *
 * Each point carries `location`: the ORIGINAL row it came from. The marker
 * layer needs the whole row — `createLocationIcon` reads `precision` for the
 * approximate halo and the selected card reads `label` — so returning a
 * reduced {lat,lng,kind} would have quietly changed marker rendering. Bounds
 * consumers just use lat/lng and can ignore it.
 *
 * @param {object|null} producer  a ProducerListOut-shaped object
 * @param {{includeSecondary?: boolean}} [opts]  defaults to including secondary
 * @returns {Array<{lat: number, lng: number, kind: string|null, location: object}>}
 */
export function producerPoints(producer, { includeSecondary = true } = {}) {
  const locations = Array.isArray(producer?.locations) ? producer.locations : [];

  // Rule 1: a row is a point only with both coordinates usable.
  // Rule 2: the toggle filters what we RETURN. A business whose only usable
  // rows are hidden pickups yields [] — it stays off the map while the layer
  // is hidden, and hiddenWhenSecondaryOff() is how the UI says so.
  return locations
    .filter((loc) => isUsableCoord(loc?.lat) && isUsableCoord(loc?.lng))
    .filter((loc) => includeSecondary || !isSecondary(loc?.kind))
    .map((loc) => ({ lat: loc.lat, lng: loc.lng, kind: loc.kind ?? null, location: loc }));
}

/**
 * MEH-1938 chunk 5a: THE point that stands for "where the business is" — the
 * `is_primary` branch row, else the first branch row, never a pickup or a
 * market stand. `null` when the business has no such point.
 *
 * The business page (ProducerSections.jsx) centres its MiniMap on this and
 * gates the location section on it; before chunk 5a both read
 * `Producer.lat/lng` directly, the last two readers of the columns on a
 * consumer surface. Composes `producerPoints` with the secondary layer OFF so
 * the answer cannot drift from the map's own primary pins.
 *
 * @param {object|null} producer  a ProducerListOut-shaped object
 * @returns {{lat: number, lng: number, kind: string|null, location: object}|null}
 */
export function primaryPoint(producer) {
  const primaries = producerPoints(producer, { includeSecondary: false });
  return primaries.find((pt) => pt.location?.is_primary === true) ?? primaries[0] ?? null;
}

/**
 * MEH-2046: does this producer disappear from the map when the secondary
 * (pickup / market_stand) layer is switched off?
 *
 * True exactly when it has points today and none of them survives rule 2 —
 * i.e. every usable row it owns is a pickup or a market stand. Such a business
 * vanishes outright rather than reappearing at some other coordinate (there is
 * no fallback to fall to — MEH-1938 chunk 5a), and that is deliberate, so the
 * honest fix is to TELL the user the layer is hiding businesses rather than to
 * change the rule.
 *
 * Composes `producerPoints` twice and reads its results; it does not
 * reimplement or alter either rule. MEH-1670 semantics unchanged.
 */
export function hiddenWhenSecondaryOff(producer) {
  if (producerPoints(producer).length === 0) return false;
  return producerPoints(producer, { includeSecondary: false }).length === 0;
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
