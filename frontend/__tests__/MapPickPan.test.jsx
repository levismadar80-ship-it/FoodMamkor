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
/**
 * MEH-2014 PR 2 — a city the user picked is a sort origin.
 *
 * PR 1 made "מרחק" ask for GPS instead of sitting grey. That leaves the denial
 * path still dead: the copy it shows ("אפשר לבחור עיר כדי למיין לפי מרחק")
 * promised a manual alternative that did not exist. PR 2 builds it, and with
 * two possible origins the surface now has to SAY which one is active — a card
 * distance label is a bare magnitude since MEH-1307 dropped the "ממך" suffix,
 * so "3 ק"מ" is unreadable unless something on screen names what it is 3 km
 * from.
 *
 * DISCRIMINATION (.claude/rules/testing.md, MEH-1619). Measured against the
 * pre-PR-2 tree — `MapClient.jsx`, `lib/user-location.js` and `lib/places.js`
 * all reverted to the merged PR 1 state: **8 of 10 red**. The 2 that stay
 * green are named in the test bodies and are don't-regress guards, not
 * evidence for this change:
 *
 *   - "does not geocode on page load" — must hold before and after. It exists
 *     so a future edit cannot turn a city pick into a load-time lookup, the
 *     same class as PR 1's Lighthouse geolocation-on-start guard.
 *   - "no origin label with nothing stored" — the affordance must be absent
 *     when there is no origin, in both states.
 *
 * Neither is load-bearing alone; each is paired with a sibling that IS red
 * against the old code ("picking a city stores it" / "names the city origin").
 *
 * MapClient is the /map shell over four hooks and six heavy children. Those
 * are stubbed on the same pattern as MapNearestSortTrigger.test.jsx; the
 * SUBJECT — handleMapCitySelected, the origin control, and the storage record
 * — is the real component. Leaflet is never mounted under jsdom in this repo
 * (MapSsrFallback.test.jsx carries the standing reason).
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
    mapApiRef: { current: null },
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
  selectedProducer: null,
  selectedLocation: null,
}));

function setup({ desktop = false, reduce = false, markerY, sheetTop = 500, mapTop = 0 }) {
  window.matchMedia = vi.fn().mockImplementation((q) => ({
    matches: q.includes("min-width: 1024px") ? desktop : q.includes("prefers-reduced-motion") ? reduce : false,
    media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(),
  }));
  const container = document.createElement("div");
  container.getBoundingClientRect = () => ({ top: mapTop });
  const map = {
    panBy: vi.fn(),
    getContainer: () => container,
    latLngToContainerPoint: () => ({ x: 100, y: markerY }),
    getCenter: () => ({ lat: 32, lng: 35 }),
    getZoom: () => 12,
  };
  harness.mapRef.current = map;
  harness.selectedProducer = { id: "p1", name: "עסק", locations: [{ lat: 32.1, lng: 34.9, is_primary: true }] };
  harness.selectedLocation = { lat: 32.1, lng: 34.9 };
  return { map, sheetTop };
}

async function renderAndSettle(sheetTop) {
  const { default: MapPage } = await import("@/app/[locale]/map/MapClient");
  const utils = render(<MapPage />);
  const sheet = utils.getByTestId("map-bottom-sheet");
  sheet.getBoundingClientRect = () => ({ top: sheetTop });
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
    const { map, sheetTop } = setup({ markerY: 600, sheetTop: 500 });
    await renderAndSettle(sheetTop);
    expect(map.panBy).toHaveBeenCalledTimes(1);
    expect(map.panBy).toHaveBeenCalledWith([0, 600 - (500 - 24)], { animate: true });
  });

  it("a marker within 16px of the edge is moved too", async () => {
    const { map, sheetTop } = setup({ markerY: 490, sheetTop: 500 });
    await renderAndSettle(sheetTop);
    expect(map.panBy).toHaveBeenCalledWith([0, 490 - 476], { animate: true });
  });

  it("a marker already clear of the sheet is left alone", async () => {
    const { map, sheetTop } = setup({ markerY: 300, sheetTop: 500 });
    await renderAndSettle(sheetTop);
    expect(map.panBy).not.toHaveBeenCalled();
  });

  it("measures the edge in the map's own coordinates (map offset from the page top)", async () => {
    // sheet at 560 on the page, map starting at 60 → the edge is 500 in map space
    const { map } = setup({ markerY: 600, mapTop: 60 });
    await renderAndSettle(560);
    expect(map.panBy).toHaveBeenCalledWith([0, 600 - 476], { animate: true });
  });

  it("reduced motion: the same move, unanimated", async () => {
    const { map, sheetTop } = setup({ markerY: 600, sheetTop: 500, reduce: true });
    await renderAndSettle(sheetTop);
    expect(map.panBy).toHaveBeenCalledWith([0, 124], { animate: false });
  });

  it("desktop never pans", async () => {
    const { map, sheetTop } = setup({ markerY: 600, sheetTop: 500, desktop: true });
    await renderAndSettle(sheetTop);
    expect(map.panBy).not.toHaveBeenCalled();
  });
});
