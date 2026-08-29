import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HomeProducersGrid } from "@/app/[locale]/home/HomeProducersGrid";
import { OPEN_NOW_CHIP_MIN } from "@/lib/producer-filters";

/**
 * MEH-2131 — the open-now gate as HOME wires it.
 *
 * This file exists for one wiring decision that a unit test on
 * `openNowChipVisible` cannot see: what home passes as `catalogFullyLoaded`.
 *
 * Home's `hasMore` is `visibleCount < producers.length` (use-home-page.js:819)
 * — a DISPLAY collapse behind "עוד בתי עסק", not "more pages unfetched". The
 * first version of this wiring passed `!hasMore`, so with more than one
 * screenful of results the zero-result half never ran and the chip rendered at
 * 3am exactly as before. The guard was correct; the argument was wrong, and
 * every unit test still passed.
 *
 * The self-QA harness caught it. This suite is that catch made permanent, and
 * the `hasMore` case below is the one that fails if the argument regresses.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => (k, v) => (v ? `${k}:${JSON.stringify(v)}` : k),
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
// MEH-2173: the axes moved off the flat row and into the FilterSheet, so the
// stand-in moves with them. Same contract as the ChipScrollRow mock it replaces
// — render each chip handed in, so "is the axis OFFERED" stays a question about
// HomeProducersGrid's list and not about the panel's internals.
//
// It deliberately ignores `open`. This suite is about the GATE — whether the
// axis is in the list at all — and making every case click the trigger first
// would test the disclosure on the way to testing the gate, so a broken trigger
// would red seven gate cases and name none of them. That the sheet actually
// opens is asserted where it belongs: HomePromotedFilters.test.jsx, and the
// Playwright harness.
vi.mock("@/components/FilterSheet", () => ({
  default: ({ chips = [] }) => (
    <div data-testid="chip-row">
      {chips.map((c) => (
        <span key={c.key} data-testid={`chip-${c.key}`}>{c.label}</span>
      ))}
    </div>
  ),
}));

const CHIP = () => screen.queryByTestId("chip-open_for_orders_now");

// Windows are built against the RUN'S OWN clock in Asia/Jerusalem, so these
// cases mean the same thing at any hour. A fixed window would make this suite
// pass or fail by the day — the defect this ticket found in the MEH-1881 spec.
const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
function todayKey(now = new Date()) {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
  }).format(now);
  return DAY_KEYS[["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd)];
}
const OPEN_ALL_DAY = { [todayKey()]: [{ open: "00:00", close: "23:59" }] };
// Truthy, so it passes the coverage count — and open on no day, so only the
// zero-result condition can act on it.
const NEVER_OPEN = {};

const rows = (n, order_window) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, order_window }));

const props = (producers, overrides = {}) => ({
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
  onRemoveChip: () => {},
  // MEH-2173 wiring.
  onToggleChip: () => {},
  onClearChips: () => {},
  filterSheetOpen: false,
  onToggleFilterSheet: () => {},
  onCloseFilterSheet: () => {},
  onClearCategory: () => {},
  onLoadMore: () => {},
  ...overrides,
});

const MANY = OPEN_NOW_CHIP_MIN + 5;

describe("MEH-2131 — the open-now chip home offers (MEH-2173: in the sheet)", () => {
  it("CONTROL: the axis list renders and other chips are unaffected", () => {
    render(<HomeProducersGrid {...props(rows(MANY, OPEN_ALL_DAY))} />);
    // Without this, every "chip absent" assertion below would also be satisfied
    // by a row that failed to render at all.
    expect(screen.getByTestId("chip-kosher")).toBeTruthy();
  });

  it("offers the chip when businesses are open now", () => {
    render(<HomeProducersGrid {...props(rows(MANY, OPEN_ALL_DAY))} />);
    expect(CHIP()).toBeTruthy();
    expect(CHIP().textContent).toBe("פתוחים להזמנות עכשיו");
  });

  it("withholds it when coverage passes but nothing is open", () => {
    render(<HomeProducersGrid {...props(rows(MANY, NEVER_OPEN))} />);
    expect(CHIP()).toBeNull();
    expect(screen.getByTestId("chip-kosher")).toBeTruthy();
  });

  it("keeps it for a URL-active filter even with nothing open", () => {
    render(
      <HomeProducersGrid
        {...props(rows(MANY, NEVER_OPEN), { chips: { open_for_orders_now: true } })}
      />,
    );
    expect(CHIP()).toBeTruthy();
  });

  it("withholds it below the coverage threshold, even when open", () => {
    render(<HomeProducersGrid {...props(rows(OPEN_NOW_CHIP_MIN - 1, OPEN_ALL_DAY))} />);
    expect(CHIP()).toBeNull();
  });

  // ── The regression this file exists for ──────────────────────────────
  it("still withholds it when hasMore is true — hasMore is a DISPLAY collapse", () => {
    // `hasMore` true with a fully-fetched list is home's normal state: more
    // results exist than are currently rendered. If this component ever goes
    // back to passing `!hasMore` as `catalogFullyLoaded`, the zero-result half
    // stops running here and this case goes red — which is exactly what the
    // self-QA harness observed before the argument was corrected.
    render(
      <HomeProducersGrid
        {...props(rows(MANY, NEVER_OPEN), { hasMore: true, visibleCount: 8 })}
      />,
    );
    expect(CHIP()).toBeNull();
  });

  it("...and still offers it when hasMore is true and something IS open", () => {
    // The mirror, so the case above cannot pass by hiding the chip always.
    render(
      <HomeProducersGrid
        {...props(rows(MANY, OPEN_ALL_DAY), { hasMore: true, visibleCount: 8 })}
      />,
    );
    expect(CHIP()).toBeTruthy();
  });
});
