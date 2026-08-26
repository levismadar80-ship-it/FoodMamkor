import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import EventsClient from "@/app/[locale]/events/EventsClient";
import { EVENT_CATEGORIES } from "@/lib/event-categories";

// MEH-1865 — /events renders TWO different zeros and used to render one surface
// for both:
//   • empty dataset      — nothing exists for this tab. Zero filter controls,
//                          the editorial empty state, a link to /producers.
//   • filtered to zero    — rows exist, the filters matched none. The filter
//                          controls STAY (hiding them traps the reader with no
//                          way back but editing the URL) + "clear filters".
//
// The matrix below is (0 rows / 1 row / many rows) × (filters off / filters on)
// per tab — cells, not two lists (CLAUDE.md § conditional-UI states). The
// absence assertions are the load-bearing half: each state must NOT render the
// other state's affordance, which is exactly what the pre-MEH-1865 component
// got wrong.
//
// Harness mirrors __tests__/EventsUrlSync.test.jsx (jsdom + a full component
// render) — only the api mock differs, because emptiness is the subject here.

let params = {}; // drives useSearchParams().get(key)

// The api mock models the two axes independently: what the endpoint returns
// with NO filter (the dataset) vs what it returns WITH one. Keeping them apart
// is what lets a test say "rows exist AND the filter matched none" — the state
// a single fixture list cannot express.
let unfilteredRows = [];
let filteredRows = [];

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: (k) => (k in params ? params[k] : null) }),
}));
vi.mock("next-intl", () => ({
  useTranslations: (ns) => (k) => (ns ? `${ns}.${k}` : k),
  useLocale: () => "he",
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@phosphor-icons/react", () => {
  const Stub = () => null;
  return Object.fromEntries(
    [
      "ArrowCounterClockwise", "ArrowRight", "Basket", "CalendarBlank",
      "CalendarX", "CookingPot", "Drop", "MapTrifold", "Path", "Plant",
      "Plus", "Rows", "Storefront",
    ].map((name) => [name, Stub]),
  );
});
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn((_endpoint, config = {}) => {
      const p = config.params || {};
      const filtered = Boolean(p.city || p.category);
      return Promise.resolve({ data: filtered ? filteredRows : unfilteredRows });
    }),
  },
}));
vi.mock("@/lib/cloudinary", () => ({ optimizeCloudinary: (u) => u }));
vi.mock("@/lib/format-date", () => ({ formatEventDate: () => "" }));
vi.mock("@/components/Breadcrumb", () => ({ default: () => null }));
vi.mock("@/components/CalendarView", () => ({ default: () => null }));
vi.mock("@/components/CitySearch", () => ({
  default: ({ value, onChange, label, id }) => (
    <input
      data-testid="city-input"
      data-filter-control="city"
      aria-label={label}
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));
vi.mock("@/components/ChipScrollRow", () => ({
  default: ({ chips, activeKey, onChipClick }) => (
    <div data-testid="chip-row" data-filter-control="category">
      {chips.map((c) => (
        <button
          key={c.key}
          data-key={c.key}
          data-active={String(c.key === activeKey)}
          onClick={() => onChipClick(c.key)}
        >
          {c.label}
        </button>
      ))}
    </div>
  ),
}));

const CITY = "חיפה";
const EVENT_CAT = EVENT_CATEGORIES.find((c) => c.labelKey === "harvest").key;
const EXPERIENCES_TAB = "events.list.tab_experiences";

const row = (id) => ({
  id,
  title: `event ${id}`,
  event_date: "2026-09-0" + id,
  event_time: "10:00",
  city: CITY,
  category: EVENT_CAT,
  price: 0,
  producer_name: "בית עסק",
  description: "",
});

// One counter for "how many filter controls does this tab render". Counting
// them (not asserting one is present) is what makes "EXACTLY 0" checkable —
// a presence assertion cannot see a control that should have been withheld.
const filterControlCount = () =>
  document.querySelectorAll("[data-filter-control]").length;

const setUrl = (url) => window.history.replaceState(null, "", url);

// Render and wait for the initial load() to settle, so no assertion reads the
// loading state by accident (rows are [] there too — a third zero that means
// neither of the two under test).
const mount = async () => {
  render(<EventsClient />);
  await waitFor(() => {
    expect(screen.queryByRole("status")).toBeNull();
  });
};

beforeEach(() => {
  params = {};
  unfilteredRows = [];
  filteredRows = [];
  setUrl("/events");
});

afterEach(cleanup);

describe("/events — empty dataset vs filtered to zero (MEH-1865)", () => {
  describe("empty dataset (0 rows, no filters)", () => {
    it("events tab: EXACTLY 0 filter controls, /producers link, no clear-filters action", async () => {
      await mount();

      expect(screen.getByTestId("events-empty-dataset")).toBeInTheDocument();
      expect(filterControlCount()).toBe(0);
      expect(screen.getByTestId("events-browse-producers")).toHaveAttribute("href", "/producers");
      // absence: a "clear filters" affordance here would be a no-op button and
      // a filter control on the one state that has nothing to filter.
      expect(screen.queryByTestId("events-clear-filters")).toBeNull();
      expect(screen.queryByTestId("events-no-results")).toBeNull();
    });

    it("experiences tab: EXACTLY 0 filter controls, /producers link beside the existing CTA", async () => {
      params = { tab: "experiences" };
      setUrl("/events?tab=experiences");
      await mount();

      expect(screen.getByTestId("events-empty-dataset")).toBeInTheDocument();
      expect(filterControlCount()).toBe(0);
      expect(screen.getByTestId("events-browse-producers")).toHaveAttribute("href", "/producers");
      // the experiences tab keeps its own forward action — it is not a filter
      expect(screen.getByText("events.list.empty_experiences_cta")).toBeInTheDocument();
      expect(screen.queryByTestId("events-clear-filters")).toBeNull();
    });

    it("both tabs still render, so the reader can cross over", async () => {
      await mount();
      expect(screen.getAllByRole("tab", { name: /tab_events|tab_experiences/ })).toHaveLength(2);
    });
  });

  describe("filtered to zero (rows exist, filters matched none)", () => {
    it("keeps its filter controls and offers the undo (city filter, seeded from the URL)", async () => {
      unfilteredRows = [row(1), row(2)];
      filteredRows = [];
      params = { city: CITY };
      setUrl(`/events?city=${CITY}`);
      await mount();

      expect(screen.getByTestId("events-no-results")).toBeInTheDocument();
      expect(screen.getByText("events.list.no_results_title")).toBeInTheDocument();
      // the trap this ticket exists to prevent: filters must NOT be hidden here
      expect(filterControlCount()).toBeGreaterThan(0);
      expect(screen.getByTestId("city-input")).toHaveValue(CITY);
      // absence: this is not the editorial empty state
      expect(screen.queryByTestId("events-empty-dataset")).toBeNull();
      expect(screen.queryByTestId("events-browse-producers")).toBeNull();
    });

    it("'clear filters' clears the tab's filters and the results come back", async () => {
      unfilteredRows = [row(1), row(2)];
      filteredRows = [];
      params = { city: CITY };
      setUrl(`/events?city=${CITY}`);
      await mount();

      fireEvent.click(screen.getByTestId("events-clear-filters"));

      await waitFor(() => {
        expect(screen.queryByTestId("events-no-results")).toBeNull();
      });
      expect(screen.getByTestId("city-input")).toHaveValue("");
      expect(screen.getByText("event 1")).toBeInTheDocument();
      expect(screen.getByText("event 2")).toBeInTheDocument();
      expect(filterControlCount()).toBeGreaterThan(0);
    });

    it("same for a category chip (the other filter axis)", async () => {
      unfilteredRows = [row(1)];
      filteredRows = [];
      await mount();
      // start from a real dataset, then filter to zero via the chip
      expect(screen.getByText("event 1")).toBeInTheDocument();

      fireEvent.click(document.querySelector(`[data-key="${EVENT_CAT}"]`));

      await waitFor(() => {
        expect(screen.getByTestId("events-no-results")).toBeInTheDocument();
      });
      expect(filterControlCount()).toBeGreaterThan(0);
      expect(screen.queryByTestId("events-empty-dataset")).toBeNull();
    });
  });

  describe("with data — neither zero surface, chrome unchanged", () => {
    it("1 row", async () => {
      unfilteredRows = [row(1)];
      await mount();

      expect(screen.queryByTestId("events-empty-dataset")).toBeNull();
      expect(screen.queryByTestId("events-no-results")).toBeNull();
      expect(filterControlCount()).toBe(2); // city search + category chips
      expect(screen.getByText("event 1")).toBeInTheDocument();
    });

    it("many rows", async () => {
      unfilteredRows = [row(1), row(2), row(3)];
      await mount();

      expect(screen.queryByTestId("events-empty-dataset")).toBeNull();
      expect(screen.queryByTestId("events-no-results")).toBeNull();
      expect(filterControlCount()).toBe(2);
      expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(3);
    });

    it("many rows WITH a filter that matched some — still no zero surface", async () => {
      unfilteredRows = [row(1), row(2), row(3)];
      filteredRows = [row(1), row(2)];
      params = { city: CITY };
      setUrl(`/events?city=${CITY}`);
      await mount();

      expect(screen.queryByTestId("events-empty-dataset")).toBeNull();
      expect(screen.queryByTestId("events-no-results")).toBeNull();
      expect(filterControlCount()).toBe(2);
      expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(2);
    });
  });

  describe("the two zeros are told apart, not conflated", () => {
    it("the SAME 0 rows renders the empty state without a filter and no-results with one", async () => {
      // identical response (zero rows) on both runs — only the filter differs,
      // which is the whole discrimination this ticket adds.
      unfilteredRows = [];
      filteredRows = [];
      await mount();
      expect(screen.getByTestId("events-empty-dataset")).toBeInTheDocument();
      cleanup();

      params = { city: CITY };
      setUrl(`/events?city=${CITY}`);
      await mount();
      expect(screen.getByTestId("events-no-results")).toBeInTheDocument();
      expect(screen.queryByTestId("events-empty-dataset")).toBeNull();
    });

    it("switching tabs resets the filters, so a fresh tab starts from the dataset state", async () => {
      unfilteredRows = [];
      params = { city: CITY };
      setUrl(`/events?city=${CITY}`);
      await mount();
      expect(screen.getByTestId("events-no-results")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("tab", { name: EXPERIENCES_TAB }));

      await waitFor(() => {
        expect(screen.getByTestId("events-empty-dataset")).toBeInTheDocument();
      });
      expect(filterControlCount()).toBe(0);
    });
  });
});
