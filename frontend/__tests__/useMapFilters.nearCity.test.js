import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMapFilters } from "@/app/[locale]/map/state/useMapFilters";

// MEH-2602 — the map's «סננו לפי עיר» sends near_city (located in the city OR
// delivering to it, located first). Only with the משלוח chip on does it keep
// the strict delivery_city — that question is "who delivers here".

vi.mock("next-intl", () => ({ useTranslations: () => (k) => k }));

function setup() {
  const loadProducers = vi.fn();
  const { result } = renderHook(() =>
    useMapFilters({
      allProducers: [],
      categories: [],
      loadProducers,
      userCity: null,
      setUserCity: vi.fn(),
      setShowCityPicker: vi.fn(),
      showSecondaryLayer: true,
    }),
  );
  return { result, loadProducers };
}

describe("useMapFilters city search (MEH-2602)", () => {
  it("sends near_city, not delivery_city, for a plain city search", () => {
    const { result, loadProducers } = setup();
    act(() => result.current.setCityFilter("בנימינה-גבעת עדה"));
    act(() => result.current.handleCityFilter());
    const params = loadProducers.mock.calls.at(-1)[0];
    expect(params.near_city).toBe("בנימינה-גבעת עדה");
    expect(params).not.toHaveProperty("delivery_city");
  });

  it("keeps delivery_city when the משלוח chip is on", () => {
    const { result } = setup();
    act(() => result.current.setCityFilter("חיפה"));
    const params = result.current.buildParams({ ...result.current.chipState, has_delivery: true });
    expect(params.delivery_city).toBe("חיפה");
    expect(params).not.toHaveProperty("near_city");
  });

  it("takes an explicit city over the stored one", () => {
    const { result } = setup();
    const params = result.current.buildParams(undefined, {}, "חיפה");
    expect(params.near_city).toBe("חיפה");
  });

  it("sends no city key without a city", () => {
    const { result } = setup();
    const params = result.current.buildParams();
    expect(params).not.toHaveProperty("near_city");
    expect(params).not.toHaveProperty("delivery_city");
  });
});
