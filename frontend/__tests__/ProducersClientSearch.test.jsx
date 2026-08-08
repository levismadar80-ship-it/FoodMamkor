import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProducersClient from "@/components/ProducersClient";

// MEH-830: characterization for the /producers free-text search (MEH-820 #1164),
// shipped without coverage. Pins: (1) submitting the box commits the term to the
// URL as ?q= via router.replace (ProducersClient.jsx:221-223,98-108); (2) ?focus=1
// focuses the input on mount (ProducersClient.jsx:80-85).

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
  Faders: (p) => <span {...p} />,  // MEH-1862 — the "סינון" trigger icon
  MagnifyingGlass: (p) => <span {...p} />,
  MapPin: (p) => <span {...p} />,
  Plant: (p) => <span {...p} />,
  Leaf: (p) => <span {...p} />,
  CaretDown: (p) => <span {...p} />, // MEH-1483: sort-select caret
  // MEH-1418: chip leading icons (via lib/chip-icons.js).
  SealCheck: (p) => <span {...p} />,
  Truck: (p) => <span {...p} />,
  Certificate: (p) => <span {...p} />,
  GrainsSlash: (p) => <span {...p} />,
  Barn: (p) => <span {...p} />,
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

// Filter lib — neutralize chips so syncUrl only handles q.
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
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [], headers: { "x-total-count": "0" } })) },
}));

const PROPS = { initialItems: [], initialTotal: 0, initialPage: 1, totalPages: 1, perPage: 12 };

beforeEach(() => {
  // MEH-1294: syncUrl now writes via window.history.replaceState — reset the
  // jsdom URL each test so assertions read a clean starting search string.
  window.history.replaceState(null, "", "/");
  params = {};
});

describe("ProducersClient free-text search (MEH-830)", () => {
  it("submitting the box writes the term to the URL as ?q= via router.replace", () => {
    render(<ProducersClient {...PROPS} />);
    const box = screen.getByRole("searchbox");
    fireEvent.change(box, { target: { value: "גבינה" } });
    fireEvent.submit(box.closest("form"));
    // MEH-1294: syncUrl mirrors via window.history.replaceState — assert the
    // resulting URL directly (transport-agnostic).
    expect(window.location.search).toContain(`q=${encodeURIComponent("גבינה")}`);
  });

  it("trims whitespace and an empty term clears q (URL has no q=)", () => {
    render(<ProducersClient {...PROPS} />);
    const box = screen.getByRole("searchbox");
    fireEvent.change(box, { target: { value: "   " } });
    fireEvent.submit(box.closest("form"));
    // MEH-1294: an empty term leaves no q= in the URL (the same-URL guard may
    // skip the write when the URL is already clean — either way, no q=).
    expect(window.location.search).not.toContain("q=");
  });

  it("?focus=1 focuses the search input on mount", () => {
    params = { focus: "1" };
    render(<ProducersClient {...PROPS} />);
    expect(screen.getByRole("searchbox")).toHaveFocus();
  });

  it("no focus param → input is not auto-focused", () => {
    params = {};
    render(<ProducersClient {...PROPS} />);
    expect(screen.getByRole("searchbox")).not.toHaveFocus();
  });

  it("hydrates the box from an existing ?q= param", () => {
    params = { q: "לחם" };
    render(<ProducersClient {...PROPS} />);
    expect(screen.getByRole("searchbox")).toHaveValue("לחם");
  });
});
