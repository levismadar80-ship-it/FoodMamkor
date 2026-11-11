import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMapFilters } from "@/app/[locale]/map/state/useMapFilters";

/**
 * MEH-2639 — a city that returns nothing is a different event from a chip
 * combination that returns nothing.
 *
 * "אין בתי עסק בבנימינה" is an answer worth giving, and offering to «נקו את
 * הסינון» there would be offering to un-ask the question the visitor just
 * asked. MapClient keys the city-zero sheet state on `hasNonCityFilters`, so
 * this is the predicate that decides which of the two empty states a visitor
 * sees — and the one that must not collapse back into `hasActiveFilters`.
 */

vi.mock("next-intl", () => ({ useTranslations: () => (k) => k }));

function setup() {
  const loadProducers = vi.fn();
  const { result } = renderHook(() =>
    useMapFilters({
      allProducers: [],
      categories: [{ id: 1, name: "לחמים ואפייה" }],
      loadProducers,
      userCity: null,
      setUserCity: vi.fn(),
      setShowCityPicker: vi.fn(),
      showSecondaryLayer: true,
    }),
  );
  return { result, loadProducers };
}

describe("useMapFilters — city vs non-city filters (MEH-2639)", () => {
  // MEH-2049: the city is mirrored into the URL and hydrated from it on mount,
  // and jsdom keeps one URL per file — reset it so a city set by one case does
  // not arrive pre-filled in the next.
  beforeEach(() => window.history.replaceState(null, "", "/map"));

  it("a city alone is an active filter but NOT a non-city one", () => {
    const { result } = setup();
    act(() => result.current.setCityFilter("בנימינה"));
    expect(result.current.hasActiveFilters).toBe(true);
    // The discriminating half: `hasActiveFilters` cannot tell these apart,
    // which is exactly why the sheet needs this second predicate.
    expect(result.current.hasNonCityFilters).toBe(false);
  });

  it("no filters at all → both false", () => {
    const { result } = setup();
    expect(result.current.hasActiveFilters).toBe(false);
    expect(result.current.hasNonCityFilters).toBe(false);
  });

  it("a category chip makes it a non-city filter", () => {
    const { result } = setup();
    act(() => result.current.toggleCategory("1"));
    expect(result.current.hasNonCityFilters).toBe(true);
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it("city + chip → non-city, so the filtered-zero state wins over city-zero", () => {
    const { result } = setup();
    act(() => result.current.setCityFilter("בנימינה"));
    act(() => result.current.toggleCategory("1"));
    expect(result.current.hasNonCityFilters).toBe(true);
  });

  it("whitespace is not a city", () => {
    const { result } = setup();
    act(() => result.current.setCityFilter("   "));
    expect(result.current.hasActiveFilters).toBe(false);
    expect(result.current.hasNonCityFilters).toBe(false);
  });
});
