/**
 * Module:   map-view-state
 * Purpose:  MEH-1414 — persist the /map camera (center + zoom) across
 *           navigation so back-navigation from a producer page lands on the
 *           spot the visitor left, not the MEH-932 default. NN/g
 *           "Designing Scroll Behavior": pogo-sticking between a routing page
 *           and a detail page loses the place when the routing page resets.
 * Touches:  sessionStorage["map_view_state"] only. Read/write helpers are pure
 *           over an injectable storage so they unit-test without a browser.
 * MEH-2049: the same record also holds the selected business (writeMapSelection
 *           / readMapSelection), so the card reopens on the way back.
 * Does NOT: touch filters, URL params, or the default camera. A fresh visit
 *           (nothing saved, or saved more than 30 minutes ago) reads null and
 *           the map falls through to its default exactly as before.
 * Related:  components/MapComponent.jsx (the only writer + the reader on
 *           init) · components/MapProducerCard.jsx (appends ?from=map) ·
 *           app/[locale]/producer/[id]/ProducerDetail.jsx (the back link).
 *           Hydration lesson MEH-517: callers read this INSIDE useEffect,
 *           never in render or a useState initializer.
 */

export const MAP_VIEW_STATE_KEY = "map_view_state";
export const MAP_VIEW_STATE_TTL_MS = 30 * 60 * 1000;
/** The `?from=` value map links carry — the producer page keys its back link on it. */
export const MAP_REFERRER = "map";

function resolveStorage(storage) {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    // Storage access can throw (privacy mode, blocked site data) — treat as absent.
    return null;
  }
}

const LAT_MAX = 90;
const LNG_MAX = 180;
const ZOOM_MAX = 22;
const isFiniteNumber = (n) => typeof n === "number" && Number.isFinite(n);
const allFinite = (values) => values.every((n) => isFiniteNumber(n));

/**
 * @returns {{lat:number,lng:number,zoom:number}|null} the saved camera when it
 * is well-formed and fresher than the TTL; null in every other case.
 */
export function readMapViewState({ storage, now = Date.now() } = {}) {
  const store = resolveStorage(storage);
  if (!store) return null;
  let raw;
  try {
    raw = store.getItem(MAP_VIEW_STATE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const { lat, lng, zoom, ts } = parsed || {};
  if (!allFinite([lat, lng, zoom, ts])) return null;
  const age = now - ts;
  if (age < 0 || age > MAP_VIEW_STATE_TTL_MS) return null;
  if (Math.abs(lat) > LAT_MAX || Math.abs(lng) > LNG_MAX || zoom < 0 || zoom > ZOOM_MAX) return null;
  return { lat, lng, zoom };
}

// MEH-2049: the record also carries the selected business (+ which of its
// points), so back-navigation reopens the same card. Read the raw record to
// carry those fields across camera writes — but ONLY while it is fresh: a
// stale record is treated as absent, so a later write can never revive an
// expired selection (or camera) with a new timestamp.
function readRaw(store, now) {
  try {
    const record = JSON.parse(store.getItem(MAP_VIEW_STATE_KEY) || "null") || null;
    if (!record || !isFiniteNumber(record.ts)) return null;
    const age = now - record.ts;
    return age < 0 || age > MAP_VIEW_STATE_TTL_MS ? null : record;
  } catch {
    return null;
  }
}

function selectionOf(record) {
  if (!record || record.selectedId == null || record.selectedId === "") return {};
  return { selectedId: record.selectedId, selectedLocationId: record.selectedLocationId ?? null };
}

/** @returns {boolean} whether the write happened. Keeps a stored selection. */
export function writeMapViewState({ lat, lng, zoom }, { storage, now = Date.now() } = {}) {
  const store = resolveStorage(storage);
  if (!store) return false;
  if (!allFinite([lat, lng, zoom])) return false;
  try {
    const keep = selectionOf(readRaw(store, now));
    store.setItem(MAP_VIEW_STATE_KEY, JSON.stringify({ lat, lng, zoom, ts: now, ...keep }));
    return true;
  } catch {
    return false;
  }
}

/**
 * MEH-2049: remember (or, with a null id, forget) the selected business in the
 * same record, under the same TTL. A selection needs a camera to come back
 * to: the saved one, else `camera` (the map on screen right now — a pick that
 * does not move the map writes no camera of its own). With neither, nothing
 * is written.
 * @returns {boolean} whether the write happened.
 */
export function writeMapSelection(selectedId, selectedLocationId = null, { storage, now = Date.now(), camera = null } = {}) {
  const store = resolveStorage(storage);
  if (!store) return false;
  let record = readRaw(store, now);
  if (!record || !allFinite([record.lat, record.lng, record.zoom])) {
    if (!camera || !allFinite([camera.lat, camera.lng, camera.zoom])) return false;
    record = { lat: camera.lat, lng: camera.lng, zoom: camera.zoom };
  }
  const { selectedId: _a, selectedLocationId: _b, ...saved } = record;
  const next = selectedId == null || selectedId === ""
    ? { ...saved, ts: now }
    : { ...saved, ts: now, selectedId, selectedLocationId: selectedLocationId ?? null };
  try {
    store.setItem(MAP_VIEW_STATE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

/**
 * @returns {{producerId:(string|number), locationId:(string|number|null)}|null}
 * the stored selection when the record is valid and fresh; null otherwise.
 */
export function readMapSelection({ storage, now = Date.now() } = {}) {
  const store = resolveStorage(storage);
  if (!store) return null;
  if (!readMapViewState({ storage: store, now })) return null;
  const sel = selectionOf(readRaw(store, now));
  if (sel.selectedId == null) return null;
  return { producerId: sel.selectedId, locationId: sel.selectedLocationId };
}
