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

// The provider abstraction is the unit under contract here, not the network.
const geocodeCity = vi.fn();
vi.mock("@/lib/places", () => ({ geocodeCity: (...a) => geocodeCity(...a) }));

vi.mock("@/lib/use-user-city", () => ({ useUserCity: () => ({ setCity: vi.fn() }) }));
vi.mock("@/lib/rating-gate", () => ({ isRatingSortEnabled: () => false }));

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
vi.mock("@/components/MapBottomSheet", () => ({ default: () => null }));
vi.mock("@/app/[locale]/map/components/CityPickerModal", () => ({ default: () => null }));
vi.mock("@/app/[locale]/map/components/FilterChipsBar", () => ({ default: () => null }));
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
      selectedProducer: null,
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

const T = he.map.client.sort;

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

const stored = () => JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
const sortSelect = () => screen.getByLabelText(T.aria_label);

/**
 * The origin label renders once per shell (desktop + mobile are both in the
 * DOM; only CSS hides one), so this asserts the COUNT and reads the first.
 * `getByTestId` would throw on the legitimate double-mount, and `queryAll`
 * without a count assertion would hide a real one — the MEH-1771/1792 shape.
 */
function originLabels() {
  return screen.queryAllByTestId("sort-origin-label");
}

/** Pick a city through LocationModal's real onSelectCity prop. */
async function pickCity(city = "חיפה") {
  await act(async () => {
    fireEvent.click(screen.queryAllByTestId(`pick-${city}`)[0]);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  geocodeCity.mockResolvedValue({ lat: 32.794, lng: 34.9896 }); // חיפה
  mockGeolocation(() => {});
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("MEH-2014 PR 2 — a picked city becomes the sort origin", () => {
  it("picking a city geocodes it and stores a city-sourced origin", async () => {
    await renderMap();

    await pickCity();

    expect(geocodeCity).toHaveBeenCalledWith("חיפה");
    expect(stored()).toEqual({
      lat: 32.794,
      lng: 34.9896,
      source: "city",
      city: "חיפה",
    });
  });

  it("switches the sort to מרחק, which is the whole point of the origin", async () => {
    await renderMap();

    await pickCity();

    expect(sortSelect().value).toBe("nearest");
  });

  it("names the active origin on screen, in both shells", async () => {
    await renderMap();

    await pickCity();

    const labels = originLabels();
    // One per shell — desktop + mobile are both mounted, CSS hides one.
    expect(labels).toHaveLength(2);
    expect(labels[0]).toHaveTextContent("מרחק מ: חיפה");
  });

  it("still applies the city FILTER when the geocode fails", async () => {
    // The filter and the origin share one click. A provider outage must not
    // take down the pre-PR-2 behaviour that click already had.
    geocodeCity.mockResolvedValue(null);
    await renderMap();

    await pickCity();

    expect(setCityFilter).toHaveBeenCalledWith("חיפה");
    expect(stored()).toBe(null);
    expect(toast.info).toHaveBeenCalledWith(T.city_origin_failed);
  });

  it("a slow first lookup cannot overwrite a newer city's origin", async () => {
    // Found by adversarial review, not by the feature spec. The modal closes on
    // pick, so a second pick needs another denial — but that is a user action,
    // not a lock. Resolve the FIRST lookup last and assert the newest city wins;
    // without the request token the stored origin would be חיפה while the user
    // had already moved on, and the label would confidently name the wrong one.
    let resolveFirst;
    geocodeCity
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
      .mockResolvedValueOnce({ lat: 31.7683, lng: 35.2137 }); // ירושלים

    await renderMap();

    await pickCity(); // חיפה — hangs
    await pickCity("ירושלים"); // resolves immediately

    expect(stored().city).toBe("ירושלים");

    await act(async () => {
      resolveFirst({ lat: 32.794, lng: 34.9896 }); // חיפה lands late
    });

    expect(stored().city).toBe("ירושלים");
    expect(originLabels()[0]).toHaveTextContent("מרחק מ: ירושלים");
  });

  it("reports a provider rejection the same way, without unhandled rejection", async () => {
    // ProviderError (MEH-1766) — a disabled API key, not a missing city. The
    // user-facing outcome is identical; what must not happen is a throw that
    // escapes the handler.
    geocodeCity.mockRejectedValue(new Error("provider said no"));
    await renderMap();

    await pickCity();

    expect(toast.info).toHaveBeenCalledWith(T.city_origin_failed);
    expect(stored()).toBe(null);
  });
});

describe("MEH-2014 PR 2 — the two origins are mutually exclusive", () => {
  it("a city pick replaces a GPS fix", async () => {
    mockGeolocation((ok) => ok({ coords: { latitude: 32.08, longitude: 34.78 } }));
    await renderMap();

    // Establish a GPS origin through PR 1's trigger.
    await act(async () => {
      fireEvent.change(sortSelect(), { target: { value: "nearest" } });
    });
    expect(stored()).toEqual({ lat: 32.08, lng: 34.78 });

    await pickCity();

    // One key, so the replacement is structural — not two records racing.
    expect(stored().source).toBe("city");
    expect(stored().city).toBe("חיפה");
  });

  it("a GPS fix replaces a city origin, and the label says so", async () => {
    await renderMap();
    await pickCity();
    expect(originLabels()[0]).toHaveTextContent("מרחק מ: חיפה");

    // Via the crosshair, NOT the sort select: with an origin already stored,
    // re-choosing "מרחק" is a no-op by PR 1's design (it does not re-prompt).
    // Asserting through the select would have tested a path that does not
    // exist and read as a bug in the feature.
    mockGeolocation((ok) => ok({ coords: { latitude: 32.08, longitude: 34.78 } }));
    await act(async () => {
      // One per shell, same as every other control here — take the first.
      fireEvent.click(screen.queryAllByTestId("gps-crosshair")[0]);
    });

    // "most recent choice wins, and the UI says which is active"
    expect(stored()).toEqual({ lat: 32.08, lng: 34.78 });
    expect(originLabels()[0]).toHaveTextContent(T.origin_gps);
  });

  it("clearing a city origin removes both the record and the label", async () => {
    await renderMap();
    await pickCity();
    expect(originLabels()).toHaveLength(2);

    const clear = screen.queryAllByTestId("clear-user-location")[0];
    await act(async () => {
      fireEvent.click(clear);
    });

    expect(stored()).toBe(null);
    expect(originLabels()).toHaveLength(0);
  });
});

describe("MEH-2014 PR 2 — don't-regress guards (green before AND after)", () => {
  it("does not geocode on page load", async () => {
    // Paired with "picking a city geocodes it", which IS red against old code.
    // Alone this passes vacuously on any tree where the feature is absent.
    await renderMap();

    expect(geocodeCity).not.toHaveBeenCalled();
  });

  it("renders no origin label when nothing is stored", async () => {
    // Same pairing: "names the active origin" is the half that discriminates.
    await renderMap();

    expect(originLabels()).toHaveLength(0);
  });
});
