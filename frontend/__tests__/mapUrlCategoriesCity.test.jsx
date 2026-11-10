/**
 * MEH-2049 (PR 2, "option 1") — /map's category selection and city live in
 * /map's URL, next to the attribute toggles MEH-2598 already put there.
 *
 *  - lib/filter-url: one reader/writer pair owns the param names
 *    (`category_group`, `city`), so writer and reader cannot disagree
 *    (the MEH-1826 trap). Invalid values are dropped silently (MEH-2036).
 *  - useMapFilters: hydrates both from the URL on mount, mirrors them back with
 *    replaceState (never pushState).
 *  - useProducersFeed: the first fetch carries the URL city; a URL category is
 *    a second load once /categories answers, and a latest-wins guard keeps an
 *    older response from overwriting a newer one.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("next-intl", () => ({ useTranslations: () => (k) => k }));

const apiGet = vi.fn();
vi.mock("@/lib/api", () => ({ default: { get: (...a) => apiGet(...a) } }));
const toastError = vi.fn();
vi.mock("@/lib/toast", () => ({ showToast: { error: (...a) => toastError(...a) } }));

import {
  MAP_CATEGORY_PARAM,
  CITY_PARAM,
  mapFiltersFromQuery,
  writeMapFilters,
} from "@/lib/filter-url";
import { chipsFromQuery } from "@/lib/filter-url";
import { TOGGLE_CHIPS, chipStateToParams } from "@/lib/map-chips";
import { useMapFilters } from "@/app/[locale]/map/state/useMapFilters";
import { useProducersFeed } from "@/app/[locale]/map/state/useProducersFeed";

// Names taken from CATEGORY_CHIPS' `matches` (lib/map-chips.js).
const DB_CATEGORIES = [
  { id: 3, name: "בשר" },
  { id: 7, name: "חלב וגבינות" },
  { id: 9, name: "לחמים ואפייה" },
];

const roundTrip = (state) =>
  mapFiltersFromQuery(new URLSearchParams(writeMapFilters(new URLSearchParams(), state).toString()));

describe("lib/filter-url — category selection + city", () => {
  it("uses its own category param name, not /producers' id-valued `category`", () => {
    expect(MAP_CATEGORY_PARAM).toBe("category_group");
    expect(CITY_PARAM).toBe("city");
  });

  it("round-trips several category keys in selection order, and the city", () => {
    expect(roundTrip({ categoryKeys: ["dairy", "meat", "bread"], city: "תל אביב-יפו" })).toEqual({
      categoryKeys: ["dairy", "meat", "bread"],
      city: "תל אביב-יפו",
    });
    expect(roundTrip({ categoryKeys: ["bread", "dairy"], city: 'ראשל"צ' })).toEqual({
      categoryKeys: ["bread", "dairy"],
      city: 'ראשל"צ',
    });
    expect(roundTrip({ categoryKeys: [], city: "" })).toEqual({ categoryKeys: [], city: "" });
  });

  it("drops unknown, duplicate and `all` keys, keeping URL order", () => {
    const q = new URLSearchParams(
      "category_group=meat&category_group=nope&category_group=all&category_group=meat&category_group=care",
    );
    expect(mapFiltersFromQuery(q).categoryKeys).toEqual(["meat", "care"]);
  });

  it("drops an empty, blank or garbage city, and trims a real one", () => {
    for (const bad of ["", "   ", "123", "<script>", "ת", "a=b&c", "x".repeat(61)]) {
      expect(mapFiltersFromQuery(new URLSearchParams({ city: bad })).city, bad).toBe("");
    }
    expect(mapFiltersFromQuery(new URLSearchParams({ city: "  חיפה " })).city).toBe("חיפה");
  });

  it("keeps what real keyboards type: iOS smart quotes, the maqaf, an em dash", () => {
    for (const city of [
      "ג\u2019סר א-זרקא", // U+2019, iOS turns ' into it
      "מג\u2019דל שמס",
      "\u2018ין אל-אסד", // U+2018
      "תל אביב\u05BEיפו", // maqaf
      "מודיעין\u2014מכבים", // em dash
    ]) {
      expect(mapFiltersFromQuery(new URLSearchParams({ city })).city, city).toBe(city);
    }
  });

  it("reads a server searchParams record too", () => {
    expect(mapFiltersFromQuery({ category_group: ["dairy", "x"], city: "עכו" })).toEqual({
      categoryKeys: ["dairy"],
      city: "עכו",
    });
  });

  it("writes only its two params and leaves the rest alone", () => {
    const sp = new URLSearchParams("utm_source=x&city=old&category_group=meat");
    writeMapFilters(sp, { categoryKeys: ["bread"], city: "123" });
    expect(sp.toString()).toBe("utm_source=x&category_group=bread");
  });
});

describe("useMapFilters — category + city ⇄ URL", () => {
  let replaceSpy;
  let pushSpy;
  const setup = (search, categories = []) => {
    window.history.replaceState(null, "", `/map${search}`);
    replaceSpy = vi.spyOn(window.history, "replaceState");
    pushSpy = vi.spyOn(window.history, "pushState");
    return renderHook(() =>
      useMapFilters({
        allProducers: [],
        categories,
        loadProducers: vi.fn(),
        userCity: "",
        setUserCity: vi.fn(),
        setShowCityPicker: vi.fn(),
      }),
    ).result;
  };
  const sp = () => new URLSearchParams(window.location.search);
  afterEach(() => vi.restoreAllMocks());

  it("hydrates categoryKeys and city from the URL on mount, dropping an unknown key", () => {
    const result = setup("?category_group=dairy&category_group=nope&category_group=meat&city=חיפה&utm_source=x");
    expect(result.current.chipState.categoryKeys).toEqual(["dairy", "meat"]);
    expect(result.current.cityFilter).toBe("חיפה");
    // The invalid key is gone from the URL too; the rest is kept.
    expect(sp().getAll("category_group")).toEqual(["dairy", "meat"]);
    expect(sp().get("city")).toBe("חיפה");
    expect(sp().get("utm_source")).toBe("x");
  });

  it("drops a garbage city on mount and clears it from the URL", () => {
    const result = setup("?city=%3Cscript%3E");
    expect(result.current.cityFilter).toBe("");
    expect(sp().has("city")).toBe(false);
  });

  it("writes category and city changes with replaceState, never pushState", () => {
    const result = setup("?utm_source=x");
    act(() => result.current.onCategoryChipClick("bread"));
    act(() => result.current.onCategoryChipClick("dairy"));
    expect(sp().getAll("category_group")).toEqual(["bread", "dairy"]);
    act(() => result.current.setCityFilter("באר שבע"));
    expect(sp().get("city")).toBe("באר שבע");
    expect(replaceSpy).toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();

    act(() => result.current.onCategoryChipClick("all"));
    act(() => result.current.setCityFilter(""));
    expect(sp().has("category_group")).toBe(false);
    expect(sp().has("city")).toBe(false);
    expect(sp().get("utm_source")).toBe("x");
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("does not write a typed, unknown partial city to the URL; a known one, it does", () => {
    const result = setup("?utm_source=x");
    // CitySearch's onChange(value, { known }) — MapClient passes setCityFilter through.
    act(() => result.current.setCityFilter("תל", { known: false }));
    expect(result.current.cityFilter).toBe("תל");
    expect(sp().has("city")).toBe(false);
    act(() => result.current.setCityFilter("תל אביב-יפו", { known: true }));
    expect(sp().get("city")).toBe("תל אביב-יפו");
    // Editing it again keeps the committed city in the URL until the next commit.
    act(() => result.current.setCityFilter("תל אביב-י", { known: false }));
    expect(result.current.cityFilter).toBe("תל אביב-י");
    expect(sp().get("city")).toBe("תל אביב-יפו");
    expect(sp().get("utm_source")).toBe("x");
  });

  it("a submitted search commits the typed city, known or not", () => {
    const result = setup("");
    act(() => result.current.setCityFilter("בנימינה", { known: false }));
    expect(sp().has("city")).toBe(false);
    act(() => result.current.handleCityFilter());
    expect(sp().get("city")).toBe("בנימינה");
  });

  it("a replaceState that throws (Safari's rate limit) does not break the filter", () => {
    const result = setup("");
    replaceSpy.mockImplementation(() => {
      throw new DOMException("Attempt to use history.replaceState() more than 100 times per 30 seconds", "SecurityError");
    });
    expect(() => act(() => result.current.onCategoryChipClick("bread"))).not.toThrow();
    expect(result.current.chipState.categoryKeys).toEqual(["bread"]);
    expect(replaceSpy).toHaveBeenCalled();
  });

  it("drops a known key with no category in this catalog once the catalog is loaded", () => {
    const result = setup("?category_group=meat&category_group=care", DB_CATEGORIES);
    expect(result.current.chipState.categoryKeys).toEqual(["meat"]);
    expect(sp().getAll("category_group")).toEqual(["meat"]);
  });
});

// A promise whose resolution the test controls — no timers.
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useProducersFeed — latest-wins", () => {
  let producers; // [{ params, d }] in call order
  beforeEach(() => {
    apiGet.mockReset();
    toastError.mockReset();
    producers = [];
    window.history.replaceState(null, "", "/map");
    apiGet.mockImplementation((path, { params } = {}) => {
      if (path === "/categories") return Promise.resolve({ data: [] });
      const d = deferred();
      producers.push({ params, d });
      return d.promise;
    });
  });
  const ids = (result) => result.current.allProducers.map((p) => p.id);

  it("two overlapping loads, the FIRST resolving LAST: only the second's data stays", async () => {
    const { result } = renderHook(() => useProducersFeed());
    await act(async () => producers[0].d.resolve({ data: [{ id: "mount", name: "m" }] }));
    expect(ids(result)).toEqual(["mount"]);

    act(() => {
      result.current.loadProducers({ category: [1] });
      result.current.loadProducers({ category: [2] });
    });
    expect(producers).toHaveLength(3);

    await act(async () => producers[2].d.resolve({ data: [{ id: "second", name: "s" }] }));
    expect(ids(result)).toEqual(["second"]);
    expect(result.current.loading).toBe(false);

    await act(async () => producers[1].d.resolve({ data: [{ id: "first", name: "f" }] }));
    expect(ids(result)).toEqual(["second"]);
    expect(result.current.loading).toBe(false);
  });

  it("an older load answering first does not clear loading or set the list", async () => {
    const { result } = renderHook(() => useProducersFeed());
    await act(async () => producers[0].d.resolve({ data: [{ id: "mount", name: "m" }] }));
    act(() => {
      result.current.loadProducers({ category: [1] });
      result.current.loadProducers({ category: [2] });
    });
    await act(async () => producers[1].d.resolve({ data: [{ id: "first", name: "f" }] }));
    expect(ids(result)).toEqual(["mount"]);
    expect(result.current.loading).toBe(true);
    await act(async () => producers[2].d.resolve({ data: [{ id: "second", name: "s" }] }));
    expect(ids(result)).toEqual(["second"]);
    expect(result.current.loading).toBe(false);
  });

  it("a stale failure neither empties the list nor toasts", async () => {
    const { result } = renderHook(() => useProducersFeed());
    await act(async () => producers[0].d.resolve({ data: [{ id: "mount", name: "m" }] }));
    act(() => {
      result.current.loadProducers({ category: [1] });
      result.current.loadProducers({ category: [2] });
    });
    await act(async () => producers[2].d.resolve({ data: [{ id: "second", name: "s" }] }));
    await act(async () => producers[1].d.reject(new Error("late network error")));
    expect(ids(result)).toEqual(["second"]);
    expect(toastError).not.toHaveBeenCalled();
  });
});

// /map's two hooks wired as MapClient wires them (MapClient.jsx:313-349):
// readInitialParams reads the toggles from the URL the same way, and
// useMapFilters gets the feed's categories and loadProducers.
function useMapPage() {
  const feed = useProducersFeed({
    readInitialParams: () =>
      chipStateToParams(
        {
          categoryKeys: [],
          ...chipsFromQuery(new URLSearchParams(window.location.search), TOGGLE_CHIPS.map((c) => c.key)),
        },
        [],
      ),
  });
  const filters = useMapFilters({
    allProducers: feed.allProducers,
    catalogSnapshot: feed.catalogSnapshot,
    snapshotPending: feed.snapshotPending,
    categories: feed.categories,
    loadProducers: feed.loadProducers,
    userCity: "",
    setUserCity: () => {},
    setShowCityPicker: () => {},
  });
  return { feed, filters };
}

describe("/map — category + city from the URL (feed + filters together)", () => {
  let producers;
  let categories;
  beforeEach(() => {
    apiGet.mockReset();
    producers = [];
    categories = deferred();
    apiGet.mockImplementation((path, { params } = {}) => {
      if (path === "/categories") return categories.promise;
      const d = deferred();
      producers.push({ params, d });
      return d.promise;
    });
  });
  const ids = (result) => result.current.feed.allProducers.map((p) => p.id);
  const last = () => producers.at(-1).params;

  it("first filtered fetch carries the city; the catalog load wins even when the earlier load answers last", async () => {
    window.history.replaceState(null, "", "/map?on_site=1&city=חיפה&category_group=dairy");
    const { result } = renderHook(() => useMapPage());
    // Snapshot answers before /categories: the chained filtered load follows.
    await act(async () => producers[0].d.resolve({ data: [{ id: "all", name: "a" }] }));
    expect(producers[0].params).toEqual({});
    expect(producers[1].params).toEqual({ on_site: true, near_city: "חיפה" });

    // /categories answers → the category load is issued as the newest call.
    await act(async () => categories.resolve({ data: DB_CATEGORIES }));
    expect(producers).toHaveLength(3);
    expect(producers[2].params).toEqual({ on_site: true, near_city: "חיפה", category: [7] });

    await act(async () => producers[2].d.resolve({ data: [{ id: "dairy-haifa", name: "d" }] }));
    // The city-only load answers LAST — it must not overwrite the category one.
    await act(async () => producers[1].d.resolve({ data: [{ id: "haifa", name: "h" }] }));
    expect(ids(result)).toEqual(["dairy-haifa"]);
    expect(result.current.feed.loading).toBe(false);
    expect(result.current.feed.catalogSnapshot.map((p) => p.id)).toEqual(["all"]);
  });

  it("when /categories answers before the snapshot, the snapshot's chained load is skipped", async () => {
    // on_site=1 gives the snapshot a chained filtered load to skip.
    window.history.replaceState(null, "", "/map?on_site=1&category_group=dairy");
    const { result } = renderHook(() => useMapPage());
    await act(async () => categories.resolve({ data: DB_CATEGORIES }));
    expect(producers[1].params).toEqual({ on_site: true, category: [7] });
    await act(async () => producers[0].d.resolve({ data: [{ id: "all", name: "a" }] }));
    expect(producers).toHaveLength(2); // no chained { on_site: true } load
    expect(ids(result)).toEqual([]);
    expect(result.current.feed.catalogSnapshot.map((p) => p.id)).toEqual(["all"]);
    await act(async () => producers[1].d.resolve({ data: [{ id: "dairy", name: "d" }] }));
    expect(ids(result)).toEqual(["dairy"]);
  });

  it("a chip tapped before /categories answers is in the catalog load, not overwritten by the URL", async () => {
    window.history.replaceState(null, "", "/map?category_group=dairy");
    const { result } = renderHook(() => useMapPage());
    expect(result.current.filters.chipState.categoryKeys).toEqual(["dairy"]);
    act(() => result.current.filters.onCategoryChipClick("bread"));
    expect(result.current.filters.chipState.categoryKeys).toEqual(["dairy", "bread"]);

    await act(async () => categories.resolve({ data: DB_CATEGORIES }));
    expect(last()).toEqual({ category: [7, 9] }); // dairy + the tapped bread
    await act(async () => producers.at(-1).d.resolve({ data: [{ id: "dairy-bread", name: "x" }] }));
    // Every older load answers after it; none may overwrite it.
    for (const p of producers.slice(0, -1)) {
      await act(async () => p.d.resolve({ data: [{ id: "stale", name: "s" }] }));
    }
    expect(ids(result)).toEqual(["dairy-bread"]);
    expect(result.current.feed.loading).toBe(false);
  });

  it("«כל» tapped before /categories answers is not undone by the URL category", async () => {
    window.history.replaceState(null, "", "/map?category_group=dairy");
    const { result } = renderHook(() => useMapPage());
    act(() => result.current.filters.onCategoryChipClick("all"));
    await act(async () => categories.resolve({ data: DB_CATEGORIES }));
    // No category load: the selection is empty when the catalog arrives.
    expect(last()).toEqual({});
    expect(producers.some((p) => p.params.category)).toBe(false);
    await act(async () => producers.at(-1).d.resolve({ data: [{ id: "everything", name: "e" }] }));
    await act(async () => producers[0].d.resolve({ data: [{ id: "stale", name: "s" }] }));
    expect(ids(result)).toEqual(["everything"]);
    expect(result.current.filters.chipState.categoryKeys).toEqual([]);
  });

  it("with the משלוח chip on, the URL city goes out as delivery_city", async () => {
    window.history.replaceState(null, "", "/map?has_delivery=1&city=עכו");
    renderHook(() => useMapPage());
    await act(async () => producers[0].d.resolve({ data: [] }));
    expect(producers[1].params).toEqual({ has_delivery: true, delivery_city: "עכו" });
  });

  it("invalid URL values never reach the API (control: one unfiltered fetch)", async () => {
    window.history.replaceState(null, "", "/map?city=123&category_group=nope");
    renderHook(() => useMapPage());
    await act(async () => categories.resolve({ data: DB_CATEGORIES }));
    await act(async () => producers[0].d.resolve({ data: [] }));
    await waitFor(() => expect(producers).toHaveLength(1));
    expect(producers[0].params).toEqual({});
  });
});
