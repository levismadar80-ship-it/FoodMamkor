import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, renderHook, act } from "@testing-library/react";
import { HomeProducersGrid } from "@/app/[locale]/home/HomeProducersGrid";
import { useHomePage } from "@/lib/use-home-page";
import { renderToString } from "react-dom/server";
import { trackEvent } from "@/lib/analytics";

/**
 * MEH-2537 — the home filter row is ONE row: «סינון» first, then the two
 * promoted chips, then the delivery-day chip (which used to sit alone on a
 * second row). The day panel renders BELOW the row, outside it, because on a
 * phone the row scrolls sideways and an in-row panel would be clipped by it.
 *
 * jsdom: structure and wiring only. The one-row claim at 320/375/440/1440 is a
 * layout question, measured in a real browser (qa-artifacts/MEH-2537/).
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
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/i18n-key-map", () => ({ mapKey: (k) => k }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/use-user-city", () => ({
  useUserCity: () => ({ city: null, setCity: vi.fn() }),
}));
vi.mock("@/lib/recently-viewed", () => ({ getRecentlyViewedIds: () => [] }));
vi.mock("@/lib/friday-mode", () => ({ isFridayMode: () => false }));
vi.mock("@/lib/featured-producer", () => ({ selectFeaturedProducer: () => null }));
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [] })) },
}));
const router = { replace: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));


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
  onSelectDay: vi.fn(),
  ...overrides,
});


const row = () => screen.getByTestId("home-filter-row");

describe("MEH-2537 — one row", () => {
  it("holds «סינון», the two promoted chips and the day chip, in that order", () => {
    render(<HomeProducersGrid {...props()} />);
    const order = [
      "home-filters-button",
      "home-promoted-chip-verified",
      "home-promoted-chip-has_delivery",
      "delivery-day-chip",
    ].map((id) => screen.getByTestId(id));
    for (const el of order) expect(row().contains(el)).toBe(true);
    for (let i = 1; i < order.length; i++) {
      // DOCUMENT_POSITION_FOLLOWING: order[i] comes after order[i-1].
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("opens the day panel OUTSIDE the row (an in-row panel is clipped by the scroll rail)", () => {
    render(<HomeProducersGrid {...props({ cityActive: "חיפה" })} />);
    fireEvent.click(screen.getByTestId("delivery-day-chip"));
    const panel = screen.getByTestId("delivery-day-panel");
    expect(row().contains(panel)).toBe(false);
    // and it sits after the row, not above it
    expect(row().compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("a tap inside the moved panel picks the day and keeps the panel open", () => {
    const p = props({ cityActive: "חיפה" });
    render(<HomeProducersGrid {...p} />);
    fireEvent.click(screen.getByTestId("delivery-day-chip"));
    const pill = screen.getByTestId("delivery-day-pill-שישי");
    fireEvent.mouseDown(pill);
    fireEvent.click(pill);
    expect(p.onSelectDay).toHaveBeenCalledWith("שישי");
    expect(screen.queryByTestId("delivery-day-panel")).not.toBeNull();
  });

  it("server HTML already has the in-row chip shape (no shift when the host mounts)", () => {
    const html = renderToString(<HomeProducersGrid {...props()} />);
    const root = html.match(/<div class="([^"]*)" data-testid="delivery-day-row"/);
    expect(root?.[1]).toContain("shrink-0");
    expect(root?.[1]).not.toContain("mb-6");
    const chipTag = html.match(/<button[^>]*data-testid="delivery-day-chip"[^>]*>/)?.[0] ?? "";
    expect(chipTag).toMatch(/class="[^"]*py-2\.5/);
  });

  it("many days: the value chip and its ✕ stay in the row; the panel still opens below it", () => {
    render(<HomeProducersGrid {...props({ cityActive: "חיפה", daysActive: ["שני", "רביעי", "שישי"] })} />);
    expect(row().contains(screen.getByTestId("delivery-day-chip"))).toBe(true);
    expect(row().contains(screen.getByTestId("delivery-day-clear"))).toBe(true);
    fireEvent.click(screen.getByTestId("delivery-day-chip"));
    expect(row().contains(screen.getByTestId("delivery-day-panel"))).toBe(false);
  });

  it("one day, closed: the value chip and its ✕ sit in the row, no panel", () => {
    render(<HomeProducersGrid {...props({ cityActive: "חיפה", daysActive: ["שישי"] })} />);
    expect(row().contains(screen.getByTestId("delivery-day-clear"))).toBe(true);
    expect(screen.getByTestId("delivery-day-chip").textContent).toContain("שישי");
    expect(screen.queryByTestId("delivery-day-panel")).toBeNull();
  });

  it("one day, open: the panel opens below the row with that day pressed", () => {
    render(<HomeProducersGrid {...props({ cityActive: "חיפה", daysActive: ["שישי"] })} />);
    fireEvent.click(screen.getByTestId("delivery-day-chip"));
    expect(row().contains(screen.getByTestId("delivery-day-panel"))).toBe(false);
    expect(screen.getByTestId("delivery-day-pill-שישי").getAttribute("aria-pressed")).toBe("true");
  });

  it("a tap outside both the chip and the panel still closes it", () => {
    render(<HomeProducersGrid {...props({ cityActive: "חיפה" })} />);
    fireEvent.click(screen.getByTestId("delivery-day-chip"));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId("delivery-day-panel")).toBeNull();
  });
});

describe("MEH-2537 — chip taps are measured", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    vi.mocked(trackEvent).mockClear();
  });

  it("handleToggleChip reports the axis, its new state and the surface", () => {
    const { result } = renderHook(() => useHomePage());
    act(() => result.current.handleToggleChip("verified", "row"));
    expect(trackEvent).toHaveBeenCalledWith("home_chip_toggle", { chip: "verified", active: true, source: "row" });
    // the sheet's switches pass the key alone
    act(() => result.current.handleToggleChip("verified"));
    expect(trackEvent).toHaveBeenCalledWith("home_chip_toggle", { chip: "verified", active: false, source: "sheet" });
  });

  it("a promoted chip tap is tagged as the row, a sheet switch is not", () => {
    const p = props({ filterSheetOpen: true });
    render(<HomeProducersGrid {...p} />);
    fireEvent.click(screen.getByTestId("home-promoted-chip-has_delivery"));
    expect(p.onToggleChip).toHaveBeenLastCalledWith("has_delivery", "row");
    fireEvent.click(document.querySelector('#filter-sheet-panel [data-testid="chip-vegan"]'));
    expect(p.onToggleChip).toHaveBeenLastCalledWith("vegan");
  });
});

describe("MEH-2537 — the lg+ sheet opens toward the page, not off it", () => {
  it("home's sheet aligns to the trigger's START edge (the trigger leads the row)", () => {
    render(<HomeProducersGrid {...props({ filterSheetOpen: true })} />);
    const panel = document.getElementById("filter-sheet-panel");
    expect(panel.className).toContain("lg:start-0");
    expect(panel.className).not.toContain("lg:end-0");
  });
});

describe("MEH-2537 — a focused chip is not left under the sticky «סינון»", () => {
  // jsdom has no layout: stub the lead as sticky and give each node a rect.
  const rects = new Map();
  let gcs;
  beforeEach(() => {
    gcs = vi.spyOn(window, "getComputedStyle").mockImplementation(() => ({ position: "sticky" }));
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function () {
      return rects.get(this) ?? { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
    });
    Element.prototype.scrollBy = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rects.clear();
  });

  it("scrolls a focused chip out from under the lead (RTL: positive scrollBy)", () => {
    render(<HomeProducersGrid {...props()} />);
    const lead = row().firstElementChild;
    const chip = screen.getByTestId("home-promoted-chip-verified");
    rects.set(lead, { left: 276, right: 375 });
    rects.set(chip, { left: 200, right: 290 }); // 14px under the lead
    fireEvent.focus(chip);
    expect(row().scrollBy).toHaveBeenCalledWith({ left: 22 });
  });

  it("leaves a chip that is already clear alone", () => {
    render(<HomeProducersGrid {...props()} />);
    const lead = row().firstElementChild;
    const chip = screen.getByTestId("home-promoted-chip-verified");
    rects.set(lead, { left: 276, right: 375 });
    rects.set(chip, { left: 172, right: 268 });
    fireEvent.focus(chip);
    expect(row().scrollBy).not.toHaveBeenCalled();
  });

  it("ignores focus inside the portalled day panel (React bubbles it through the portal)", () => {
    render(<HomeProducersGrid {...props({ cityActive: "חיפה" })} />);
    fireEvent.click(screen.getByTestId("delivery-day-chip"));
    const lead = row().firstElementChild;
    const pill = screen.getByTestId("delivery-day-pill-שישי");
    rects.set(lead, { left: 276, right: 375 });
    rects.set(pill, { left: 300, right: 360 });
    fireEvent.focus(pill);
    expect(row().scrollBy).not.toHaveBeenCalled();
  });

  it("does nothing when the lead is not sticky (lg+)", () => {
    gcs.mockImplementation(() => ({ position: "relative" }));
    render(<HomeProducersGrid {...props()} />);
    const lead = row().firstElementChild;
    const chip = screen.getByTestId("home-promoted-chip-verified");
    rects.set(lead, { left: 276, right: 375 });
    rects.set(chip, { left: 200, right: 290 });
    fireEvent.focus(chip);
    expect(row().scrollBy).not.toHaveBeenCalled();
  });
});
