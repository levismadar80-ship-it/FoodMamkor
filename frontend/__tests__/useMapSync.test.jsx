import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMapSync } from "@/app/[locale]/map/state/useMapSync";

// MEH-1298: lock the desktop half of the tap-target fix — handleCardClick must
// select + pin-sync WITHOUT scrolling #map-container into view (the legacy
// stacked-layout page-scroll that moved the list under the pointer between the
// two taps of the MEH-1243 select→navigate gesture).
vi.mock("next-intl", () => ({ useTranslations: () => (k) => k }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(() => Promise.resolve({ data: [] })) } }));
vi.mock("@/lib/toast", () => ({ showToast: { info: vi.fn() } }));
vi.mock("@/lib/schemas", () => ({ GeoSearchSchema: { safeParse: () => ({ success: true, data: {} }) } }));
vi.mock("@/lib/map-chips", () => ({ boundsToCenterRadius: () => ({ lat: 0, lng: 0, radius_km: 5 }) }));
vi.mock("@/components/MapBottomSheet", () => ({ HALF: 45 }));

function setup() {
  const props = {
    chipState: {},
    cityFilter: null,
    buildParams: () => ({}),
    setActiveProducerId: vi.fn(),
    setSelectedProducer: vi.fn(),
    setHoveredProducerId: vi.fn(),
    setMapMoved: vi.fn(),
    setCommittedBounds: vi.fn(),
    categories: [],
    setAllProducers: vi.fn(),
    setSheetSnap: vi.fn(),
  };
  const { result } = renderHook(() => useMapSync(props));
  return { result, props };
}

describe("useMapSync — handleCardClick (MEH-1298: no page scroll)", () => {
  beforeEach(() => {
    document.getElementById("map-container")?.remove();
  });

  it("selects + pin-syncs but does NOT scrollIntoView #map-container", () => {
    const scrollSpy = vi.fn();
    const mapContainer = document.createElement("div");
    mapContainer.id = "map-container";
    mapContainer.scrollIntoView = scrollSpy;
    document.body.appendChild(mapContainer);

    const { result, props } = setup();
    const producer = { id: "p1", lat: 32, lng: 34 };
    act(() => {
      result.current.handleCardClick(producer);
    });

    expect(props.setActiveProducerId).toHaveBeenCalledWith("p1");
    expect(props.setSelectedProducer).toHaveBeenCalledWith(producer);
    // The bug's mechanism — the map-container page-scroll — must be gone.
    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it("ignores a producer without coordinates (guard preserved)", () => {
    const { result, props } = setup();
    act(() => {
      result.current.handleCardClick({ id: "p2" });
    });
    expect(props.setActiveProducerId).not.toHaveBeenCalled();
    expect(props.setSelectedProducer).not.toHaveBeenCalled();
  });
});
