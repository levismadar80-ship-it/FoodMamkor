import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProducersClient from "@/components/ProducersClient";

// MEH-1825: the delivery-day axis on /producers — the surface MEH-1774 declared
// canonical. Before this ticket DeliveryDayRow was mounted only by the home
// grid, so tapping "משלוח" on home deep-linked to the one page where the day
// filter did not exist. These cases pin the four behaviours the ticket's
// acceptance criteria name, all of which are about the CITY PRECONDITION:
// delivery_day is meaningless without delivery_city (MEH-1645 same-row EXISTS),
// so it must never be hydrated, written to the URL, or sent to the API alone.

const router = { replace: vi.fn(), push: vi.fn() };
let params = {};

const { apiGet } = vi.hoisted(() => ({
  apiGet: vi.fn(() => Promise.resolve({ data: [], headers: { "x-total-count": "0" } })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => ({
    // MEH-2036: a repeated key is expressed as an ARRAY value in `params`.
    // get() returns the first member (URLSearchParams semantics); getAll()
    // returns the whole list, flattened — NOT a nested array.
    get: (k) => (k in params ? (Array.isArray(params[k]) ? params[k][0] ?? null : params[k]) : null),
    getAll: (k) => (k in params ? [params[k]].flat() : []),
  }),
}));
vi.mock("next-intl", () => ({ useTranslations: (s) => (k) => (s ? `${s}.${k}` : k) }));
vi.mock("next/link", () => ({ default: ({ children, href }) => <a href={href}>{children}</a> }));
// Enumerated, not a Proxy: a Proxy's getter runs during ProducersClient's
// import and dereferences the JSX runtime before vitest has initialised it.
vi.mock("@phosphor-icons/react", () => ({
  Faders: (p) => <span {...p} />,  // MEH-1862 — the "סינון" trigger icon
  MagnifyingGlass: (p) => <span {...p} />,
  MapPin: (p) => <span {...p} />,
  Plant: (p) => <span {...p} />,
  Leaf: (p) => <span {...p} />,
  CaretDown: (p) => <span {...p} />,
  SealCheck: (p) => <span {...p} />,
  Truck: (p) => <span {...p} />,
  Certificate: (p) => <span {...p} />,
  GrainsSlash: (p) => <span {...p} />,
  Barn: (p) => <span {...p} />,
  DropSlash: (p) => <span {...p} />,
  FlowerTulip: (p) => <span {...p} />,
}));
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
vi.mock("@/components/Breadcrumb", () => ({ default: () => null }));
vi.mock("@/components/ProducerCard", () => ({ default: () => <div data-testid="card" /> }));
vi.mock("@/components/ChipScrollRow", () => ({
  default: ({ chips = [], onChipClick }) => (
    <div data-testid="chip-row">
      <button data-testid="chip-city" onClick={() => onChipClick("city")}>city</button>
      {chips.map((c) => (
        <button key={c.key} onClick={() => onChipClick(c.key)}>{c.label}</button>
      ))}
    </div>
  ),
}));
vi.mock("@/components/LocationModal", () => ({
  default: ({ open }) => (open ? <div data-testid="location-modal" /> : null),
}));
vi.mock("@/components/Skeleton", () => ({ SkeletonProducerGrid: () => null }));
vi.mock("@/lib/producer-filters", () => ({
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
}));
vi.mock("@/lib/use-user-city", () => ({
  useUserCity: () => ({ city: null, setCity: vi.fn(), clearCity: vi.fn() }),
}));
vi.mock("@/lib/recently-viewed", () => ({ getRecentlyViewedIds: () => [] }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/api", () => ({ default: { get: apiGet } }));

const PROPS = { initialItems: [], initialTotal: 0, initialPage: 1, totalPages: 1, perPage: 12 };

/** Params of every GET /producers call, flattened. */
const listingCalls = () =>
  apiGet.mock.calls.filter(([url]) => url === "/producers").map(([, cfg]) => cfg?.params ?? {});

const urlParam = (k) => new URLSearchParams(window.location.search).get(k);
/** MEH-2036: the day axis serializes as REPEATED ?delivery_days= keys. */
const urlParams = (k) => new URLSearchParams(window.location.search).getAll(k);

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  params = {};
  apiGet.mockClear();
});

describe("ProducersClient delivery-day axis (MEH-1825)", () => {
  it("hydrates city + day from the URL and filters on load", () => {
    params = { city: "חיפה", delivery_day: "שלישי" };
    render(<ProducersClient {...PROPS} />);

    // The pill reads active — aria-pressed is the row's own state contract.
    expect(screen.getByTestId("delivery-day-pill-שלישי")).toHaveAttribute("aria-pressed", "true");
    // Not a ghost: a city is present, so the hint must be gone.
    expect(screen.getByTestId("delivery-day-row")).toHaveAttribute("data-ghost", "false");
    expect(screen.queryByTestId("delivery-day-hint")).toBeNull();
    // And the mount fetch carried BOTH params.
    // MEH-2036: the legacy SINGULAR ?delivery_day= is still accepted on
    // hydration (back-compat for old shared links) — it just becomes a
    // one-member set, and the fetch uses the plural param name.
    expect(listingCalls()[0]).toMatchObject({ delivery_city: "חיפה", delivery_days: ["שלישי"] });
  });

  it("tapping the active day clears it and removes the URL param", () => {
    params = { city: "חיפה", delivery_day: "שלישי" };
    render(<ProducersClient {...PROPS} />);
    apiGet.mockClear();

    fireEvent.click(screen.getByTestId("delivery-day-pill-שלישי"));

    expect(screen.getByTestId("delivery-day-pill-שלישי")).toHaveAttribute("aria-pressed", "false");
    expect(urlParams("delivery_days")).toEqual([]);
    expect(urlParam("city")).toBe("חיפה");
    // The refetch keeps the city and drops the day.
    expect(listingCalls()[0]).toMatchObject({ delivery_city: "חיפה" });
    expect(listingCalls()[0]).not.toHaveProperty("delivery_days");
  });

  it("tapping an inactive day sets it and writes it to the URL", () => {
    params = { city: "חיפה" };
    render(<ProducersClient {...PROPS} />);
    apiGet.mockClear();

    fireEvent.click(screen.getByTestId("delivery-day-pill-שישי"));

    expect(screen.getByTestId("delivery-day-pill-שישי")).toHaveAttribute("aria-pressed", "true");
    expect(urlParams("delivery_days")).toEqual(["שישי"]);
    expect(listingCalls()[0]).toMatchObject({ delivery_city: "חיפה", delivery_days: ["שישי"] });
  });

  // ---- MEH-2036: multi-select on the canonical listing surface ----

  it("tapping a SECOND day adds it — both pressed, both in URL and fetch", () => {
    params = { city: "חיפה", delivery_day: "שלישי" };
    render(<ProducersClient {...PROPS} />);
    apiGet.mockClear();

    fireEvent.click(screen.getByTestId("delivery-day-pill-שישי"));

    expect(screen.getByTestId("delivery-day-pill-שלישי")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("delivery-day-pill-שישי")).toHaveAttribute("aria-pressed", "true");
    expect(urlParams("delivery_days")).toEqual(["שלישי", "שישי"]);
    expect(listingCalls()[0]).toMatchObject({
      delivery_city: "חיפה",
      delivery_days: ["שלישי", "שישי"],
    });
  });

  it("un-toggling one of two days removes ONLY that day", () => {
    params = { city: "חיפה" };
    render(<ProducersClient {...PROPS} />);
    fireEvent.click(screen.getByTestId("delivery-day-pill-שלישי"));
    fireEvent.click(screen.getByTestId("delivery-day-pill-שישי"));
    apiGet.mockClear();

    fireEvent.click(screen.getByTestId("delivery-day-pill-שלישי"));

    expect(screen.getByTestId("delivery-day-pill-שלישי")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("delivery-day-pill-שישי")).toHaveAttribute("aria-pressed", "true");
    expect(urlParams("delivery_days")).toEqual(["שישי"]);
  });

  it("hydrates a repeated ?delivery_days=, dropping invalid and duplicate members", () => {
    params = { city: "חיפה", delivery_days: ["רביעי", "רביעי", "nope", "שישי"] };
    render(<ProducersClient {...PROPS} />);

    expect(screen.getByTestId("delivery-day-pill-רביעי")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("delivery-day-pill-שישי")).toHaveAttribute("aria-pressed", "true");
    expect(listingCalls()[0]).toMatchObject({
      delivery_city: "חיפה",
      delivery_days: ["רביעי", "שישי"],
    });
  });

  it("the PLURAL wins over the legacy singular when a URL carries both", () => {
    params = { city: "חיפה", delivery_day: "שלישי", delivery_days: ["שישי"] };
    render(<ProducersClient {...PROPS} />);

    expect(screen.getByTestId("delivery-day-pill-שישי")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("delivery-day-pill-שלישי")).toHaveAttribute("aria-pressed", "false");
    expect(listingCalls()[0]).toMatchObject({ delivery_days: ["שישי"] });
  });

  // The precondition, stated three ways. Each of these is a distinct route by
  // which a day could otherwise reach the API without a city.
  it("delivery_day in the URL WITHOUT a city is ignored — ghost row, no crash", () => {
    params = { delivery_day: "שלישי" };
    render(<ProducersClient {...PROPS} />);

    expect(screen.getByTestId("delivery-day-row")).toHaveAttribute("data-ghost", "true");
    expect(screen.getByTestId("delivery-day-hint")).toBeInTheDocument();
    expect(screen.getByTestId("delivery-day-pill-שלישי")).toHaveAttribute("aria-pressed", "false");
    // Nothing was fetched at all — a bare day is not an active filter.
    expect(listingCalls()).toHaveLength(0);
  });

  it("an invalid ?delivery_day= value is dropped client-side, never sent", () => {
    params = { city: "חיפה", delivery_day: "יום-שאינו-קיים" };
    render(<ProducersClient {...PROPS} />);

    // The city still filters; the bogus day does not ride along (no 422).
    expect(listingCalls()[0]).toMatchObject({ delivery_city: "חיפה" });
    expect(listingCalls()[0]).not.toHaveProperty("delivery_days");
    expect(urlParams("delivery_days")).toEqual([]);
  });

  it("a ghost pill tap opens the LocationModal instead of filtering", () => {
    render(<ProducersClient {...PROPS} />);
    expect(screen.queryByTestId("location-modal")).toBeNull();

    fireEvent.click(screen.getByTestId("delivery-day-pill-שישי"));

    expect(screen.getByTestId("location-modal")).toBeInTheDocument();
    expect(urlParams("delivery_days")).toEqual([]);
    expect(listingCalls()).toHaveLength(0);
  });

  it("clearing the city drops the day with it", () => {
    params = { city: "חיפה", delivery_day: "שלישי" };
    render(<ProducersClient {...PROPS} />);

    // The city chip × is the clear path (cityFilter active → toggle clears).
    fireEvent.click(screen.getByTestId("chip-city"));

    expect(urlParam("city")).toBeNull();
    expect(urlParams("delivery_days")).toEqual([]);
    expect(screen.getByTestId("delivery-day-row")).toHaveAttribute("data-ghost", "true");
  });
});
