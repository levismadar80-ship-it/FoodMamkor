import { describe, it, expect } from "vitest";
import { producerPoints, producerInBounds, primaryPoint } from "@/lib/producerPoints";

// producerPoints also returns `location` (the source row, needed by the marker
// layer). These helpers assert the coordinate triple without restating it.
const coords = (pts) => pts.map(({ lat, lng, kind }) => ({ lat, lng, kind }));

// MEH-1670: the single point-derivation, extracted from the MapComponent marker
// loop so the map and the /map list cannot disagree about where a business is.
//
// The rules under test are the marker loop's: a row counts when both coords are
// usable numbers, and pickup/market_stand drop out when the secondary layer is
// off. MEH-1938 chunk 5a REMOVED the third rule — the Producer.lat/lng fallback
// that fired when no usable row existed — so every "falls back" case below is
// now asserted as its inverse: columns alone yield NO point. Against the
// pre-5a module those inverted cases return one synthesised branch point and
// go red; that is the discrimination.

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

  // MEH-1938 chunk 5a — THE INVERSION. These two asserted the fallback until
  // 02/09; usable coordinates on the columns alone now yield nothing.
  it("does NOT fall back to Producer.lat/lng when locations[] is empty (MEH-1938 chunk 5a)", () => {
    expect(producerPoints({ lat: 32.08, lng: 34.78, locations: [] })).toEqual([]);
  });

  it("does NOT fall back when every location row is coord-invalid (MEH-1938 chunk 5a)", () => {
    expect(
      producerPoints({ lat: 32.08, lng: 34.78, locations: [{ kind: "pickup", lat: null, lng: 34.9 }] }),
    ).toEqual([]);
  });

  it("returns [] for a producer with neither usable locations nor own coords", () => {
    expect(producerPoints({ lat: null, lng: null, locations: [] })).toEqual([]);
  });

  it("drops secondary points when the layer is off", () => {
    const pts = producerPoints({ lat: null, lng: null, locations: [BRANCH, PICKUP] }, { includeSecondary: false });
    expect(coords(pts)).toEqual([{ lat: 32.5732, lng: 34.9519, kind: "branch" }]);
  });

  // Held over from the fallback era, still true and still worth pinning: hidden
  // pickups leave the business off the map, never re-pinned somewhere else.
  it("does NOT fall back to Producer.lat/lng when the only points are hidden pickups", () => {
    expect(
      producerPoints({ lat: 32.08, lng: 34.78, locations: [PICKUP] }, { includeSecondary: false }),
    ).toEqual([]);
  });

  it("treats a missing/!array locations field as empty — and empty means no point", () => {
    expect(producerPoints({ lat: 32.08, lng: 34.78 })).toEqual([]);
    expect(producerPoints({ lat: 32.08, lng: 34.78, locations: null })).toEqual([]);
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

describe("primaryPoint — the business page's single pin (MEH-1938 chunk 5a)", () => {
  const PRIMARY = { kind: "branch", is_primary: true, lat: 32.6, lng: 34.96 };

  it("prefers the is_primary branch row over an earlier non-primary branch", () => {
    const pt = primaryPoint({ locations: [BRANCH, PRIMARY] });
    expect(pt).toMatchObject({ lat: 32.6, lng: 34.96, kind: "branch" });
    expect(pt.location).toBe(PRIMARY);
  });

  // STRICT by ruling (Sapir, 02/09): the same rule as the backend's derived
  // ProducerListOut.lat/lng — is_primary or nothing. Against the first-branch
  // fallback this file shipped with for one sub-step, the first case here
  // returns BRANCH and goes red; that fallback was a guess, not a measurement.
  it("does NOT fall to the first branch row when no row is flagged primary — a missing primary is a data defect", () => {
    expect(primaryPoint({ locations: [PICKUP, BRANCH] })).toBeNull();
    expect(primaryPoint({ locations: [BRANCH] })).toBeNull();
  });

  it("is kind-agnostic: a pickup flagged primary IS the answer (wrong data shows up), an unflagged one is not", () => {
    expect(primaryPoint({ locations: [PICKUP] })).toBeNull();
    const flaggedPickup = { kind: "pickup", is_primary: true, lat: 32.5, lng: 34.9 };
    expect(primaryPoint({ locations: [flaggedPickup] })).toMatchObject({ lat: 32.5, lng: 34.9, kind: "pickup" });
  });

  it("is null for columns-only, for a NULL-pin primary row, and for null input", () => {
    expect(primaryPoint({ lat: 32.08, lng: 34.78, locations: [] })).toBeNull();
    expect(primaryPoint({ locations: [{ kind: "branch", is_primary: true, lat: null, lng: null }] })).toBeNull();
    expect(primaryPoint(null)).toBeNull();
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

  it("is never in bounds for a producer with own coords and empty locations[] (MEH-1938 chunk 5a)", () => {
    expect(producerInBounds({ lat: 32.5, lng: 34.9, locations: [] }, BOUNDS)).toBe(false);
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
