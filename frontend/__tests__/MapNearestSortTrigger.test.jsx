/**
 * MEH-2014 — "מרחק" is a trigger, not a dead option.
 *
 * Before this change `<option value="nearest" disabled={!userLoc}>` was grey
 * unless a GPS fix already sat in storage, and the ONLY writer of that fix was
 * a button on a different page. Landing straight on /map — from a link, a
 * search result, a share — showed a disabled control with no explanation
 * (NN/g: a disabled control that gives no feedback reads as broken).
 *
 * Measured against the pre-change component (both files reverted to
 * origin/staging): **6 of 9 red**. The 3 that stay green, and why — because
 * "it passed before too" means different things here:
 *
 *   - "does NOT ask on page load" — a don't-regress guard. It is SUPPOSED to
 *     hold in both states; it exists so a future edit cannot turn the trigger
 *     into a page-load prompt (Lighthouse geolocation-on-start).
 *   - "is absent when there is nothing to clear" — same: the affordance must
 *     not appear without a location, before or after.
 *   - "with a location already stored, choosing מרחק does not re-prompt" —
 *     this one passes on the OLD code for the WRONG reason: the old code
 *     never called getCurrentPosition at all, so "did not re-prompt" was
 *     vacuously true. It is a green with two possible causes
 *     (.claude/rules/testing.md), and it is kept only because paired with
 *     "choosing it with no location asks the browser for one" — which IS red
 *     against old code — the two together pin the conditional. Neither is
 *     load-bearing alone.
 *
 * MapClient is the /map shell and composes four state hooks plus six heavy
 * children (Leaflet, IntersectionObserver, a live feed). Those are stubbed;
 * the SUBJECT — handleSortChange, handleClearLocation, and the <select> markup
 * — is the real component. Leaflet is never mounted under jsdom in this repo
 * (see MapSsrFallback.test.jsx for the standing reason).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
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

vi.mock("@/lib/use-user-city", () => ({ useUserCity: () => ({}) }));
vi.mock("@/lib/rating-gate", () => ({ isRatingSortEnabled: () => false }));

// --- heavy children: stubbed to nothing. None renders the sort control. ---
vi.mock("@/components/CitySearch", () => ({ default: () => null }));
vi.mock("@/components/LocationModal", () => ({ default: () => null }));
vi.mock("@/components/MapBottomSheet", () => ({ default: () => null }));
vi.mock("@/app/[locale]/map/components/CityPickerModal", () => ({ default: () => null }));
vi.mock("@/app/[locale]/map/components/FilterChipsBar", () => ({ default: () => null }));
vi.mock("@/app/[locale]/map/components/MapCardList", () => ({ default: () => null }));
vi.mock("@/app/[locale]/map/components/MapPane", () => ({ default: () => null }));
vi.mock("@/app/[locale]/map/components/MobileSheetSelectedCard", () => ({ default: () => null }));
vi.mock("@/app/[locale]/map/components/NearMePill", () => ({ default: () => null }));

// --- state hooks: minimal shapes MapClient destructures. ---
vi.mock("@/app/[locale]/map/state/useFirstVisitHints", () => ({
  useFirstVisitHints: () => ({
    legendOpen: false,
    legendRef: { current: null },
    setLegendOpen: vi.fn(),
    setSheetSnap: vi.fn(),
    setSplitRatio: vi.fn(),
    sheetSnap: "peek",
    splitRatio: "40fr 60fr", // real shape (useFirstVisitHints.js:63) — read via .startsWith
    visitedIds: new Set(),
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
    mapRef: { current: null },
    registerMapApi: vi.fn(),
    selectedLocation: null,
  }),
}));
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
      selectedProducer: null,
      setActiveCategoryNames: vi.fn(),
      setActiveProducerId: vi.fn(),
      setChipState: vi.fn(),
      setCityFilter: vi.fn(),
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

const T = he.map.client.sort;

/** Install a geolocation stub with the given behaviour. */
function mockGeolocation(impl) {
  const getCurrentPosition = vi.fn(impl);
  Object.defineProperty(navigator, "geolocation", {
    value: { getCurrentPosition },
    configurable: true,
  });
  return getCurrentPosition;
}

async function renderMap() {
  const { default: MapPage } = await import("@/app/[locale]/map/MapClient");
  return render(<MapPage />);
}

const sortSelect = () => screen.getByLabelText(T.aria_label);
const nearestOption = () =>
  [...sortSelect().querySelectorAll("option")].find((o) => o.value === "nearest");

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("MEH-2014 — the nearest option is a trigger", () => {
  it("is never disabled, even with no known location", async () => {
    mockGeolocation(() => {});
    await renderMap();

    // The whole defect in one assertion: it used to be disabled={!userLoc}.
    expect(nearestOption()).not.toBeDisabled();
  });

  it("choosing it with no location asks the browser for one", async () => {
    const getCurrentPosition = mockGeolocation(() => {});
    await renderMap();

    fireEvent.change(sortSelect(), { target: { value: "nearest" } });

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("does NOT ask on page load — only on the explicit choice", async () => {
    const getCurrentPosition = mockGeolocation(() => {});
    await renderMap();

    // Lighthouse geolocation-on-start: a prompt the user did not ask for.
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("granted → the fix is persisted and the sort stays on מרחק", async () => {
    mockGeolocation((ok) => ok({ coords: { latitude: 32.08, longitude: 34.78 } }));
    await renderMap();

    await act(async () => {
      fireEvent.change(sortSelect(), { target: { value: "nearest" } });
    });

    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toEqual({
      lat: 32.08,
      lng: 34.78,
    });
    expect(sortSelect().value).toBe("nearest");
  });

  it("denied → Hebrew message pointing at the manual alternative, sort reverts", async () => {
    mockGeolocation((_ok, fail) => fail({ code: 1 }));
    await renderMap();

    await act(async () => {
      fireEvent.change(sortSelect(), { target: { value: "nearest" } });
    });

    expect(toast.info).toHaveBeenCalledWith(T.geo_denied);
    // The copy has to name the way out, not just report the failure.
    expect(T.geo_denied).toMatch(/עיר/);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(sortSelect().value).not.toBe("nearest");
  });

  it("timeout and unavailable get their own strings, never the browser's", async () => {
    mockGeolocation((_ok, fail) =>
      fail({ code: 3, message: "Timeout expired" }),
    );
    await renderMap();

    await act(async () => {
      fireEvent.change(sortSelect(), { target: { value: "nearest" } });
    });

    expect(toast.info).toHaveBeenCalledWith(T.geo_timeout);
    // W3C: GeolocationPositionError.message is English-only and
    // developer-facing. It must never reach a user.
    expect(toast.info).not.toHaveBeenCalledWith("Timeout expired");
  });

  it("with a location already stored, choosing מרחק does not re-prompt", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ lat: 32.08, lng: 34.78 }),
    );
    const getCurrentPosition = mockGeolocation(() => {});
    await renderMap();

    fireEvent.change(sortSelect(), { target: { value: "newest" } });
    fireEvent.change(sortSelect(), { target: { value: "nearest" } });

    expect(getCurrentPosition).not.toHaveBeenCalled();
  });
});

describe("MEH-2014 — the clear affordance", () => {
  it("is absent when there is nothing to clear", async () => {
    mockGeolocation(() => {});
    await renderMap();

    expect(screen.queryByTestId("clear-user-location")).not.toBeInTheDocument();
  });

  it("appears once a location is known, and clearing removes it", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ lat: 32.08, lng: 34.78 }),
    );
    mockGeolocation(() => {});
    await renderMap();

    // MEH-2014: BOTH shells render the control (desktop `hidden lg:grid`,
    // mobile `lg:hidden`) — jsdom applies no CSS, so both are in the tree.
    // Asserting the COUNT is deliberate: it pins that there are exactly two
    // (one per shell) rather than an accidental third render, and clicking
    // either must clear.
    const clears = screen.getAllByTestId("clear-user-location");
    expect(clears).toHaveLength(2);
    await act(async () => {
      fireEvent.click(clears[0]);
    });

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    // Persisting across tab close is only safe if there is a way out — this
    // is that way out, and it must also drop the now-meaningless sort.
    expect(sortSelect().value).toBe("newest");
    expect(screen.queryAllByTestId("clear-user-location")).toHaveLength(0);
  });
});
