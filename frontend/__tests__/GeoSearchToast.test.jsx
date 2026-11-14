/**
 * MEH-2765 — useMapSync turns the schema's message key into map.errors copy;
 * an unknown key falls back to invalid_search.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const h = vi.hoisted(() => ({ message: "radius_too_small", info: vi.fn() }));

vi.mock("next-intl", () => ({ useTranslations: () => (k) => `t:${k}` }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(() => Promise.resolve({ data: [] })) } }));
vi.mock("@/lib/toast", () => ({ showToast: { info: h.info } }));
vi.mock("@/lib/schemas", () => ({
  GEO_SEARCH_ERROR_KEYS: ["radius_too_small", "radius_too_large"],
  GeoSearchSchema: { safeParse: () => ({ success: false, error: { issues: [{ message: h.message }] } }) },
}));
vi.mock("@/lib/map-chips", () => ({ boundsToCenterRadius: () => ({ lat: 0, lng: 0, radius_km: 0.1 }) }));
vi.mock("@/components/MapBottomSheet", () => ({ PEEK: 14, HALF: 45 }));

import { useMapSync } from "@/app/[locale]/map/state/useMapSync";

function search() {
  const noop = vi.fn();
  const { result } = renderHook(() =>
    useMapSync({
      chipState: {}, cityFilter: null, buildParams: () => ({}),
      setActiveProducerId: noop, setSelectedProducer: noop, setHoveredProducerId: noop,
      setMapMoved: noop, setCommittedBounds: noop, categories: [],
      setAllProducers: noop, setSheetSnap: noop,
    }),
  );
  act(() => result.current.handleSearchThisArea());
}

describe("search-this-area toast copy", () => {
  beforeEach(() => h.info.mockClear());

  it.each(["radius_too_small", "radius_too_large"])("%s → t(map.errors.%s)", (key) => {
    h.message = key;
    search();
    expect(h.info).toHaveBeenCalledWith(`t:map.errors.${key}`);
  });

  it("an unknown message falls back to invalid_search, never the raw string", () => {
    h.message = "something else";
    search();
    expect(h.info).toHaveBeenCalledWith("t:map.errors.invalid_search");
  });
});
