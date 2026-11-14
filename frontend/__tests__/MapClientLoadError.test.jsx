/**
 * MEH-3198 (review findings 2 + 3) — how MapClient wires a failed load into
 * the two shells.
 *
 * 2. A failed load with a city set is not «אין בתי עסק ב{city}». cityZero
 *    swaps the list for the mount catalog and the peek row for the town line;
 *    with feed.loadError on, neither may happen — the failure is the story.
 * 3. On a phone the sheet's peek row already carries the error and «נסו שוב».
 *    The list passed into the sheet must not carry them a second time. The
 *    desktop sidebar list keeps them (it is the only place they show there).
 *
 * MapClient is stubbed on the MapManualOrigin.test.jsx pattern: the four hooks
 * and the heavy children are mocks, and MapBottomSheet / MapCardList are
 * replaced by markers that print the props under test.
 *
 * DISCRIMINATION: without `!feed.loadError &&` in cityZero, the two
 * "loadError + city" cases go red (zeroCity = "חיפה", the list gets the
 * catalog). Without the sheet's own list override, the two "sheet list" cases
 * go red (the list inside the sheet reads loadError=true + a retry). The
 * "no error" control cases are green before and after; they prove the setup
 * reaches cityZero at all, so a red above is the guard and not the fixture.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

const h = vi.hoisted(() => ({ loadError: true, sheetSnap: "peek", retry: () => {} }));

vi.mock("next-intl", () => ({ useTranslations: () => (k) => k }));
vi.mock("@/lib/toast", () => ({ showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/places", () => ({ geocodeCity: vi.fn() }));
vi.mock("@/lib/use-user-city", () => ({ useUserCity: () => ({ setCity: vi.fn() }) }));
vi.mock("@/lib/rating-gate", () => ({
  isRatingSortEnabled: () => false,
  mapRatingGateSource: (snap, all) => (Array.isArray(snap) ? snap : all),
}));

vi.mock("@/components/LocationModal", () => ({ default: () => null }));
vi.mock("@/components/CitySearch", () => ({ default: () => null }));
vi.mock("@/components/MapBottomSheet", () => ({
  default: ({ zeroCity, loadError, onRetry, count, children }) => (
    <div
      data-testid="sheet-stub"
      data-zero-city={zeroCity}
      data-load-error={String(!!loadError)}
      data-has-retry={String(typeof onRetry === "function")}
      data-count={count}
    >
      {children}
    </div>
  ),
  PEEK: 14,
  HALF: 45,
}));
vi.mock("@/app/[locale]/map/components/MapCardList", () => ({
  default: ({ loadError, onRetry, visibleProducers }) => (
    <div
      data-testid="card-list-stub"
      data-load-error={String(!!loadError)}
      data-has-retry={String(typeof onRetry === "function")}
      data-rows={visibleProducers.length}
    />
  ),
}));
vi.mock("@/app/[locale]/map/components/CityPickerModal", () => ({ default: () => null }));
vi.mock("@/app/[locale]/map/components/FilterChipsBar", () => ({ default: () => null }));
vi.mock("@/app/[locale]/map/components/MapPane", () => ({ default: () => null }));
vi.mock("@/app/[locale]/map/components/MobileSheetSelectedCard", () => ({ default: () => null }));
vi.mock("@/app/[locale]/map/components/NearMePill", () => ({ default: () => null }));

vi.mock("@/app/[locale]/map/state/useFirstVisitHints", () => ({
  useFirstVisitHints: () => ({
    legendOpen: false,
    legendRef: { current: null },
    setLegendOpen: vi.fn(),
    setSheetSnap: vi.fn(),
    setSplitRatio: vi.fn(),
    sheetSnap: h.sheetSnap,
    splitRatio: "40fr 60fr",
  }),
}));
const CATALOG = [
  { id: 1, name: "א", lat: 32.8, lng: 35.0 },
  { id: 2, name: "ב", lat: 32.7, lng: 35.1 },
];
vi.mock("@/app/[locale]/map/state/useProducersFeed", () => ({
  useProducersFeed: () => ({
    allProducers: [],
    categories: [],
    catalogSnapshot: CATALOG,
    snapshotPending: false,
    loadProducers: vi.fn(),
    loadArea: vi.fn(),
    loading: false,
    loadError: h.loadError,
    retry: h.retry,
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
    mapRef: { current: null },
    registerMapApi: vi.fn(),
    selectedLocation: null,
  }),
}));
vi.mock("@/app/[locale]/map/state/useMapFilters", async () => {
  const actual = await vi.importActual("@/app/[locale]/map/state/useMapFilters");
  return {
    ...actual,
    useMapFilters: () => ({
      activeAttributeCount: 0,
      activeCategoryNames: [],
      activeFilterTags: [],
      activeProducerId: null,
      buildParams: vi.fn(() => ({})),
      cancelPendingSheetFetch: vi.fn(),
      chipState: {},
      // A town is set, no other filter: the exact shape cityZero answers.
      cityFilter: "חיפה",
      hasActiveFilters: true,
      hasNonCityFilters: false,
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
      selectedProducer: null,
      setActiveCategoryNames: vi.fn(),
      setActiveProducerId: vi.fn(),
      setChipState: vi.fn(),
      setCityFilter: vi.fn(),
      setCommittedBounds: vi.fn(),
      setHoveredProducerId: vi.fn(),
      setMapMoved: vi.fn(),
      setSelectedProducer: vi.fn(),
      showAllPickupPoints: false,
      toggleCategory: vi.fn(),
      viewportCategoryCounts: {},
      visibleCategoryChips: [],
      visibleProducers: [],
      visibleToggleChips: [],
    }),
  };
});

async function renderMap() {
  const { default: MapPage } = await import("@/app/[locale]/map/MapClient");
  return render(<MapPage />);
}

const sheet = () => screen.getByTestId("sheet-stub");
const sheetList = () => within(sheet()).getByTestId("card-list-stub");
const desktopList = () =>
  screen.getAllByTestId("card-list-stub").find((el) => !sheet().contains(el));

beforeEach(() => {
  h.loadError = true;
  h.sheetSnap = "peek";
});

describe("MapClient — a failed load with a town set is not «no businesses here» (finding 2)", () => {
  it("control — no error, town set, nothing found: cityZero is on (the town line + the catalog)", async () => {
    h.loadError = false;
    await renderMap();
    expect(sheet()).toHaveAttribute("data-zero-city", "חיפה");
    expect(desktopList()).toHaveAttribute("data-rows", String(CATALOG.length));
  });

  it("loadError + town set: no town line on the sheet", async () => {
    await renderMap();
    expect(sheet()).toHaveAttribute("data-zero-city", "");
    expect(sheet()).toHaveAttribute("data-count", "0");
  });

  it("loadError + town set: the list is not swapped for the catalog", async () => {
    await renderMap();
    expect(desktopList()).toHaveAttribute("data-rows", "0");
    expect(desktopList()).toHaveAttribute("data-load-error", "true");
  });
});

describe("MapClient — the error and «נסו שוב» show once on a phone (finding 3)", () => {
  it.each(["peek", "half"])("sheet at %s: the peek row carries the error and the retry", async (snap) => {
    h.sheetSnap = snap;
    await renderMap();
    expect(sheet()).toHaveAttribute("data-load-error", "true");
    expect(sheet()).toHaveAttribute("data-has-retry", "true");
  });

  it.each(["peek", "half"])("sheet at %s: the list inside the sheet carries neither", async (snap) => {
    h.sheetSnap = snap;
    await renderMap();
    expect(sheetList()).toHaveAttribute("data-load-error", "false");
    expect(sheetList()).toHaveAttribute("data-has-retry", "false");
  });

  it("desktop: the sidebar list keeps the error and the retry", async () => {
    await renderMap();
    expect(desktopList()).toHaveAttribute("data-load-error", "true");
    expect(desktopList()).toHaveAttribute("data-has-retry", "true");
  });
});
