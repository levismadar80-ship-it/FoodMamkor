import { describe, it, expect } from "vitest";
import { producerPoints, producerInBounds } from "@/lib/producerPoints";

// producerPoints also returns `location` (the source row, needed by the marker
// layer). These helpers assert the coordinate triple without restating it.
const coords = (pts) => pts.map(({ lat, lng, kind }) => ({ lat, lng, kind }));

// MEH-1670: the single point-derivation, extracted from the MapComponent marker
// loop so the map and the /map list cannot disagree about where a business is.
//
// The rules under test are the marker loop's, verbatim (MapComponent.jsx:844-865):
// a row counts when both coords are usable numbers; pickup/market_stand drop out
// when the secondary layer is off; and the Producer.lat/lng fallback fires ONLY
// when no usable row existed at all — judged BEFORE the toggle, so a business
// whose only points are hidden pickups stays off the map instead of reappearing
// at its own coordinates.

const PICKUP = { kind: "pickup", lat: 32.519, lng: 34.953 };
const BRANCH = { kind: "branch", lat: 32.5732, lng: 34.9519 };

// Israel-band box containing both points above.
const BOUNDS = { south: 32.4, north: 32.7, west: 34.8, east: 35.1 };
// Same size, far south — contains neither.
const FAR = { south: 31.0, north: 31.2, west: 34.8, east: 35.1 };

describe("producerPoints — derivation (MEH-1670)", () => {
  it("returns a locations[] point when Producer.lat/lng are NULL (the MEH-1402 delivery-only shape)", () => {
    expect(coords(producerPoints({ lat: null, lng: null, locations: [PICKUP] }))).toEqual([
      { lat: 32.519, lng: 34.953, kind: "pickup" },
    ]);
  });

  it("returns every usable point for a multi-location producer", () => {
    const pts = producerPoints({ lat: 32.5732, lng: 34.9519, locations: [BRANCH, PICKUP] });
    expect(pts).toHaveLength(2);
    expect(pts.map((p) => p.kind)).toEqual(["branch", "pickup"]);
  });

  it("falls back to Producer.lat/lng when locations[] is empty", () => {
    expect(coords(producerPoints({ lat: 32.08, lng: 34.78, locations: [] }))).toEqual([
      { lat: 32.08, lng: 34.78, kind: "branch" },
    ]);
  });

  it("falls back when every location row is coord-invalid", () => {
    expect(
      coords(producerPoints({ lat: 32.08, lng: 34.78, locations: [{ kind: "pickup", lat: null, lng: 34.9 }] })),
    ).toEqual([{ lat: 32.08, lng: 34.78, kind: "branch" }]);
  });

  it("returns [] for a producer with neither usable locations nor own coords", () => {
    expect(producerPoints({ lat: null, lng: null, locations: [] })).toEqual([]);
  });

  it("drops secondary points when the layer is off", () => {
    const pts = producerPoints({ lat: null, lng: null, locations: [BRANCH, PICKUP] }, { includeSecondary: false });
    expect(coords(pts)).toEqual([{ lat: 32.5732, lng: 34.9519, kind: "branch" }]);
  });

  // The rule that is easy to get backwards, and the reason the fallback is
  // decided before the toggle filter rather than after.
  it("does NOT fall back to Producer.lat/lng when the only points are hidden pickups", () => {
    expect(
      producerPoints({ lat: 32.08, lng: 34.78, locations: [PICKUP] }, { includeSecondary: false }),
    ).toEqual([]);
  });

  it("treats a missing/!array locations field as empty", () => {
    expect(producerPoints({ lat: 32.08, lng: 34.78 })).toHaveLength(1);
    expect(producerPoints({ lat: 32.08, lng: 34.78, locations: null })).toHaveLength(1);
    expect(producerPoints(null)).toEqual([]);
  });

  // --- NaN equivalence, pinned rather than argued (Sapir, 27/07) ---
  //
  // The predicate this replaced excluded a NaN-coord producer only by accident:
  // `NaN >= south` is false, so every comparison failed. The shared derivation
  // excludes it on purpose, at the source. Same outcome, different path — these
  // two cases are what make that equivalence a fact instead of a claim.
  it("NaN coords and no other point → no points at all", () => {
    expect(producerPoints({ lat: NaN, lng: NaN, locations: [] })).toEqual([]);
    expect(producerPoints({ lat: NaN, lng: 34.9, locations: [] })).toEqual([]);
  });

  it("a NaN row alongside a valid row keeps the valid one", () => {
    const pts = producerPoints({
      lat: null,
      lng: null,
      locations: [{ kind: "pickup", lat: NaN, lng: NaN }, PICKUP],
    });
    expect(coords(pts)).toEqual([{ lat: 32.519, lng: 34.953, kind: "pickup" }]);
  });
});

describe("producerInBounds — viewport predicate (MEH-1670)", () => {
  it("includes a delivery-only producer whose pickup point is inside bounds", () => {
    expect(producerInBounds({ lat: null, lng: null, locations: [PICKUP] }, BOUNDS)).toBe(true);
  });

  it("excludes a producer whose every point is outside bounds", () => {
    expect(producerInBounds({ lat: null, lng: null, locations: [PICKUP] }, FAR)).toBe(false);
  });

  it("includes a multi-location producer when only ONE point is inside", () => {
    const p = { lat: null, lng: null, locations: [{ kind: "branch", lat: 29.5, lng: 34.9 }, PICKUP] };
    expect(producerInBounds(p, BOUNDS)).toBe(true);
  });

  it("is unchanged for a producer with own coords and empty locations[]", () => {
    expect(producerInBounds({ lat: 32.5, lng: 34.9, locations: [] }, BOUNDS)).toBe(true);
    expect(producerInBounds({ lat: 32.5, lng: 34.9, locations: [] }, FAR)).toBe(false);
  });

  it("excludes a hidden-pickup-only producer, matching it being off the map", () => {
    const p = { lat: 32.5, lng: 34.9, locations: [PICKUP] };
    expect(producerInBounds(p, BOUNDS, { includeSecondary: true })).toBe(true);
    expect(producerInBounds(p, BOUNDS, { includeSecondary: false })).toBe(false);
  });

  // Same NaN equivalence, asserted through the predicate the old code used.
  it("excludes a NaN-coord producer, as the old inline comparison did", () => {
    expect(producerInBounds({ lat: NaN, lng: NaN, locations: [] }, BOUNDS)).toBe(false);
  });

  it("filters nothing when no viewport has been committed", () => {
    expect(producerInBounds({ lat: null, lng: null, locations: [] }, null)).toBe(true);
  });
});
