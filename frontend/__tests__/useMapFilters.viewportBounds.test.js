import { describe, it, expect } from "vitest";
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
const FAR_AWAY = {
  id: "far-away",
  categories: [BAKERY],
  locations: [],
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
});
