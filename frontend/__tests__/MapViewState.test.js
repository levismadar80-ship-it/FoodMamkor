/**
 * MEH-1414 — lib/map-view-state.js: the /map camera persistence helpers.
 * Pure over an injectable storage, so every branch is exercised without a
 * browser: fresh / stale / future timestamps, malformed JSON, non-finite or
 * out-of-range numbers, absent storage (SSR), and a storage that throws.
 */
import { describe, it, expect, vi } from "vitest";
import {
  MAP_VIEW_STATE_KEY,
  MAP_VIEW_STATE_TTL_MS,
  MAP_REFERRER,
  readMapViewState,
  writeMapViewState,
} from "../lib/map-view-state.js";

function memoryStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    dump: () => Object.fromEntries(m),
  };
}

const NOW = 1_800_000_000_000;
const view = { lat: 31.25, lng: 34.79, zoom: 12 };

describe("writeMapViewState → readMapViewState round-trip", () => {
  it("restores exactly what was written while the entry is fresh", () => {
    const storage = memoryStorage();
    expect(writeMapViewState(view, { storage, now: NOW })).toBe(true);
    expect(JSON.parse(storage.dump()[MAP_VIEW_STATE_KEY])).toEqual({ ...view, ts: NOW });
    expect(readMapViewState({ storage, now: NOW + 5 * 60 * 1000 })).toEqual(view);
  });

  it("reads null once the entry is older than the TTL — the fresh-visit default wins", () => {
    const storage = memoryStorage();
    writeMapViewState(view, { storage, now: NOW });
    // Control: one ms inside the TTL still restores, so the boundary is the TTL and not something else.
    expect(readMapViewState({ storage, now: NOW + MAP_VIEW_STATE_TTL_MS })).toEqual(view);
    expect(readMapViewState({ storage, now: NOW + MAP_VIEW_STATE_TTL_MS + 1 })).toBeNull();
  });

  it("reads null for a timestamp in the future (clock skew is not a fresh camera)", () => {
    const storage = memoryStorage();
    writeMapViewState(view, { storage, now: NOW + 1000 });
    expect(readMapViewState({ storage, now: NOW })).toBeNull();
  });
});

describe("readMapViewState rejects what it cannot trust", () => {
  it.each([
    ["missing key", {}],
    ["malformed JSON", { [MAP_VIEW_STATE_KEY]: "{not json" }],
    ["non-object", { [MAP_VIEW_STATE_KEY]: "42" }],
    ["NaN lat", { [MAP_VIEW_STATE_KEY]: JSON.stringify({ lat: "31", lng: 34.7, zoom: 10, ts: NOW }) }],
    ["missing zoom", { [MAP_VIEW_STATE_KEY]: JSON.stringify({ lat: 31, lng: 34.7, ts: NOW }) }],
    ["lat out of range", { [MAP_VIEW_STATE_KEY]: JSON.stringify({ lat: 91, lng: 34.7, zoom: 10, ts: NOW }) }],
    ["lng out of range", { [MAP_VIEW_STATE_KEY]: JSON.stringify({ lat: 31, lng: 181, zoom: 10, ts: NOW }) }],
    ["zoom out of range", { [MAP_VIEW_STATE_KEY]: JSON.stringify({ lat: 31, lng: 34.7, zoom: 23, ts: NOW }) }],
  ])("%s → null", (_label, initial) => {
    expect(readMapViewState({ storage: memoryStorage(initial), now: NOW })).toBeNull();
  });

  it("returns null when storage is absent (SSR) and false on write", () => {
    // `storage: null` is coerced to the window fallback; under jsdom that
    // exists, so pass a stub whose accessors throw to model a blocked store.
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readMapViewState({ storage: throwing, now: NOW })).toBeNull();
    expect(writeMapViewState(view, { storage: throwing, now: NOW })).toBe(false);
  });

  it("refuses to write a non-finite camera", () => {
    const storage = memoryStorage();
    expect(writeMapViewState({ lat: NaN, lng: 34.7, zoom: 10 }, { storage, now: NOW })).toBe(false);
    expect(storage.dump()).toEqual({});
  });
});

describe("window fallback", () => {
  it("uses window.sessionStorage when no storage is injected", () => {
    const spy = vi.spyOn(window.sessionStorage.__proto__, "getItem").mockReturnValue(
      JSON.stringify({ ...view, ts: NOW }),
    );
    expect(readMapViewState({ now: NOW + 1 })).toEqual(view);
    expect(spy).toHaveBeenCalledWith(MAP_VIEW_STATE_KEY);
    spy.mockRestore();
  });
});

describe("MAP_REFERRER", () => {
  it("is the token MapProducerCard appends and ProducerDetail keys on", () => {
    expect(MAP_REFERRER).toBe("map");
  });
});
