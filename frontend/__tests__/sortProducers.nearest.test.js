import { describe, it, expect } from "vitest";
import { sortProducers } from "@/app/[locale]/map/state/useMapFilters";

// MEH-1938 chunk 3 — sortProducers's "nearest" mode reads distance through
// producerPoints() instead of Producer.lat/lng directly, using the CLOSEST
// point (mirrors the backend's haversine_min_km COALESCE). The discriminating
// case: a producer whose only coordinates live in a producer_locations row
// (no Producer.lat/lng) must still sort by real distance instead of falling
// to the end as "no coords" (Infinity).

const USER_LOC = { lat: 32.0853, lng: 34.7818 }; // Tel Aviv

// Columns only (unchanged behavior).
const NEAR_COLUMNS = { id: "near-columns", lat: 32.09, lng: 34.78 };
// Locations only, no columns (THE FIX).
const NEAR_LOCATIONS_ONLY = {
  id: "near-locations-only",
  lat: null,
  lng: null,
  locations: [{ id: "loc-1", kind: "branch", is_primary: true, lat: 32.1, lng: 34.79 }],
};
// Far away, columns only.
const FAR_COLUMNS = { id: "far-columns", lat: 31.2, lng: 34.8 }; // Beersheba-ish
// No coords at all — must sort last.
const NO_COORDS = { id: "no-coords", lat: null, lng: null, locations: [] };

describe("sortProducers — nearest mode via producerPoints() (MEH-1938 chunk 3)", () => {
  it("sorts a locations-only producer by its real distance, not last", () => {
    const sorted = sortProducers(
      [FAR_COLUMNS, NEAR_LOCATIONS_ONLY, NO_COORDS],
      "nearest",
      USER_LOC,
    );
    expect(sorted.map((p) => p.id)).toEqual(["near-locations-only", "far-columns", "no-coords"]);
  });

  it("ranks columns-only and locations-only producers together, nearest first", () => {
    const sorted = sortProducers(
      [FAR_COLUMNS, NEAR_COLUMNS, NEAR_LOCATIONS_ONLY],
      "nearest",
      USER_LOC,
    );
    // Both "near" producers sit ahead of the far one; exact 1-2 order between
    // the two near producers isn't asserted (their coords aren't identical),
    // only that distance — not data source — drives the order.
    expect(sorted[2].id).toBe("far-columns");
    expect(new Set(sorted.slice(0, 2).map((p) => p.id))).toEqual(
      new Set(["near-columns", "near-locations-only"]),
    );
  });

  it("a producer with zero usable points always sorts last", () => {
    const sorted = sortProducers([NO_COORDS, NEAR_COLUMNS], "nearest", USER_LOC);
    expect(sorted.map((p) => p.id)).toEqual(["near-columns", "no-coords"]);
  });

  it("picks the CLOSEST of multiple location rows (mirrors haversine_min_km)", () => {
    const multiPoint = {
      id: "multi",
      lat: null,
      lng: null,
      locations: [
        { id: "far", kind: "branch", is_primary: true, lat: 31.0, lng: 34.8 },
        { id: "close", kind: "pickup", is_primary: false, lat: 32.09, lng: 34.78 },
      ],
    };
    const sorted = sortProducers([FAR_COLUMNS, multiPoint], "nearest", USER_LOC);
    // multi's closest point (the pickup row) is nearer than far-columns.
    expect(sorted[0].id).toBe("multi");
  });
});
