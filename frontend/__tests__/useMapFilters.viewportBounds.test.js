import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMapFilters } from "@/app/[locale]/map/state/useMapFilters";

// MEH-1670: useMapFilters.visibleProducers and viewportCategoryCounts both
// derive from producerInBounds() instead of reading Producer.lat/lng directly.
// This locks the two observable outcomes Sapir called out explicitly:
//
//   1. the LIST includes a delivery-only business (Producer.lat/lng NULL)
//      whose only point is a pickup row inside committedBounds — the bug
//      this ticket fixes.
//   2. the CATEGORY CHIP COUNT moves with it. Rule 5 (guard against a
//      demonstrably-wrong pass): a fix that only touched visibleProducers
//      could ship with the chip reading 0 while the card is in the list —
//      the two are separate call sites (useMapFilters.js:~306 and :~326)
//      and nothing else forces them to agree except sharing this predicate.

vi.mock("next-intl", () => ({ useTranslations: () => (k) => k }));

const BAKERY = { id: "cat-bakery", name: "לחמים ואפייה" };

// demo-delivery-pickup shape: Producer.lat/lng NULL, one pickup row.
const DELIVERY_ONLY = {
  id: "delivery-only",
  categories: [BAKERY],
  locations: [{ kind: "pickup", lat: 32.519, lng: 34.953, is_primary: true }],
  lat: null,
  lng: null,
};

// A second business outside the committed bounds, same category — the
// negative control that proves the box below actually excludes something.
// MEH-1938 chunk 5a: the point must live in a row — with `locations: []` this
// control would be excluded for having NO point, not for being out of bounds,
// and the bounds comparison could be deleted without this file noticing.
const FAR_AWAY = {
  id: "far-away",
  categories: [BAKERY],
  locations: [{ id: "far-1", kind: "branch", is_primary: true, lat: 33.5, lng: 35.5 }],
  lat: 33.5,
  lng: 35.5,
};

const BOUNDS = { south: 32.4, north: 32.7, west: 34.8, east: 35.1 };

function setup(allProducers) {
  const { result } = renderHook(() =>
    useMapFilters({
      allProducers,
      categories: [BAKERY],
      loadProducers: vi.fn(),
      userCity: null,
      setUserCity: vi.fn(),
      setShowCityPicker: vi.fn(),
    }),
  );
  return result;
}

describe("useMapFilters — viewport bounds derive from locations[] (MEH-1670)", () => {
  it("visibleProducers includes a delivery-only business whose pickup point is in bounds", () => {
    const result = setup([DELIVERY_ONLY, FAR_AWAY]);
    act(() => result.current.setCommittedBounds(BOUNDS));

    const ids = result.current.visibleProducers.map((p) => p.id);
    expect(ids).toContain("delivery-only");
    expect(ids).not.toContain("far-away");
  });

  it("viewportCategoryCounts includes it too — the chip must match the list", () => {
    const result = setup([DELIVERY_ONLY, FAR_AWAY]);
    act(() => result.current.setCommittedBounds(BOUNDS));

    // Only delivery-only is in bounds, so the count is 1, not 2 (which would
    // mean the chip ignored committedBounds) and not 0 (which is exactly the
    // "card in list, 0 on chip" gap the ticket named as unacceptable).
    expect(result.current.viewportCategoryCounts[BAKERY.name]).toBe(1);
  });

  it("both stay unfiltered when no viewport has been committed", () => {
    const result = setup([DELIVERY_ONLY, FAR_AWAY]);
    expect(result.current.visibleProducers.map((p) => p.id)).toEqual(
      expect.arrayContaining(["delivery-only", "far-away"]),
    );
    expect(result.current.viewportCategoryCounts[BAKERY.name]).toBe(2);
  });

  // MEH-3054: the list tests the pins the map DRAWS (mapPinPoints). A business
  // whose branch is out of view but whose pickup point is in view is not drawn
  // there by default, so it is not in the list; the «איסוף עצמי» chip draws
  // every pickup point, and then it is. Replaces MEH-1670's layer-toggle case
  // (the toggle left on 13/11, MEH-3045).
  const BRANCH_FAR_PICKUP_NEAR = {
    id: "branch-far",
    categories: [BAKERY],
    locations: [
      { kind: "branch", is_primary: true, lat: 33.5, lng: 35.5 },
      { kind: "pickup", is_primary: false, lat: 32.5, lng: 34.9 },
    ],
  };

  it("a pickup point in view does not pull in a business whose pin is out of view (chip off)", () => {
    const result = setup([BRANCH_FAR_PICKUP_NEAR, FAR_AWAY]);
    act(() => result.current.setCommittedBounds(BOUNDS));
    expect(result.current.visibleProducers.map((p) => p.id)).not.toContain("branch-far");
    expect(result.current.viewportCategoryCounts[BAKERY.name]).toBeUndefined();
  });

  it("with the «איסוף עצמי» chip on, that pickup point counts, in BOTH outputs", () => {
    const result = setup([BRANCH_FAR_PICKUP_NEAR, FAR_AWAY]);
    act(() => result.current.setCommittedBounds(BOUNDS));
    act(() => result.current.setChipState((s) => ({ ...s, pickup_points: true })));
    expect(result.current.showAllPickupPoints).toBe(true);
    expect(result.current.visibleProducers.map((p) => p.id)).toContain("branch-far");
    expect(result.current.viewportCategoryCounts[BAKERY.name]).toBe(1);
  });
});
