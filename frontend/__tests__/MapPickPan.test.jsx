/**
 * MEH-2843 — after a marker tap on a phone, the tapped marker must not sit
 * under the bottom sheet that opens over it. Once the sheet settles, a marker
 * below (or within 16px of) the sheet's top edge is panned up to 24px above
 * it; a marker already in view is left alone; desktop never pans; reduced
 * motion makes the same move without animation.
 *
 * Harness: MapManualOrigin.test.jsx's MapClient mocks, with a fake Leaflet map
 * on mapRef and the bottom sheet rendered as a measurable element.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import he from "../messages/he.json";
import { STORAGE_KEY } from "@/lib/user-location";

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const get = (path) => path.split(".").reduce((o, k) => o?.[k], he);
    const t = (key, vals) => {
      const raw = get(key);
      if (typeof raw !== "string") return key;
      return vals
        ? raw.replace(/\{(\w+)\}/g, (_, k) => (vals[k] ?? `{${k}}`))
        : raw;
    };
    return t;
  },
}));

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
vi.mock("@/lib/toast", () => ({ showToast: toast }));

// The provider abstraction is the unit under contract here, not the network.
const geocodeCity = vi.fn();
vi.mock("@/lib/places", () => ({ geocodeCity: (...a) => geocodeCity(...a) }));

vi.mock("@/lib/use-user-city", () => ({ useUserCity: () => ({ setCity: vi.fn() }) }));
vi.mock("@/lib/rating-gate", () => ({
  isRatingSortEnabled: () => false,
  mapRatingGateSource: (snap, all) => (Array.isArray(snap) ? snap : all),
}));

// LocationModal is the ONLY caller of handleMapCitySelected. Stubbed to a
// button that fires its real prop, so the test drives the production wiring
// rather than reaching into the component for a handler.
vi.mock("@/components/LocationModal", () => ({
  default: ({ onSelectCity }) => (
    <>
      {["חיפה", "ירושלים"].map((c) => (
        <button key={c} type="button" data-testid={`pick-${c}`} onClick={() => onSelectCity(c)}>
          {c}
        </button>
      ))}
    </>
  ),
}));

vi.mock("@/components/CitySearch", () => ({ default: () => null }));
vi.mock("@/components/MapBottomSheet", () => ({ default: () => <div data-testid="map-bottom-sheet" /> }));
vi.mock("@/app/[locale]/map/components/CityPickerModal", () => ({ default: () => null }));
// MEH-2506: a marker that renders the origin tag it is handed, so where the
// mobile tag goes (into the filter bar's strip) is checkable.
vi.mock("@/app/[locale]/map/components/FilterChipsBar", () => ({
  default: ({ originTag }) => <div data-testid="filter-chips-bar">{originTag}</div>,
}));
vi.mock("@/app/[locale]/map/components/MapCardList", () => ({ default: () => null }));
// MapPane owns the GPS crosshair. Stubbed to a button firing its real
// onGpsClick prop, because that — not the sort select — is the path by which a
// GPS fix overwrites a city origin: PR 1's trigger deliberately does NOT
// re-prompt while any origin is stored.
vi.mock("@/app/[locale]/map/components/MapPane", () => ({
  default: ({ onGpsClick }) => (
    <button type="button" data-testid="gps-crosshair" onClick={onGpsClick}>
      gps
    </button>
  ),
}));
vi.mock("@/app/[locale]/map/components/MobileSheetSelectedCard", () => ({ default: () => null }));
vi.mock("@/app/[locale]/map/components/NearMePill", () => ({ default: () => null }));

vi.mock("@/app/[locale]/map/state/useFirstVisitHints", () => ({
  useFirstVisitHints: () => ({
    legendOpen: false,
    legendRef: { current: null },
    setLegendOpen: vi.fn(),
    setSheetSnap: vi.fn(),
    setSplitRatio: vi.fn(),
    sheetSnap: "peek",
    splitRatio: "40fr 60fr",
  }),
}));
vi.mock("@/app/[locale]/map/state/useProducersFeed", () => ({
  useProducersFeed: () => ({
    allProducers: [],
    categories: [],
    loadProducers: vi.fn(),
    loading: false,
    setAllProducers: vi.fn(),
  }),
}));
vi.mock("@/app/[locale]/map/state/useMapSync", () => ({
  useMapSync: () => ({
    cardRefs: { current: {} },
    handleBoundsChange: vi.fn(),
    handleCardClick: vi.fn(),
    handleCardMouseEnter: vi.fn(),
    handleCardMouseLeave: vi.fn(),
    handleMapCanvasClick: vi.fn(),
    handleMapMove: vi.fn(),
    handleMarkerClick: vi.fn(),
    handleMarkerHover: vi.fn(),
    handleSearchThisArea: vi.fn(),
    mapApiRef: harness.mapApiRef,
    mapRef: harness.mapRef,
    registerMapApi: vi.fn(),
    selectedLocation: harness.selectedLocation,
  }),
}));

const setCityFilter = vi.fn();
vi.mock("@/app/[locale]/map/state/useMapFilters", async () => {
  const actual = await vi.importActual("@/app/[locale]/map/state/useMapFilters");
  return {
    ...actual, // keep the REAL sortProducers — MapClient calls it on render
    useMapFilters: () => ({
      activeAttributeCount: 0,
      activeCategoryNames: [],
      activeFilterTags: [],
      activeProducerId: null,
      buildParams: vi.fn(() => ({})),
      cancelPendingSheetFetch: vi.fn(),
      chipState: {},
      cityFilter: "",
      clearSheetFilters: vi.fn(),
      filteredByCategory: [],
      handleCityFilter: vi.fn(),
      handleCityPickerSelect: vi.fn(),
      hoveredProducerId: null,
      isCategoryActive: () => false,
      mapMoved: false,
      onCategoryChipClick: vi.fn(),
      onSheetToggleChip: vi.fn(),
      onToggleChipClick: vi.fn(),
      resetAllFilters: vi.fn(),
      selectedProducer: harness.selectedProducer,
      setActiveCategoryNames: vi.fn(),
      setActiveProducerId: vi.fn(),
      setChipState: vi.fn(),
      setCityFilter: (...a) => setCityFilter(...a),
      setCommittedBounds: vi.fn(),
      setHoveredProducerId: vi.fn(),
      setMapMoved: vi.fn(),
      setSelectedProducer: vi.fn(),
      toggleCategory: vi.fn(),
      viewportCategoryCounts: {},
      visibleCategoryChips: [],
      visibleProducers: [],
    }),
  };
});


const harness = vi.hoisted(() => ({
  mapRef: { current: null },
  mapApiRef: { current: null },
  selectedProducer: null,
  selectedLocation: null,
}));

function setup({ desktop = false, reduce = false, markerY, sheetTop = 500, mapTop = 0, mapLeft = 0 }) {
  window.matchMedia = vi.fn().mockImplementation((q) => ({
    matches: q.includes("min-width: 1024px") ? desktop : q.includes("prefers-reduced-motion") ? reduce : false,
    media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(),
  }));
  const container = document.createElement("div");
  container.getBoundingClientRect = () => ({ top: mapTop, left: mapLeft });
  const handlers = {};
  const map = {
    on: vi.fn((ev, fn) => { (handlers[ev] ||= new Set()).add(fn); }),
    off: vi.fn((ev, fn) => { handlers[ev]?.delete(fn); }),
    fire: (ev) => { for (const fn of [...(handlers[ev] ?? [])]) fn(); },
    panBy: vi.fn(),
    getContainer: () => container,
    latLngToContainerPoint: () => ({ x: 100, y: markerY }),
    getCenter: () => ({ lat: 32, lng: 35 }),
    getZoom: () => 12,
  };
  harness.mapRef.current = map;
  // The move must go through the map API (MapComponent flags it as ours, so
  // «חפשו באזור זה» stays down); a raw map.panBy is the bug this replaced.
  const api = { panBy: vi.fn() };
  harness.mapApiRef.current = api;
  harness.selectedProducer = { id: "p1", name: "עסק", locations: [{ lat: 32.1, lng: 34.9, is_primary: true }] };
  harness.selectedLocation = { lat: 32.1, lng: 34.9 };
  return { map, api, sheetTop };
}

async function renderOnly(sheetTop) {
  const { default: MapPage } = await import("@/app/[locale]/map/MapClient");
  const utils = render(<MapPage />);
  const sheet = utils.getByTestId("map-bottom-sheet");
  sheet.getBoundingClientRect = () => ({ top: sheetTop });
  return utils;
}

async function renderAndSettle(sheetTop) {
  const utils = await renderOnly(sheetTop);
  await act(async () => { vi.advanceTimersByTime(400); });
  return utils;
}

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
afterEach(() => {
  vi.useRealTimers();
  harness.selectedProducer = null;
  harness.selectedLocation = null;
});

describe("mobile pick pan (MEH-2843)", () => {
  it("a marker under the sheet is panned up to 24px above its top edge", async () => {
    const { map, api, sheetTop } = setup({ markerY: 600, sheetTop: 500 });
    await renderAndSettle(sheetTop);
    expect(api.panBy).toHaveBeenCalledTimes(1);
    expect(api.panBy).toHaveBeenCalledWith([0, 600 - (500 - 24)], { animate: true });
    // Never the raw Leaflet call: its moveend would raise «חפשו באזור זה».
    expect(map.panBy).not.toHaveBeenCalled();
  });

  it("a marker within 16px of the edge is moved too", async () => {
    const { api, sheetTop } = setup({ markerY: 490, sheetTop: 500 });
    await renderAndSettle(sheetTop);
    expect(api.panBy).toHaveBeenCalledWith([0, 490 - 476], { animate: true });
  });

  it("a marker already clear of the sheet is left alone", async () => {
    const { api, sheetTop } = setup({ markerY: 300, sheetTop: 500 });
    await renderAndSettle(sheetTop);
    expect(api.panBy).not.toHaveBeenCalled();
  });

  it("measures the edge in the map's own coordinates (map offset from the page top)", async () => {
    // sheet at 560 on the page, map starting at 60 → the edge is 500 in map space
    const { api } = setup({ markerY: 600, mapTop: 60 });
    await renderAndSettle(560);
    expect(api.panBy).toHaveBeenCalledWith([0, 600 - 476], { animate: true });
  });

  it("reduced motion: the same move, unanimated", async () => {
    const { api, sheetTop } = setup({ markerY: 600, sheetTop: 500, reduce: true });
    await renderAndSettle(sheetTop);
    expect(api.panBy).toHaveBeenCalledWith([0, 124], { animate: false });
  });

  // Measured at 390×844 on a real build: the icons are centre-anchored, so
  // panning the latlng point left a 36px marker's lower half 6px from the
  // card. The rendered icon nearest the point supplies the real bottom edge.
  it("pans by the marker icon's bottom edge, not its centre point", async () => {
    const { map, api, sheetTop } = setup({ markerY: 470, sheetTop: 500 });
    const icon = document.createElement("div");
    icon.className = "leaflet-marker-icon";
    icon.getBoundingClientRect = () => ({ left: 82, right: 118, top: 452, bottom: 488, height: 36 });
    map.getContainer().appendChild(icon);
    await renderAndSettle(sheetTop);
    // centre 470 is 30px above the edge (would be left alone); the bottom 488
    // is within 16px → pan the bottom to 24px above the edge.
    expect(api.panBy).toHaveBeenCalledWith([0, 488 - (500 - 24)], { animate: true });
  });

  it("an icon far from the point is not taken as the marker", async () => {
    const { map, api, sheetTop } = setup({ markerY: 300, sheetTop: 500 });
    const other = document.createElement("div");
    other.className = "leaflet-marker-icon";
    other.getBoundingClientRect = () => ({ left: 300, right: 336, top: 600, bottom: 636, height: 36 });
    map.getContainer().appendChild(other);
    await renderAndSettle(sheetTop);
    expect(api.panBy).not.toHaveBeenCalled();
  });

  // The icon rects are page coordinates; the point is map-container
  // coordinates. A map that does not start at the page's top-left corner
  // must still find the icon and use its bottom in map space.
  it("matches the icon in map space when the map is offset on both axes", async () => {
    // Offsets larger than the 36px match radius, so dropping either term
    // would miss the icon (and fall back to the centre point: no pan).
    const { map, api } = setup({ markerY: 470, mapTop: 60, mapLeft: 60 });
    const icon = document.createElement("div");
    icon.className = "leaflet-marker-icon";
    // point (100, 470) in map space → centre (160, 530) on the page
    icon.getBoundingClientRect = () => ({ left: 142, right: 178, top: 512, bottom: 548, height: 36 });
    map.getContainer().appendChild(icon);
    await renderAndSettle(560); // edge = 560 - 60 = 500 in map space
    expect(api.panBy).toHaveBeenCalledWith([0, (548 - 60) - (500 - 24)], { animate: true });
  });

  // A card tap flies the map (focusProducer, 250ms + a 1.2s flyTo). Measured
  // mid-flight the offset is arbitrary, and our pan's moveend would consume
  // the fly's programmatic flag. So the pan waits for the move to end.
  it("waits for a move in progress (a card tap's fly) and pans once it ends", async () => {
    const { map, api, sheetTop } = setup({ markerY: 600, sheetTop: 500 });
    await renderOnly(sheetTop);
    map.fire("movestart");
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(api.panBy).not.toHaveBeenCalled();
    await act(async () => { map.fire("moveend"); });
    expect(api.panBy).toHaveBeenCalledTimes(1);
    expect(api.panBy).toHaveBeenCalledWith([0, 124], { animate: true });
    // control: our own pan's moveend does not trigger a second pan
    await act(async () => { map.fire("moveend"); });
    expect(api.panBy).toHaveBeenCalledTimes(1);
  });

  it("a move that already ended before the sheet settled does not delay the pan", async () => {
    const { map, api, sheetTop } = setup({ markerY: 600, sheetTop: 500 });
    await renderOnly(sheetTop);
    map.fire("movestart");
    map.fire("moveend");
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(api.panBy).toHaveBeenCalledTimes(1);
  });

  it("unmounting before the sheet settles cancels the pan and its listeners", async () => {
    const { map, api, sheetTop } = setup({ markerY: 600, sheetTop: 500 });
    const utils = await renderOnly(sheetTop);
    utils.unmount();
    await act(async () => { vi.advanceTimersByTime(400); });
    map.fire("moveend");
    expect(api.panBy).not.toHaveBeenCalled();
    expect(map.off).toHaveBeenCalledWith("movestart", expect.any(Function));
  });

  it("desktop never pans", async () => {
    const { api, sheetTop } = setup({ markerY: 600, sheetTop: 500, desktop: true });
    await renderAndSettle(sheetTop);
    expect(api.panBy).not.toHaveBeenCalled();
  });
});
