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

// MEH-1412 (MEH-1388 chunk 3): a marker click carries the clicked LOCATION so
// the selected card can label the point; the label clears with the selection.
describe("useMapSync — selectedLocation (MEH-1412)", () => {
  it("handleMarkerClick stores the clicked location", () => {
    const { result } = setup();
    const producer = { id: "p1", name: "הלחם של גל" };
    const location = { kind: "pickup", label: "נקודת איסוף צפון" };
    expect(result.current.selectedLocation).toBeNull();
    act(() => {
      result.current.handleMarkerClick(producer, location);
    });
    expect(result.current.selectedLocation).toEqual(location);
  });

  it("defaults selectedLocation to null when a marker is clicked without one", () => {
    const { result } = setup();
    act(() => {
      result.current.handleMarkerClick({ id: "p1" }, { label: "x" });
    });
    act(() => {
      result.current.handleMarkerClick({ id: "p2" }); // e.g. lat/lng fallback marker
    });
    expect(result.current.selectedLocation).toBeNull();
  });

  it("handleMapCanvasClick clears the selected location", () => {
    const { result } = setup();
    act(() => {
      result.current.handleMarkerClick({ id: "p1" }, { label: "y" });
    });
    act(() => {
      result.current.handleMapCanvasClick();
    });
    expect(result.current.selectedLocation).toBeNull();
  });

  it("handleCardClick clears a stale location label (sidebar select is not location-specific)", () => {
    const { result } = setup();
    // Tap producer A's pickup marker → its label is stored.
    act(() => {
      result.current.handleMarkerClick({ id: "pA" }, { label: "נקודת איסוף A" });
    });
    expect(result.current.selectedLocation).toEqual({ label: "נקודת איסוף A" });
    // Now select producer B from the sidebar card — A's label must not linger.
    act(() => {
      result.current.handleCardClick({ id: "pB", lat: 32, lng: 34 });
    });
    expect(result.current.selectedLocation).toBeNull();
  });
});
