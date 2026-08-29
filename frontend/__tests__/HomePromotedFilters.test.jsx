import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, renderHook, act } from "@testing-library/react";
import { HomeProducersGrid } from "@/app/[locale]/home/HomeProducersGrid";
import { useHomePage } from "@/lib/use-home-page";
import { CHIPS_CONFIG } from "@/lib/producer-filters";
import api from "@/lib/api";

/**
 * MEH-2173 — the homepage filter row as "promoted + all".
 *
 * Two promoted chips (מאומת · משלוח) plus a "סינון" button opening the
 * SAME FilterSheet /map and /producers mount. Every other axis lives in the
 * sheet; a non-promoted axis that is on shows as a removable tag in the
 * "מסנן לפי:" row, while a promoted one shows its state on its own chip.
 *
 * The real FilterSheet is rendered, not a stand-in. The single most likely way
 * for this feature to ship broken is the wiring BETWEEN the two components —
 * a sheet mounted with the wrong chip set, or a toggle that writes a second
 * copy of the state — and a mock is exactly the thing that cannot see it.
 *
 * ── The gap this file does NOT close ──
 *
 * Everything here runs in jsdom, so it is evidence about structure and wiring,
 * never about layout. The meta-row COUNT the card asks for is a rendered-height
 * question and is measured in qa-meh2173-promoted-filters.mjs against a real
 * browser; no assertion below should be read as covering it.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => (key, values) =>
    values && values.count !== undefined ? `${key}#${values.count}` : key,
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...p }) => <a href={href} {...p}>{children}</a>,
}));
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, initial, whileInView, viewport, transition, ...p }) => (
      <div {...p}>{children}</div>
    ),
  },
}));
vi.mock("@/components/ProducerCard", () => ({ default: () => <div /> }));
vi.mock("@/components/Skeleton", () => ({ SkeletonProducerGrid: () => <div /> }));
vi.mock("@/components/OnboardingTip", () => ({ default: () => null }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/i18n-key-map", () => ({ mapKey: (k) => k }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/use-user-city", () => ({
  useUserCity: () => ({ city: null, setCity: vi.fn() }),
}));
vi.mock("@/lib/use-onboarding", () => ({
  useOnboarding: () => ({ step: -1, advance: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock("@/lib/recently-viewed", () => ({ getRecentlyViewedIds: () => [] }));
vi.mock("@/lib/friday-mode", () => ({ isFridayMode: () => false }));
vi.mock("@/lib/featured-producer", () => ({ selectFeaturedProducer: () => null }));
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [] })) },
}));
const router = { replace: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

/** The pair the card promotes. Asserted against the component's rendered
 *  output, never imported from it — a test that imports the constant it is
 *  checking passes for any value of that constant. */
const PROMOTED = ["verified", "has_delivery"];

const producers = Array.from({ length: 12 }, (_, i) => ({ id: i + 1 }));

const props = (overrides = {}) => ({
  producers,
  producersLoading: false,
  visibleProducers: producers,
  hasMore: false,
  visibleCount: producers.length,
  filters: { category: "", delivery_city: "", delivery_days: [] },
  chips: {},
  categories: [],
  showNewUserHint: false,
  fridayMode: false,
  step0Visible: false,
  onboardStep: -1,
  onboardAdvance: () => {},
  onboardDismiss: () => {},
  onAdvanceFromStep0: () => {},
  onRemoveChip: vi.fn(),
  onToggleChip: vi.fn(),
  onClearChips: vi.fn(),
  filterSheetOpen: false,
  onToggleFilterSheet: vi.fn(),
  onCloseFilterSheet: vi.fn(),
  onClearCategory: vi.fn(),
  onLoadMore: () => {},
  onSurprise: () => {},
  hasProducers: true,
  geoActive: false,
  cityActive: "",
  daysActive: [],
  onClearDays: () => {},
  onSelectDay: () => {},
  ...overrides,
});

const promotedChips = () => screen.queryAllByTestId(/^home-promoted-chip-/);
const tags = () => screen.queryAllByTestId(/^home-active-filter-/);

describe("MEH-2173 — the promoted row", () => {
  it("renders EXACTLY the two promoted chips, and no other attribute chip", () => {
    render(<HomeProducersGrid {...props()} />);
    const keys = promotedChips().map((el) =>
      el.getAttribute("data-testid").replace("home-promoted-chip-", ""),
    );
    // The count is the assertion. `toHaveLength(2)` is what fails if a third
    // axis is promoted; listing the two without counting them would pass on a
    // row of eight.
    expect(keys).toHaveLength(2);
    expect(keys).toEqual(PROMOTED);
  });

  it("labels each promoted chip from the taxonomy, not from a local string", () => {
    render(<HomeProducersGrid {...props()} />);
    for (const key of PROMOTED) {
      const expected = CHIPS_CONFIG.find((c) => c.key === key).label;
      expect(screen.getByTestId(`home-promoted-chip-${key}`).textContent).toContain(expected);
    }
  });

  it("a promoted chip toggles IN PLACE — it does not navigate", () => {
    const p = props();
    render(<HomeProducersGrid {...p} />);
    fireEvent.click(screen.getByTestId("home-promoted-chip-verified"));
    expect(p.onToggleChip).toHaveBeenCalledWith("verified");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("shows a promoted chip's active state on the chip itself", () => {
    render(<HomeProducersGrid {...props({ chips: { verified: true } })} />);
    expect(screen.getByTestId("home-promoted-chip-verified").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("home-promoted-chip-has_delivery").getAttribute("aria-pressed")).toBe("false");
  });

  it("counts ACTIVE attribute axes on the trigger, promoted included", () => {
    render(<HomeProducersGrid {...props({ chips: { verified: true, vegan: true } })} />);
    expect(screen.getByTestId("home-filters-button").textContent).toContain("2");
  });

  it("shows no count at all when nothing is active", () => {
    render(<HomeProducersGrid {...props()} />);
    expect(screen.getByTestId("home-filters-button").textContent).not.toMatch(/\d/);
  });
});

describe("MEH-2173 — the sheet", () => {
  it("the trigger is closed by default and asks to open", () => {
    const p = props();
    render(<HomeProducersGrid {...p} />);
    const btn = screen.getByTestId("home-filters-button");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector("#filter-sheet-panel")).toBeNull();
    fireEvent.click(btn);
    expect(p.onToggleFilterSheet).toHaveBeenCalled();
  });

  it("renders the real panel when open, carrying the home axes", () => {
    render(<HomeProducersGrid {...props({ filterSheetOpen: true })} />);
    expect(document.querySelector("#filter-sheet-panel")).not.toBeNull();
    // Every axis the flat row used to offer is still reachable — the card's
    // "no removal of any filter capability" line, asserted rather than assumed.
    for (const chip of CHIPS_CONFIG) {
      if (chip.key === "open_for_orders_now" || chip.key === "no_added_sugar") continue;
      expect(screen.getByTestId(`chip-${chip.key}`)).toBeTruthy();
    }
  });

  it("a switch inside the sheet drives the SAME handler the promoted chips do", () => {
    const p = props({ filterSheetOpen: true });
    render(<HomeProducersGrid {...p} />);
    fireEvent.click(screen.getByTestId("chip-vegan"));
    expect(p.onToggleChip).toHaveBeenCalledWith("vegan");
    // And the promoted axis inside the sheet reaches the identical handler —
    // one state, so the surface chip and its twin switch cannot disagree.
    fireEvent.click(screen.getByTestId("chip-verified"));
    expect(p.onToggleChip).toHaveBeenCalledWith("verified");
  });

  it("reflects active state inside the sheet for a promoted axis", () => {
    render(<HomeProducersGrid {...props({ filterSheetOpen: true, chips: { verified: true } })} />);
    expect(screen.getByTestId("chip-verified").getAttribute("aria-checked")).toBe("true");
  });
});

describe("MEH-2173 — the applied-filter strip", () => {
  it("tags a NON-promoted active axis, removably", () => {
    const p = props({ chips: { vegan: true } });
    render(<HomeProducersGrid {...p} />);
    const tag = screen.getByTestId("home-active-filter-vegan");
    expect(tag).toBeTruthy();
    fireEvent.click(tag);
    expect(p.onRemoveChip).toHaveBeenCalledWith("vegan");
  });

  it("does NOT tag a promoted axis — its state shows on its own chip", () => {
    render(<HomeProducersGrid {...props({ chips: { verified: true } })} />);
    expect(screen.queryByTestId("home-active-filter-verified")).toBeNull();
    // ...and the state is still visible somewhere, which is the half that makes
    // the line above a de-duplication rather than a disappearance.
    expect(screen.getByTestId("home-promoted-chip-verified").getAttribute("aria-pressed")).toBe("true");
  });

  it("5-state (0 items): a promoted-only filter leaves NO orphan 'מסנן לפי:' row", () => {
    // The row's old condition was "any chip is active", which with only a
    // promoted axis on would print the label with an empty list after it — a
    // heading for a set with nothing in it.
    render(<HomeProducersGrid {...props({ chips: { verified: true } })} />);
    expect(tags()).toHaveLength(0);
    expect(screen.queryByText("home.producers.filter_prefix")).toBeNull();
  });

  it("5-state (1 item): one non-promoted axis renders the row with exactly one tag", () => {
    render(<HomeProducersGrid {...props({ chips: { vegan: true } })} />);
    expect(tags()).toHaveLength(1);
    expect(screen.getByText("home.producers.filter_prefix")).toBeTruthy();
  });

  it("5-state (many): promoted + two non-promoted → the row carries the TWO", () => {
    render(
      <HomeProducersGrid
        {...props({ chips: { verified: true, vegan: true, gluten_free: true } })}
      />,
    );
    const keys = tags().map((el) =>
      el.getAttribute("data-testid").replace("home-active-filter-", ""),
    );
    expect(keys).toHaveLength(2);
    expect(new Set(keys)).toEqual(new Set(["vegan", "gluten_free"]));
  });
});

describe("MEH-2173 — the state behind it (useHomePage)", () => {
  beforeEach(() => {
    api.get.mockClear();
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  const lastProducersCall = () =>
    api.get.mock.calls.findLast(([path]) => path === "/producers");

  it("handleToggleChip turns an axis ON: state, URL and the fetch all move", () => {
    const { result } = renderHook(() => useHomePage());
    act(() => result.current.handleToggleChip("vegan"));
    expect(result.current.chips.vegan).toBe(true);
    expect(window.location.search).toContain("vegan=1");
    expect(lastProducersCall()[1].params).toMatchObject({ vegan: true });
  });

  it("...and OFF again, dropping the param from both the URL and the fetch", () => {
    const { result } = renderHook(() => useHomePage());
    act(() => result.current.handleToggleChip("vegan"));
    act(() => result.current.handleToggleChip("vegan"));
    expect(result.current.chips.vegan).toBe(false);
    expect(window.location.search).not.toContain("vegan");
    expect(lastProducersCall()[1].params.vegan).toBeUndefined();
  });

  it("handleRemoveChip and handleToggleChip share ONE path (same params shape)", () => {
    const { result } = renderHook(() => useHomePage());
    act(() => result.current.handleToggleChip("vegan"));
    const viaToggle = lastProducersCall()[1].params;
    act(() => result.current.handleRemoveChip("vegan"));
    act(() => result.current.handleToggleChip("vegan"));
    expect(lastProducersCall()[1].params).toEqual(viaToggle);
  });

  it("a promoted axis uses home's OWN param name in the URL (?delivery=1)", () => {
    // has_delivery serialises as `delivery` on home (filter-taxonomy homeParam).
    // A test that only checked the fetch would miss a broken URL round-trip.
    const { result } = renderHook(() => useHomePage());
    act(() => result.current.handleToggleChip("has_delivery"));
    expect(window.location.search).toContain("delivery=1");
    expect(lastProducersCall()[1].params).toMatchObject({ has_delivery: true });
  });

  it("keeps the city + day context when an attribute changes (MEH-1470)", () => {
    const { result } = renderHook(() => useHomePage());
    act(() => result.current.handleCitySelected("חיפה"));
    act(() => result.current.handleDaySelected("שישי"));
    act(() => result.current.handleToggleChip("vegan"));
    expect(lastProducersCall()[1].params).toMatchObject({
      delivery_city: "חיפה",
      delivery_days: ["שישי"],
      vegan: true,
    });
  });

  it("handleClearChips clears every attribute and KEEPS the city", () => {
    const { result } = renderHook(() => useHomePage());
    act(() => result.current.handleCitySelected("חיפה"));
    act(() => result.current.handleToggleChip("vegan"));
    act(() => result.current.handleToggleChip("verified"));
    act(() => result.current.handleClearChips());
    expect(Object.values(result.current.chips).some(Boolean)).toBe(false);
    expect(result.current.filters.delivery_city).toBe("חיפה");
    expect(lastProducersCall()[1].params).toMatchObject({ delivery_city: "חיפה" });
  });

  it("the sheet's open state opens, closes, and starts closed", () => {
    const { result } = renderHook(() => useHomePage());
    expect(result.current.filterSheetOpen).toBe(false);
    act(() => result.current.toggleFilterSheet());
    expect(result.current.filterSheetOpen).toBe(true);
    act(() => result.current.closeFilterSheet());
    expect(result.current.filterSheetOpen).toBe(false);
  });

  it("hydrates a deep link and surfaces it as state (?vegan=1)", () => {
    window.history.replaceState(null, "", "/?vegan=1");
    const { result } = renderHook(() => useHomePage());
    expect(result.current.chips.vegan).toBe(true);
  });
});
