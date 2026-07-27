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

  it("ignores a malformed producer with no id (nothing to select)", () => {
    const { result, props } = setup();
    act(() => {
      result.current.handleCardClick({});
    });
    expect(props.setActiveProducerId).not.toHaveBeenCalled();
    expect(props.setSelectedProducer).not.toHaveBeenCalled();
  });
});

// MEH-1663: the select→fly path must not gate on Producer.lat/lng. Since MEH-1412
// chunk 3 a business is pinned from its `locations[]` rows, so a delivery-only
// business with a pickup point (Producer.lat/lng NULL — MEH-1402's reversal, seeded
// as `demo-delivery-pickup`) owns a visible pin. The old guard
// (`if (!producer?.lat || !producer?.lng) return;`) returned BEFORE the two setters,
// so the card never went active — no Pin-Echo, no camera move, and the MEH-1243
// Direction-B second-tap navigation never armed.
//
// These assertions are failing-by-construction against that guard: with lat/lng null
// it returned early, so all three expectations below (active, selected, focusProducer)
// went unmet. They discriminate — the previous version of this file asserted the exact
// OPPOSITE for this input (`expect(setActiveProducerId).not.toHaveBeenCalled()`), which
// is how the bug survived. Verified red on the pre-fix hook, green after.
//
// Camera BEHAVIOUR (single point → flyTo · >= 2 points → zoom-capped fitBounds ·
// programmaticMoveRef set first) is not re-asserted here: it belongs to the single
// resolver in MapComponent.focusProducer and is already locked by
// MapFocusOnSelect.test.jsx:276 + :294. What this file owns is that the handler
// REACHES that resolver at all.
describe("useMapSync — handleCardClick reaches the map for a delivery-only business (MEH-1663)", () => {
  const DELIVERY_ONLY = {
    id: "demo-delivery-pickup",
    name: "משק החלב של דנה (משלוחים + איסוף)",
    lat: null,
    lng: null,
    // The Benyamina pickup point from backend/scripts/seed_demo_business.py:346-354.
    locations: [
      { kind: "pickup", label: "איסוף — מרכז בנימינה", lat: 32.519, lng: 34.953, is_primary: true, precision: "exact" },
    ],
  };

  function setupWithMap() {
    const focusProducer = vi.fn();
    const { result, props } = setup();
    act(() => {
      // getContainer left undefined → registerMapApi's 0x0-container skip does not
      // fire, so this stands in for the VISIBLE map instance.
      result.current.registerMapApi({ focusProducer, getMap: () => null });
    });
    return { result, props, focusProducer };
  }

  it("selects the card even though Producer.lat/lng are NULL", () => {
    const { result, props } = setupWithMap();
    act(() => {
      result.current.handleCardClick(DELIVERY_ONLY);
    });
    expect(props.setActiveProducerId).toHaveBeenCalledWith("demo-delivery-pickup");
    expect(props.setSelectedProducer).toHaveBeenCalledWith(DELIVERY_ONLY);
  });

  it("hands the business to focusProducer so the camera resolves its locations[] pin", () => {
    vi.useFakeTimers();
    try {
      const { result, focusProducer } = setupWithMap();
      act(() => {
        result.current.handleCardClick(DELIVERY_ONLY);
      });
      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(focusProducer).toHaveBeenCalledWith("demo-delivery-pickup");
    } finally {
      vi.useRealTimers();
    }
  });

  it("still reaches focusProducer for an ordinary business with its own coords (no regression)", () => {
    vi.useFakeTimers();
    try {
      const { result, focusProducer } = setupWithMap();
      act(() => {
        result.current.handleCardClick({ id: "p-single", lat: 31.8, lng: 35.2, locations: [] });
      });
      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(focusProducer).toHaveBeenCalledWith("p-single");
    } finally {
      vi.useRealTimers();
    }
  });

  // Adopted from the parallel MEH-1663 branch (commit 508a52ec), adapted to the
  // reconciled semantics. That branch asserted a pinless business is not selected
  // either; this one asserts the ticket's stated constraint — "0 usable points →
  // defensive no-op, KEEP selection". Selection is what arms the MEH-1243 second-tap
  // navigation, so refusing it is what made the card dead in the first place. The
  // camera is what must stay put, and it does: focusProducer no-ops because
  // markersRef holds no entry for a business with no marker.
  it("keeps the selection but moves no camera for a business with no usable point", () => {
    vi.useFakeTimers();
    try {
      const { result, props, focusProducer } = setupWithMap();
      const pinless = {
        id: "pinless",
        lat: null,
        lng: null,
        // A coord-invalid row is not a point — same test the marker loop applies
        // before it builds a marker (MapComponent.jsx:764-770).
        locations: [{ kind: "pickup", lat: null, lng: 34.9 }],
      };
      act(() => {
        result.current.handleCardClick(pinless);
      });
      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(props.setActiveProducerId).toHaveBeenCalledWith("pinless");
      expect(props.setSelectedProducer).toHaveBeenCalledWith(pinless);
      // focusProducer is still called — it is the resolver, and it is the thing
      // that decides there is nothing to fly to (MapComponent.jsx:463,467). The
      // camera assertion for this case lives in MapFocusOnSelect.test.jsx, which
      // holds the real MapComponent: no flyTo, no fitBounds, and no map demote.
      expect(focusProducer).toHaveBeenCalledWith("pinless");
    } finally {
      vi.useRealTimers();
    }
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
