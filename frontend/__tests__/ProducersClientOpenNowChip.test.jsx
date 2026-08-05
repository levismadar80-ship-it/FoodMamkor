import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProducersClient from "@/components/ProducersClient";
import {
  buildChipParams,
  OPEN_NOW_CHIP_MIN,
  PRODUCERS_CHIPS_DEFAULT as CHIPS_DEFAULT,
} from "@/lib/producer-filters";

/**
 * MEH-1881 — the "פתוח להזמנות עכשיו" chip and its data gate.
 *
 * The gate is the point of the ticket, so `@/lib/producer-filters` is
 * deliberately NOT mocked here (unlike the sibling ProducersClient specs, which
 * stub it to `CHIPS_CONFIG: []`). The real CHIPS_CONFIG and the real
 * OPEN_NOW_CHIP_MIN drive these assertions — a stubbed config would let the
 * gate pass while the shipped threshold was anything at all.
 *
 * The load-bearing assertions are the ABSENT one and the deep-link one. "Chip
 * renders when coverage is high" passes identically against a component with no
 * gate at all, so it cannot tell the feature from the bug it exists to prevent.
 */

const router = { replace: vi.fn(), push: vi.fn() };
let params = {};

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => ({
    get: (k) => (k in params ? params[k] : null),
    getAll: (k) => (k in params ? [params[k]] : []),
  }),
}));
vi.mock("next-intl", () => ({ useTranslations: (s) => (k) => (s ? `${s}.${k}` : k) }));
vi.mock("next/link", () => ({ default: ({ children, href }) => <a href={href}>{children}</a> }));
vi.mock("@phosphor-icons/react", () => ({
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

// Stub the icon module so the real Phosphor glyphs it maps (category-registry
// pulls CATEGORY_ICONS from here) don't need to be enumerated in the partial
// phosphor mock above. The open-now chip has no icon entry in chip-icons.js, so
// it passes through withChipIcons text-only and needs no glyph of its own.
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
vi.mock("@/components/LocationModal", () => ({ default: () => null }));
vi.mock("@/components/Skeleton", () => ({ SkeletonProducerGrid: () => null }));
// Renders every chip it is handed as a button labelled by key, so "is the chip
// in the DOM" is a question about ProducersClient's chip list and not about
// ChipScrollRow's internals.
vi.mock("@/components/ChipScrollRow", () => ({
  default: ({ chips = [], onChipClick }) => (
    <div data-testid="chip-row">
      {chips.map((c) => (
        <button key={c.key} data-testid={`chip-${c.key}`} onClick={() => onChipClick(c.key)}>
          {c.label}
        </button>
      ))}
    </div>
  ),
}));
vi.mock("@/lib/use-user-city", () => ({
  useUserCity: () => ({ city: null, setCity: vi.fn(), clearCity: vi.fn() }),
}));
vi.mock("@/lib/recently-viewed", () => ({ getRecentlyViewedIds: () => [] }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [], headers: { "x-total-count": "0" } })),
  },
}));

const WINDOW = { sunday: [{ open: "09:00", close: "13:00" }] };

/** `n` producers carrying a declared window, plus `extra` carrying none. */
function items(n, extra = 0) {
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    rows.push({ id: `w${i}`, name: `עם חלון ${i}`, categories: [], order_window: WINDOW });
  }
  for (let i = 0; i < extra; i += 1) {
    rows.push({ id: `n${i}`, name: `בלי חלון ${i}`, categories: [], order_window: null });
  }
  return rows;
}

const props = (initialItems) => ({
  initialItems,
  initialTotal: initialItems.length,
  initialPage: 1,
  totalPages: 1,
  perPage: 12,
});

const CHIP = () => screen.queryByTestId("chip-open_for_orders_now");

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  params = {};
  router.replace.mockClear();
});

describe("MEH-1881 — open-now chip data gate", () => {
  it("the threshold is a real exported number, not a literal echoed by the test", () => {
    // Guards against the whole file passing vacuously if the constant is ever
    // removed or turned into undefined — `x >= undefined` is false forever.
    expect(typeof OPEN_NOW_CHIP_MIN).toBe("number");
    expect(OPEN_NOW_CHIP_MIN).toBeGreaterThan(0);
  });

  it("renders the chip once coverage reaches the threshold", () => {
    render(<ProducersClient {...props(items(OPEN_NOW_CHIP_MIN))} />);
    expect(CHIP()).toBeTruthy();
    expect(CHIP().textContent).toContain("פתוח להזמנות עכשיו");
  });

  it("keeps the chip OUT of the DOM one below the threshold — the discriminating case", () => {
    render(<ProducersClient {...props(items(OPEN_NOW_CHIP_MIN - 1, 20))} />);
    expect(CHIP()).toBeNull();
    // The rest of the row is untouched: this is a gate on one chip, not a
    // collapse of the filter row.
    expect(screen.getByTestId("chip-kosher")).toBeTruthy();
  });

  it("counts only producers that actually declared a window", () => {
    // Plenty of businesses loaded, almost none with a window — the count must
    // follow the field, not the list length.
    render(<ProducersClient {...props(items(1, 50))} />);
    expect(CHIP()).toBeNull();
  });

  it("shows the chip below the threshold when the filter is active via the URL", () => {
    // Otherwise a deep-linked ?open_for_orders_now=1 strands the visitor with a
    // filter whose effect she can see and whose control she cannot reach.
    params = { open_for_orders_now: "1" };
    render(<ProducersClient {...props(items(1))} />);
    expect(CHIP()).toBeTruthy();
  });

  it("writes the param to the URL when toggled on", () => {
    render(<ProducersClient {...props(items(OPEN_NOW_CHIP_MIN))} />);
    fireEvent.click(CHIP());
    expect(
      new URLSearchParams(window.location.search).get("open_for_orders_now"),
    ).toBe("1");
  });
});

describe("MEH-1881 — the chip's params and defaults", () => {
  it("is off by default, so the listing is untouched until asked", () => {
    expect(CHIPS_DEFAULT.open_for_orders_now).toBe(false);
    expect(buildChipParams(CHIPS_DEFAULT)).not.toHaveProperty("open_for_orders_now");
  });

  it("maps to the API param the backend reads", () => {
    expect(
      buildChipParams({ ...CHIPS_DEFAULT, open_for_orders_now: true }),
    ).toMatchObject({ open_for_orders_now: true });
  });
});
