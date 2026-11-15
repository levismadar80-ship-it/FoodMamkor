import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import EventsClient from "@/app/[locale]/events/EventsClient";
import api from "@/lib/api";
import { EVENT_CATEGORIES, EXPERIENCE_CATEGORIES } from "@/lib/event-categories";

// MEH-2847: the /events + /experiences category chips are MULTI-select, the
// /producers behaviour (MEH-1465): tap toggles, «הכל» is active while nothing
// is selected and clears the set, the selection is carried in the URL as
// repeated ?category=A&category=B (the format ProducersClient writes), and the
// whole set goes to the API, which ORs it. An old single-value link keeps
// working.
//
// The ChipScrollRow stand-in below honours BOTH props the real component takes
// (`activeKey` string, `activeKeys` Set — ChipScrollRow.jsx:133-140), so this
// suite renders the pre-MEH-2847 client faithfully too: the multi-select cases
// are red there because a second tap REPLACED the first, not because the stub
// could not read the old prop.

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
// One row PER CATEGORY of both tabs on every call: an EMPTY unfiltered dataset
// withholds the chip row altogether (MEH-1865), and MEH-3124 hides a chip whose
// category has no row — these cases need every chip, after «הכל» too.
vi.mock("@/lib/api", async () => {
  const { EVENT_CATEGORIES: E, EXPERIENCE_CATEGORIES: X } = await import("@/lib/event-categories");
  const data = [...E, ...X].map((c, i) => ({
    id: i + 1, title: `event ${i + 1}`, event_date: "2026-12-01", event_time: "10:00",
    city: "חיפה", category: c.key, price: 0, producer_name: "בית עסק", description: "",
  }));
  return { default: { get: vi.fn(() => Promise.resolve({ data })) } };
});
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

const setUrl = (url) => window.history.replaceState(null, "", url);
const chipEl = (k) => within(screen.getByTestId("chip-row")).getByRole("button", { name: (n, el) => el.getAttribute("data-key") === k });
const clickChip = (k) => fireEvent.click(chipEl(k));
// Derived from the DOM, never stated: the keys whose chip renders as active.
const activeChips = () =>
  [...screen.getByTestId("chip-row").querySelectorAll('[data-active="true"]')].map((el) => el.dataset.key);
const urlCategories = () => new URLSearchParams(window.location.search).getAll("category");
// The category the API was last asked for, normalised to a list (the old
// client sent a string, the new one an array — both serialize the same way).
const lastApiCategories = () => {
  const config = api.get.mock.calls.at(-1)?.[1] ?? {};
  const c = config.params?.category;
  return c == null ? [] : [].concat(c);
};

beforeEach(() => {
  params = {};
  setUrl("/events");
  api.get.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("/events category chips are multi-select (MEH-2847)", () => {
  it("two chips → both selected, both in the URL, both sent to the API", async () => {
    render(<EventsClient />);

    clickChip(MARKET);
    clickChip(HARVEST);

    await waitFor(() => expect(urlCategories()).toEqual([MARKET, HARVEST]));
    expect(activeChips().sort()).toEqual([MARKET, HARVEST].sort());
    await waitFor(() => expect(lastApiCategories()).toEqual([MARKET, HARVEST]));
  });

  it("tapping a selected chip removes only that one", async () => {
    render(<EventsClient />);

    clickChip(MARKET);
    clickChip(HARVEST);
    clickChip(MARKET);

    await waitFor(() => expect(urlCategories()).toEqual([HARVEST]));
    expect(activeChips()).toEqual([HARVEST]);
    await waitFor(() => expect(lastApiCategories()).toEqual([HARVEST]));
  });

  it("«הכל» clears every selected chip, the URL and the API filter", async () => {
    render(<EventsClient />);
    clickChip(MARKET);
    clickChip(HARVEST);
    await waitFor(() => expect(urlCategories()).toEqual([MARKET, HARVEST]));

    clickChip("all");

    await waitFor(() => expect(urlCategories()).toEqual([]));
    expect(activeChips()).toEqual(["all"]);
    await waitFor(() => expect(lastApiCategories()).toEqual([]));
  });

  it("a link with two categories opens with both selected", async () => {
    params = { category: [MARKET, TASTING] };
    setUrl(`/events?category=${MARKET}&category=${TASTING}`);
    render(<EventsClient />);

    expect(activeChips().sort()).toEqual([MARKET, TASTING].sort());
    await waitFor(() => expect(lastApiCategories()).toEqual([MARKET, TASTING]));
  });

  it("an unknown value in a multi link is dropped, the valid one is kept", async () => {
    params = { category: ["לא-קיים", HARVEST] };
    setUrl(`/events?category=לא-קיים&category=${HARVEST}`);
    render(<EventsClient />);

    expect(activeChips()).toEqual([HARVEST]);
    await waitFor(() => expect(urlCategories()).toEqual([HARVEST]));
    await waitFor(() => expect(lastApiCategories()).toEqual([HARVEST]));
  });

  // Pin, not new behaviour: green on the old client by design — it guards the
  // one thing this change must NOT move.
  it("an old single-value link (?category=X) still works", async () => {
    params = { category: HARVEST };
    setUrl(`/events?category=${HARVEST}`);
    render(<EventsClient />);

    expect(activeChips()).toEqual([HARVEST]);
    await waitFor(() => expect(lastApiCategories()).toEqual([HARVEST]));
    expect(urlCategories()).toEqual([HARVEST]); // the link is left as it was
  });
});

describe("/experiences category chips are multi-select too (MEH-2847)", () => {
  it("two chips → both selected, both in the URL, both sent to /experiences", async () => {
    setUrl("/experiences");
    render(<EventsClient initialTab="experiences" />);

    clickChip(COOKING);
    clickChip(FOOD_TOUR);

    await waitFor(() => expect(urlCategories()).toEqual([COOKING, FOOD_TOUR]));
    expect(activeChips().sort()).toEqual([COOKING, FOOD_TOUR].sort());
    await waitFor(() => {
      expect(api.get.mock.calls.at(-1)[0]).toBe("/experiences");
      expect(lastApiCategories()).toEqual([COOKING, FOOD_TOUR]);
    });
  });
});
