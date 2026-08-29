/**
 * MEH-1938 chunk 3 — producerCompleteness reads coords through producerPoints()
 * instead of Producer.lat/lng directly, so the "coordinates" criterion doesn't
 * false-red a producer whose only coordinates live in a producer_locations row.
 *
 * Three states, per the card's acceptance criteria:
 *   1. columns only (Producer.lat/lng, no locations)   — unchanged: valid.
 *   2. locations only (a usable branch row, no columns) — THE FIX: was
 *      incorrectly red before this change, is correctly green after.
 *   3. both                                             — unchanged: valid.
 *
 * State 2 is the discriminating case: it must fail against the OLD
 * `p.lat == null || p.lng == null` check and pass against producerPoints().
 */
import { describe, it, expect } from "vitest";
import { producerCompleteness, COMPLETENESS_FIELDS } from "@/lib/producer-completeness";

// Complete on every other axis, so only the coords source can move the result.
const BASE = {
  city: "תל אביב",
  phone: "0501234567",
  categories: [{ id: "c1", name: "ירקות" }],
  images: ["https://example.com/a.jpg"],
  short_description: "גבינות עיזים מהחווה",
  opening_hours: "Sun-Thu 09:00-18:00",
  has_physical_location: true,
};

const BRANCH_ROW = {
  id: "loc-1",
  kind: "branch",
  is_primary: true,
  lat: 32.08,
  lng: 34.78,
  precision: "exact",
};

const hasCoordsMissing = (p) =>
  producerCompleteness(p).missing.includes(COMPLETENESS_FIELDS.coords);

describe("producerCompleteness — coords via producerPoints() (MEH-1938 chunk 3)", () => {
  it("columns only (Producer.lat/lng, no locations) → green, coords not missing", () => {
    const p = { ...BASE, lat: 32.08, lng: 34.78 };
    const r = producerCompleteness(p);
    expect(hasCoordsMissing(p)).toBe(false);
    expect(r.priority).toBe("green");
  });

  it("locations only (a usable branch row, no Producer.lat/lng) → green, coords not missing (THE FIX)", () => {
    const p = { ...BASE, lat: null, lng: null, locations: [BRANCH_ROW] };
    const r = producerCompleteness(p);
    expect(hasCoordsMissing(p)).toBe(false);
    expect(r.priority).toBe("green");
  });

  it("both columns and locations → green, coords not missing", () => {
    const p = { ...BASE, lat: 32.08, lng: 34.78, locations: [BRANCH_ROW] };
    const r = producerCompleteness(p);
    expect(hasCoordsMissing(p)).toBe(false);
    expect(r.priority).toBe("green");
  });

  it("neither columns nor locations → red, coords missing (unchanged)", () => {
    const p = { ...BASE, lat: null, lng: null, locations: [] };
    const r = producerCompleteness(p);
    expect(hasCoordsMissing(p)).toBe(true);
    expect(r.priority).toBe("red");
  });

  it("only a secondary (pickup) location row, no branch, no columns → still counts (producerPoints does not filter by kind for completeness)", () => {
    // producerCompleteness doesn't pass includeSecondary:false — completeness
    // is "does this business have ANY plottable point", not "does it have a
    // primary branch". A pickup-only row still makes the business locatable.
    const p = {
      ...BASE,
      lat: null,
      lng: null,
      locations: [{ id: "loc-2", kind: "pickup", is_primary: false, lat: 32.1, lng: 34.9 }],
    };
    expect(hasCoordsMissing(p)).toBe(false);
  });

  it("delivery-only producer with no coords at all is still never flagged for coords (MEH-213, unchanged)", () => {
    const p = {
      ...BASE,
      has_physical_location: false,
      offers_delivery: true,
      delivery_nationwide: true,
      lat: null,
      lng: null,
      locations: [],
    };
    expect(hasCoordsMissing(p)).toBe(false);
  });
});
