import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import ProducersClient from "@/components/ProducersClient";
import api from "@/lib/api";

// MEH-2987: the «לא מצאנו» empty state offers category chips as a way out of a
// search that found nothing. They were same-route Links (`/producers?category=X`),
// and ProducersClient reads q / category from the URL once, on mount — so a tap
// changed the URL and nothing else: the search stayed and the list stayed empty
// (reproduced on staging 12/11 with «משק הכרמל» → «חלב וגבינות»).
//
// Discrimination: on the old code the chip was an <a>, so `getAllByTestId(
// "producers-empty-category")` finds nothing and every case below goes red.
// The fetch assertion (no q, category=[id]) is the behaviour itself, not the
// markup: a button that kept the q would still fail it.
const router = { replace: vi.fn(), push: vi.fn() };
let params = {}; // drives useSearchParams().get(key)

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => ({
    get: (k) => (k in params ? params[k] : null),
    // MEH-1465: categoryFilter inits via getAll (repeated ?category=).
    getAll: (k) => (k in params ? [params[k]] : []),
  }),
}));
vi.mock("next-intl", () => ({ useTranslations: (s) => (k) => (s ? `${s}.${k}` : k) }));
vi.mock("next/link", () => ({ default: ({ children, href }) => <a href={href}>{children}</a> }));
// MEH-990: ProducersClient now renders MapPin/Plant/Leaf icons too (Emoji LOCK
// swap of 📍🌱🌿) — mock all four so the partial mock doesn't throw on render.
vi.mock("@phosphor-icons/react", () => ({
  // MEH-2827 PR 4: the «המליצו על בית עסק» links in the empty states.
  ArrowLeft: (p) => <span {...p} />,
  // MEH-2131: the open-now chip's leading glyph (lib/chip-icons.js). Absent
  // here, the whole suite dies at import with "No \"Clock\" export is defined".
  Clock: (p) => <span {...p} />,
  // MEH-2186: DeliveryDayRow became a dropdown chip and now imports these.
  // This mock is enumerated by hand (a Proxy dereferences the JSX runtime at
  // import time), so a glyph the component imports and this list omits kills
  // the whole file at import with 'No "X" export is defined' — the same trap
  // the MEH-2131 note above records.
  CalendarBlank: (p) => <span {...p} />,
  CaretUp: (p) => <span {...p} />,
  X: (p) => <span {...p} />,
  Faders: (p) => <span {...p} />,  // MEH-1862 — the "סינון" trigger icon
  MagnifyingGlass: (p) => <span {...p} />,
  MapPin: (p) => <span {...p} />,
  Plant: (p) => <span {...p} />,
  Leaf: (p) => <span {...p} />,
  // MEH-2169: chip-icons.js gained vegetarian -> Carrot and
  // no_added_sugar -> Cube. This mock enumerates exports by hand, so a new
  // glyph in the registry kills the whole suite at import time with
  // 'No "Carrot" export is defined' — not a failing assertion, a dead file.
  Carrot: (p) => <span {...p} />,
  Cube: (p) => <span {...p} />,
  CaretDown: (p) => <span {...p} />, // MEH-1483: sort-select caret
  // MEH-1418: chip leading icons (via lib/chip-icons.js).
  SealCheck: (p) => <span {...p} />,
  Truck: (p) => <span {...p} />,
  // MEH-2046: chip-icons maps pickup_points -> Package.
  Package: (p) => <span {...p} />,
  Storefront: () => null, // MEH-2598: chip-icons on_site
  Certificate: (p) => <span {...p} />,
  GrainsSlash: (p) => <span {...p} />,
  Barn: (p) => <span {...p} />,
  Medal: (p) => <span {...p} />,
  HandHeart: (p) => <span {...p} />,
  DropSlash: (p) => <span {...p} />,
  // Category-tint: ProducersClient now imports CATEGORY_STYLES from
  // lib/map-categories.js, which pulls FlowerTulip from Phosphor.
  FlowerTulip: (p) => <span {...p} />,
}));

// MEH-1441: ProducersClient now imports CATEGORY_ICONS for the category-chip
// glyphs. Stub the icon module so its real Phosphor imports don't need adding
// to the partial mock above (search wiring here doesn't render category glyphs).
// Category-tint: lib/map-categories.js (imported by ProducersClient for the tint
// lookup) pulls these named glyphs too, so the strict mock must export them.
vi.mock("@/components/CategoryIcons", () => {
  const Glyph = (p) => <span {...p} />;
  return {
    CATEGORY_ICONS: {},
    Meat: Glyph,
    FishSimple: Glyph,
    Cheese: Glyph,
    Bread: Glyph,
    OliveOil: Glyph,
    Hive: Glyph,
  };
});

// Child components — render nothing meaningful; we only test the search wiring.
vi.mock("@/components/Breadcrumb", () => ({ default: () => null }));
vi.mock("@/components/ProducerCard", () => ({ default: () => <div data-testid="card" /> }));
vi.mock("@/components/ChipScrollRow", () => ({ default: () => null }));
vi.mock("@/components/LocationModal", () => ({ default: () => null }));
vi.mock("@/components/Skeleton", () => ({ SkeletonProducerGrid: () => null }));
// MEH-819: the /en search-locale notice moved here from /search. The locale
// gate (renders on /en, nothing on /he) is the component's own contract and
// is pinned both ways in EnSearchNotice.test.jsx; this file pins only that
// /producers mounts it at all, since a dropped mount is invisible to that test.
vi.mock("@/components/EnSearchNotice", () => ({ default: () => <div data-testid="en-search-notice-mount" /> }));

// Filter lib — neutralize chips so syncUrl only handles q.
vi.mock("@/lib/producer-filters", () => ({
  // MEH-2767: the one chip gate. Identity — these specs do not exercise gating.
  visibleAxisChips: ({ chips }) => chips,
  // MEH-1862: ProducersClient now imports this to attach FilterSheet group
  // metadata, and a partial vi.mock throws on any export it omits (same
  // reason the MEH-1881 names above are stubbed). Identity is the right
  // stub here: these specs never open the sheet, so the group a chip would
  // be filed under is irrelevant, while dropping chips would not be.
  withChipGroups: (chips = []) => chips,
  buildChipParams: () => ({}),
  CHIPS_CONFIG: [],
  CHIPS_DEFAULT: {},
  // MEH-1881: ProducersClient now imports this threshold, and a partial
  // vi.mock throws on any export it omits — so the stub has to carry it
  // even though nothing here exercises the gate. A number keeps the gate
  // arithmetic well-defined; `undefined` would make `n >= undefined`
  // false forever and silently hide the chip in every one of these specs.
  OPEN_NOW_CHIP_MIN: 5,
  // MEH-1881: /producers renders a superset of the shared chip row; these
  // are the names ProducersClient imports. Empty/`{}` keeps these specs
  // chip-agnostic, exactly as CHIPS_CONFIG/CHIPS_DEFAULT did before.
  PRODUCERS_CHIPS_CONFIG: [],
  PRODUCERS_CHIPS_DEFAULT: {},
  // MEH-1934: a partial vi.mock throws on any export the component imports.
  GATED_DIET_KEYS: [],
  visibleGatedDietKeys: () => [],
  // MEH-2131: same rule again — a partial vi.mock throws on any export the
  // component imports. `false` (chip hidden) rather than `true` on purpose:
  // these specs are chip-agnostic, and the pre-MEH-2131 stub above
  // (`CHIPS_CONFIG: []`) already rendered no attribute chips, so hiding keeps
  // them measuring exactly what they measured before.
  openNowChipVisible: () => false,
}));
vi.mock("@/lib/use-user-city", () => ({
  useUserCity: () => ({ city: null, setCity: vi.fn(), clearCity: vi.fn() }),
}));
vi.mock("@/lib/recently-viewed", () => ({ getRecentlyViewedIds: () => [] }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/api", () => ({ /* overridden below */
  default: { get: vi.fn(() => Promise.resolve({ data: [], headers: { "x-total-count": "0" } })) },
}));


const PROPS = { initialItems: [], initialTotal: 0, initialPage: 1, totalPages: 1, perPage: 12 };
const CATS = [
  { id: 2, name: "חלב וגבינות" },
  { id: 7, name: "דבש" },
];

function stubApi(cats) {
  api.get.mockImplementation((url) =>
    Promise.resolve({
      data: url === "/categories" ? cats : [],
      headers: { "x-total-count": "0" },
    }),
  );
}

// Lets the mount fetches (/categories, the q search) resolve and re-render.
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

const producerCalls = () =>
  api.get.mock.calls.filter(([url]) => url === "/producers").map(([, cfg]) => cfg?.params ?? {});

beforeEach(() => {
  window.history.replaceState(null, "", "/producers?q=x");
  params = { q: "משק הכרמל" };
  api.get.mockReset();
});

describe("MEH-2987 — empty-state category chips actually switch the view", () => {
  it("many categories: tapping one drops the search, fetches that category, pushes ?category=", async () => {
    stubApi(CATS);
    const push = vi.spyOn(window.history, "pushState");
    render(<ProducersClient {...PROPS} />);
    await flush();

    const chips = screen.getAllByTestId("producers-empty-category");
    expect(chips.map((c) => c.textContent)).toEqual(["חלב וגבינות", "דבש"]);

    fireEvent.click(chips[0]);
    await flush();

    const last = producerCalls().at(-1);
    expect(last.category).toEqual(["2"]);
    expect(last.q).toBeUndefined();
    // The box no longer shows the dead search.
    expect(screen.getByRole("searchbox")).toHaveValue("");
    // A new view → pushState (Back returns to the search), and the URL names it.
    expect(push).toHaveBeenCalled();
    expect(window.location.search).toBe("?category=2");
    push.mockRestore();
  });

  it("one category: the single chip works the same way", async () => {
    stubApi([CATS[1]]);
    render(<ProducersClient {...PROPS} />);
    await flush();

    const chips = screen.getAllByTestId("producers-empty-category");
    expect(chips).toHaveLength(1);
    fireEvent.click(chips[0]);
    await flush();
    expect(producerCalls().at(-1).category).toEqual(["7"]);
    expect(window.location.search).toBe("?category=7");
  });

  it("zero categories: no chip row, the clear-all button is still there", async () => {
    stubApi([]);
    render(<ProducersClient {...PROPS} />);
    await flush();
    expect(screen.getByTestId("producers-filter-empty")).toBeInTheDocument();
    expect(screen.queryAllByTestId("producers-empty-category")).toHaveLength(0);
    expect(screen.getByTestId("producers-empty-clear")).toBeInTheDocument();
  });
});

describe("MEH-2987 — header search on /producers keeps the active filter in the URL", () => {
  it("?focus=1 alongside a live search writes the search back over the URL", async () => {
    stubApi([]);
    // The header pushed /producers?focus=1 — q is gone from the URL, but the
    // page (mounted earlier) still holds it. Simulate with q hydrated + focus.
    params = { q: "לחם", focus: "1" };
    window.history.replaceState(null, "", "/producers?focus=1");
    render(<ProducersClient {...PROPS} />);
    await flush();
    expect(screen.getByRole("searchbox")).toHaveFocus();
    expect(window.location.search).toBe(`?q=${encodeURIComponent("לחם")}`);
  });
});

describe("MEH-2987 — Back re-reads the filters from the URL", () => {
  it("popstate to a search URL restores the search and refetches it", async () => {
    stubApi(CATS);
    render(<ProducersClient {...PROPS} />);
    await flush();
    fireEvent.click(screen.getAllByTestId("producers-empty-category")[0]);
    await flush();
    expect(screen.getByRole("searchbox")).toHaveValue("");

    // Back: the browser restores the previous entry's URL, then fires popstate.
    await act(async () => {
      window.history.replaceState(null, "", `/producers?q=${encodeURIComponent("משק הכרמל")}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await flush();

    expect(screen.getByRole("searchbox")).toHaveValue("משק הכרמל");
    const last = producerCalls().at(-1);
    expect(last.q).toBe("משק הכרמל");
    expect(last.category).toBeUndefined();
    expect(screen.getByTestId("producers-filter-empty")).toBeInTheDocument();
  });

  it("popstate to the bare URL clears every filter (no refetch with a stale category)", async () => {
    stubApi(CATS);
    params = { category: "2" };
    window.history.replaceState(null, "", "/producers?category=2");
    render(<ProducersClient {...PROPS} />);
    await flush();
    const before = producerCalls().length;

    await act(async () => {
      window.history.replaceState(null, "", "/producers");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await flush();

    expect(producerCalls().length).toBe(before);
    expect(screen.queryByTestId("producers-filter-empty")).not.toBeInTheDocument();
  });
});
