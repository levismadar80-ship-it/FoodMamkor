import { describe, it, expect } from "vitest";
import { sortProducers } from "@/app/[locale]/map/state/useMapFilters";

// MEH-1938 chunk 3 — sortProducers's "nearest" mode reads distance through
// producerPoints() instead of Producer.lat/lng directly, using the CLOSEST
// point (mirrors the backend's haversine_min_km). Chunk 3's discriminating
// case: a producer whose only coordinates live in a producer_locations row
// must sort by real distance instead of falling to the end as "no coords".
//
// MEH-1938 chunk 5a inverted the other half: producerPoints() no longer falls
// back to Producer.lat/lng, so a COLUMNS-ONLY producer now has zero usable
// points and sorts last, exactly like one with no coordinates at all. The
// fixtures that used to be "columns only" carry a row now, and one fixture is
// kept columns-only on purpose to pin the inversion.

const USER_LOC = { lat: 32.0853, lng: 34.7818 }; // Tel Aviv

const row = (id, lat, lng) => ({ id, kind: "branch", is_primary: true, lat, lng });

// Near, row-backed (Producer.lat/lng NULL — the post-5b shape).
const NEAR_ROW = { id: "near-row", lat: null, lng: null, locations: [row("loc-a", 32.09, 34.78)] };
// Near, row-backed, a different point (chunk 3's original "locations only" fixture).
const NEAR_LOCATIONS_ONLY = {
  id: "near-locations-only",
  lat: null,
  lng: null,
  locations: [row("loc-1", 32.1, 34.79)],
};
// Far away, row-backed.
const FAR_ROW = { id: "far-row", lat: null, lng: null, locations: [row("loc-b", 31.2, 34.8)] }; // Beersheba-ish
// Columns ONLY — near Tel Aviv on the columns, no row. Since chunk 5a: no points.
const NEAR_COLUMNS_ONLY = { id: "near-columns-only", lat: 32.09, lng: 34.78, locations: [] };
// No coords at all — must sort last.
const NO_COORDS = { id: "no-coords", lat: null, lng: null, locations: [] };

describe("sortProducers — nearest mode via producerPoints() (MEH-1938 chunk 3)", () => {
  it("sorts a locations-only producer by its real distance, not last", () => {
    const sorted = sortProducers(
      [FAR_ROW, NEAR_LOCATIONS_ONLY, NO_COORDS],
      "nearest",
      USER_LOC,
    );
    expect(sorted.map((p) => p.id)).toEqual(["near-locations-only", "far-row", "no-coords"]);
  });

  it("ranks two row-backed producers by distance, nearest first", () => {
    const sorted = sortProducers([FAR_ROW, NEAR_ROW, NEAR_LOCATIONS_ONLY], "nearest", USER_LOC);
    // Both "near" producers sit ahead of the far one; exact 1-2 order between
    // the two near producers isn't asserted (their coords aren't identical),
    // only that distance drives the order.
    expect(sorted[2].id).toBe("far-row");
    expect(new Set(sorted.slice(0, 2).map((p) => p.id))).toEqual(
      new Set(["near-row", "near-locations-only"]),
    );
  });

  it("a producer with zero usable points always sorts last", () => {
    const sorted = sortProducers([NO_COORDS, NEAR_ROW], "nearest", USER_LOC);
    expect(sorted.map((p) => p.id)).toEqual(["near-row", "no-coords"]);
  });

  // MEH-1938 chunk 5a — THE INVERSION. Against the pre-5a module this producer
  // has one synthesised point ~0.5 km away and sorts FIRST; now it has none.
  it("a columns-only producer sorts last, behind a far row-backed one (MEH-1938 chunk 5a)", () => {
    const sorted = sortProducers([NEAR_COLUMNS_ONLY, FAR_ROW], "nearest", USER_LOC);
    expect(sorted.map((p) => p.id)).toEqual(["far-row", "near-columns-only"]);
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
    const sorted = sortProducers([FAR_ROW, multiPoint], "nearest", USER_LOC);
    // multi's closest point (the pickup row) is nearer than far-row.
    expect(sorted[0].id).toBe("multi");
  });
});
