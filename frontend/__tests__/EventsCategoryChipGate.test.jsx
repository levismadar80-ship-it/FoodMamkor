import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import EventsClient from "@/app/[locale]/events/EventsClient";
import api from "@/lib/api";
import { EVENT_CATEGORIES, EXPERIENCE_CATEGORIES } from "@/lib/event-categories";
import { visibleCategoryChips, presentCategories } from "@/lib/event-category-gate";

// MEH-3124: Sapir, 14/11 — on /experiences every category chip showed, and
// «טעימות» led to «לא נמצאו תוצאות». A chip now shows only when its category
// has a result in the current city; a picked chip always stays; one category
// alone draws no category chip (it would return the same list as «הכל»).
// Cells: 0 / 1 / many categories × nothing picked / one picked.

let params = {}; // drives useSearchParams(); a value may be a string or an array

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (k) => (k in params ? [].concat(params[k])[0] : null),
    getAll: (k) => (k in params ? [].concat(params[k]) : []),
  }),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  Link: ({ children, href, ...props }) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next-intl", () => ({
  useTranslations: (ns) => (k) => (ns ? `${ns}.${k}` : k),
  useLocale: () => "he",
}));
vi.mock("next/link", () => ({
  default: ({ children, href }) => <a href={href}>{children}</a>,
}));
vi.mock("@phosphor-icons/react", () => {
  const Stub = () => null;
  return Object.fromEntries(
    [
      "ArrowCounterClockwise", "ArrowRight", "Basket", "CalendarBlank",
      "CalendarX", "CookingPot", "ForkKnife", "MapTrifold", "Path", "Plant",
      "Plus", "Rows", "Storefront",
    ].map((name) => [name, Stub]),
  );
});
// Rows come from `db`, filtered the way the server filters (city, then
// category IN) — so a gated chip is measured against a real response shape.
let db = [];
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn((_endpoint, config = {}) => {
      const p = config.params || {};
      const cats = [].concat(p.category ?? []);
      const data = db.filter(
        (r) => (!p.city || r.city === p.city) && (!cats.length || cats.includes(r.category)),
      );
      return Promise.resolve({ data });
    }),
  },
}));
// The row's save heart reads the auth context; not the subject here.
vi.mock("@/components/SaveButton", () => ({ default: () => null }));
vi.mock("@/lib/cloudinary", () => ({ optimizeCloudinary: (u) => u }));
vi.mock("@/lib/format-date", () => ({ formatEventDate: () => "" }));
vi.mock("@/components/Breadcrumb", () => ({ default: () => null }));
vi.mock("@/components/CalendarView", () => ({ default: () => null }));
vi.mock("@/components/CitySearch", () => ({
  default: ({ value, onChange, id }) => (
    <input data-testid="city-input" id={id} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock("@/components/ChipScrollRow", () => ({
  default: ({ chips, activeKey, activeKeys, onChipClick }) => {
    const selected =
      activeKeys instanceof Set
        ? activeKeys
        : new Set(activeKey && activeKey !== "all" ? [activeKey] : []);
    return (
      <div data-testid="chip-row">
        {chips.map((c) => (
          <button
            key={c.key}
            data-key={c.key}
            data-active={String(c.key === "all" ? selected.size === 0 : selected.has(c.key))}
            onClick={() => onChipClick(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>
    );
  },
}));


const key = (set, labelKey) => set.find((c) => c.labelKey === labelKey).key;
const MARKET = key(EVENT_CATEGORIES, "market");
const HARVEST = key(EVENT_CATEGORIES, "harvest");
const TASTING = key(EVENT_CATEGORIES, "tasting");
const COOKING = key(EXPERIENCE_CATEGORIES, "cooking");
const FOOD_TOUR = key(EXPERIENCE_CATEGORIES, "food_tour");
const EXP_TASTING = key(EXPERIENCE_CATEGORIES, "tasting");

let n = 0;
const row = (category, city = "חיפה") => ({
  id: ++n, title: `event ${n}`, event_date: "2026-12-01", event_time: "10:00",
  city, category, price: 0, producer_name: "בית עסק", description: "",
});
const setUrl = (url) => window.history.replaceState(null, "", url);
// Derived from the DOM: the chip keys actually drawn, «הכל» included. The
// date shortcuts (MEH-3118, `when:*`) are not categories — EventsDateChips
// pins them — so they are left out here.
const drawn = () =>
  [...(screen.queryByTestId("chip-row")?.querySelectorAll("[data-key]") ?? [])]
    .map((el) => el.dataset.key)
    .filter((k) => !k.startsWith("when:"));
const settle = () => waitFor(() => expect(screen.queryByRole("status")).toBeNull());

beforeEach(() => {
  params = {};
  db = [];
  setUrl("/events");
});
afterEach(cleanup);

describe("category chips show only categories with results (MEH-3124)", () => {
  it("/experiences — the screenshot case: «טעימות» with no row is not drawn", async () => {
    db = [row(COOKING), row(FOOD_TOUR), row(COOKING)];
    setUrl("/experiences");
    render(<EventsClient initialTab="experiences" />);
    await settle();
    await waitFor(() => expect(drawn()).toEqual(["all", COOKING, FOOD_TOUR]));
    expect(drawn()).not.toContain(EXP_TASTING);
  });

  it("many categories → those, in the fixed order (not the data's order)", async () => {
    db = [row(TASTING), row(MARKET)];
    render(<EventsClient />);
    await settle();
    await waitFor(() => expect(drawn()).toEqual(["all", MARKET, TASTING]));
  });

  it("one category → no category chip (the date shortcuts still draw the row)", async () => {
    db = [row(MARKET), row(MARKET)];
    render(<EventsClient />);
    await settle();
    await waitFor(() => expect(drawn()).toEqual(["all"]));
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(2); // the list stays
  });

  it("the city decides: a category with rows only in another city is hidden", async () => {
    db = [row(MARKET, "חיפה"), row(HARVEST, "חיפה"), row(TASTING, "עכו")];
    render(<EventsClient />);
    await settle();
    await waitFor(() => expect(drawn()).toEqual(["all", MARKET, HARVEST, TASTING]));

    fireEvent.change(screen.getByTestId("city-input"), { target: { value: "חיפה" } });
    await waitFor(() => expect(drawn()).toEqual(["all", MARKET, HARVEST]));
  });

  // The rule «a picked chip always stays» is pinned on the pure function below
  // ("1 present → … a picked one stays"): in the page a picked chip outside a
  // KNOWN set is unreachable, because a category-less load is the only thing
  // that learns a set. What the page can reach is this: city changed with a
  // chip picked → set unknown → every chip, the picked one included.
  it("a city change with a chip picked → set unknown → every chip (the way back stays)", async () => {
    db = [row(MARKET, "חיפה"), row(HARVEST, "חיפה"), row(MARKET, "עכו"), row(TASTING, "עכו")];
    render(<EventsClient />);
    await settle();
    await waitFor(() => expect(drawn()).toContain(HARVEST));
    fireEvent.click(screen.getByRole("button", { name: (_, el) => el.dataset.key === HARVEST }));
    fireEvent.change(screen.getByTestId("city-input"), { target: { value: "עכו" } });
    await settle();
    await waitFor(() => expect(screen.getByTestId("events-no-results")).toBeInTheDocument());
    // the way back is still on screen: the picked chip, so it can be untapped
    expect(drawn()).toEqual(["all", ...EVENT_CATEGORIES.map((c) => c.key)]);
  });

  it("a failed load forgets the last city's set — every chip shows", async () => {
    db = [row(MARKET, "חיפה"), row(HARVEST, "חיפה")];
    render(<EventsClient />);
    await settle();
    await waitFor(() => expect(drawn()).toEqual(["all", MARKET, HARVEST]));

    api.get.mockImplementationOnce(() => Promise.reject(new Error("timeout")));
    fireEvent.change(screen.getByTestId("city-input"), { target: { value: "עכו" } });
    await waitFor(() => expect(drawn()).toEqual(["all", ...EVENT_CATEGORIES.map((c) => c.key)]));
  });

  it("a deep link with a category (set unknown) shows every chip — fail open", async () => {
    db = [row(MARKET)];
    params = { category: MARKET };
    setUrl(`/events?category=${MARKET}`);
    render(<EventsClient />);
    await settle();
    expect(drawn()).toEqual(["all", ...EVENT_CATEGORIES.map((c) => c.key)]);
  });
});

describe("visibleCategoryChips (pure)", () => {
  const vocabulary = new Set(["a", "b", "c"]);
  const chips = [{ key: "all" }, { key: "a" }, { key: "b" }, { key: "c" }, { key: "when:today" }];
  const keys = (out) => out.map((c) => c.key);

  it("unknown set → unchanged", () => {
    expect(keys(visibleCategoryChips({ chips, vocabulary, present: null, active: new Set() })))
      .toEqual(["all", "a", "b", "c", "when:today"]);
  });
  it("0 categories present → only non-category chips", () => {
    expect(keys(visibleCategoryChips({ chips, vocabulary, present: new Set(), active: new Set() })))
      .toEqual(["all", "when:today"]);
  });
  it("1 present → hidden too; a picked one stays", () => {
    const present = new Set(["a"]);
    expect(keys(visibleCategoryChips({ chips, vocabulary, present, active: new Set() })))
      .toEqual(["all", "when:today"]);
    expect(keys(visibleCategoryChips({ chips, vocabulary, present, active: new Set(["c"]) })))
      .toEqual(["all", "c", "when:today"]);
  });
  it("a value with no chip does not count toward the two", () => {
    expect(keys(visibleCategoryChips({ chips, vocabulary, present: new Set(["a", "zzz"]), active: new Set() })))
      .toEqual(["all", "when:today"]);
  });
  it("2 present → exactly those", () => {
    expect(keys(visibleCategoryChips({ chips, vocabulary, present: new Set(["a", "c"]), active: new Set() })))
      .toEqual(["all", "a", "c", "when:today"]);
  });
  it("presentCategories ignores blank categories and a non-array", () => {
    expect([...presentCategories([{ category: "a" }, { category: null }, {}, { category: "a" }])]).toEqual(["a"]);
    expect(presentCategories(undefined)).toBeNull();
  });
});
