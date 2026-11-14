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
  // rows are hidden pickups yields []. /map no longer offers a layer toggle
  // (Sapir 13/11), so callers there always pass the default `true`.
  return locations
    .filter((loc) => isUsableCoord(loc?.lat) && isUsableCoord(loc?.lng))
    .filter((loc) => includeSecondary || !isSecondary(loc?.kind))
    .map((loc) => ({ lat: loc.lat, lng: loc.lng, kind: loc.kind ?? null, location: loc }));
}

/**
 * MEH-3054 (option ה׳, Sapir 13/11): the points /map DRAWS for a business.
 *
 * One pin per business by default, so ten businesses with five pickup points
 * each read as ten pins, not sixty (a business may hold up to 20 locations,
 * backend/app/limits.py:32, with no separate pickup cap):
 *
 * - `expanded` false (default): every usable NON-secondary row (a branch is a
 *   real store, and a business with two stores shows both). When the business
 *   has no usable non-secondary row at all — pickup-only — its FIRST usable
 *   secondary row stands in, so it never vanishes from the map. That vanishing
 *   is what the removed layer toggle's reminder existed for (MEH-3045).
 * - `expanded` true: every usable row, as `producerPoints()` returns them. /map
 *   expands one business when it is selected, and all of them while the
 *   «איסוף עצמי» chip (`pickup_points`) is on.
 *
 * The viewport list filter uses the same function with the same `expanded`
 * flag as the marker layer, so a card is in the list exactly when one of its
 * drawn pins is on screen (Sapir 27/07: the two must agree). Selecting a
 * business does not change the list, so selection is not an input there.
 *
 * @param {object|null} producer  a ProducerListOut-shaped object
 * @param {{expanded?: boolean}} [opts]
 * @returns {Array<{lat: number, lng: number, kind: string|null, location: object}>}
 */
export function mapPinPoints(producer, { expanded = false } = {}) {
  const all = producerPoints(producer);
  if (expanded) return all;
  const main = all.filter((pt) => !isSecondary(pt.kind));
  if (main.length > 0) return main;
  return all.slice(0, 1);
}

/**
 * MEH-1938 chunk 5a: THE point that stands for "where the business is" — the
 * row flagged `is_primary`, with usable coordinates. `null` otherwise.
 *
 * STRICT, by ruling (Sapir, 02/09): no "else the first branch row". The
 * backend derives `ProducerListOut.lat/lng` from the `is_primary` row or
 * None (schemas.py, `_derive_lat_lng_from_primary_location`), and this is the
 * same rule in JavaScript, so one business cannot render on the map here and
 * carry null coordinates in the API.
 *
 * Kind-agnostic: a pickup flagged primary is wrong data that should show up,
 * not be silently skipped. That stays true — and note it is about the READ
 * side only. Which kinds may BE promoted is a separate, stricter rule on the
 * write path (branch only); this function reports whatever is flagged.
 *
 * "No primary at all" is TWO cases, not one (refined by Sapir, 02/09 — the
 * earlier wording collapsed them):
 *
 *   - `has_physical_location !== false` + rows + no primary → a DATA DEFECT
 *     (the single-primary invariant is application-level; there is no DB
 *     unique on it). Returns null so it stays visible as one, rather than
 *     being papered over by a guess.
 *   - `has_physical_location === false` → null is CORRECT, not a defect. That
 *     flag is the owner's explicit MEH-213 declaration that the business has
 *     no physical presence; pinning her pickup point would tell a visitor
 *     "the business is here", which is false. No pin, no navigation target —
 *     pickup points belong to the secondary layer.
 *
 * `submission_gate._has_location` (submission_gate.py:97) has kept exactly
 * this split for the same reason throughout the epic.
 *
 * The business page (ProducerSections.jsx) centres its MiniMap on this and
 * gates the location section on it; JSON-LD geo (seo.js) reads it too. Before
 * chunk 5a those read `Producer.lat/lng` directly.
 *
 * @param {object|null} producer  a ProducerListOut-shaped object
 * @returns {{lat: number, lng: number, kind: string|null, location: object}|null}
 */
export function primaryPoint(producer) {
  return producerPoints(producer).find((pt) => pt.location?.is_primary === true) ?? null;
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
  // MEH-3054: `opts.pins` → test the pins /map draws (mapPinPoints), not every
  // row; `opts.expanded` is passed through to it.
  const points = opts?.pins ? mapPinPoints(producer, opts) : producerPoints(producer, opts);
  return points.some(
    (pt) =>
      pt.lat >= bounds.south &&
      pt.lat <= bounds.north &&
      pt.lng >= bounds.west &&
      pt.lng <= bounds.east,
  );
}
