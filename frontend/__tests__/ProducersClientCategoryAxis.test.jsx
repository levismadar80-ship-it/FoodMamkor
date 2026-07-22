import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ProducersClient from "@/components/ProducersClient";

// MEH-1081 (MEH-1077 DISC-04): /producers gains a canonical category axis —
// a radio chip row (ChipScrollRow variant="category") backed by ?category=<id>
// (backend: producers.py:56 `category: int`, join on ProducerCategory.category_id).
// These tests pin the four contracts: chip click → URL + fetch param,
// deep-link hydration, compose with a toggle chip, and clear-all reset.
// MEH-1084 (MEH-1077 DISC-06): category *selection* now uses router.push
// (Back cancels the category → prior view); "all"/clear + chip/city/search
// refinement stay router.replace. The assertions below check the verb, not
// just the URL string.

const router = { replace: vi.fn(), push: vi.fn() };
let params = {}; // drives useSearchParams().get(key)

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => ({ get: (k) => (k in params ? params[k] : null) }),
}));
vi.mock("next-intl", () => ({ useTranslations: (s) => (k) => (s ? `${s}.${k}` : k) }));
vi.mock("next/link", () => ({ default: ({ children, href }) => <a href={href}>{children}</a> }));
vi.mock("@phosphor-icons/react", () => ({
  MagnifyingGlass: (p) => <span {...p} />,
  MapPin: (p) => <span {...p} />,
  Plant: (p) => <span {...p} />,
  Leaf: (p) => <span {...p} />,
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

// MEH-1441: category chips get a 16px CATEGORY_ICONS glyph. Stub the icon module
// (like CategorySelector.test.jsx) so the real Phosphor imports it pulls don't
// need to be added to the partial mock above. Category-tint: lib/map-categories.js
// (imported by ProducersClient for the tint lookup) pulls these named glyphs too,
// so the strict mock must export them (never rendered here — used as CATEGORY_STYLES
// icon refs only).
vi.mock("@/components/CategoryIcons", () => {
  const Glyph = (p) => <span data-testid="cat-glyph" {...p} />;
  return {
    CATEGORY_ICONS: { "בשר": Glyph, "דבש": Glyph },
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
// Interactive stand-in: renders one button per chip so tests can click chips
// in BOTH rows (category radio + boolean toggles) and read active state.
vi.mock("@/components/ChipScrollRow", () => ({
  default: ({ chips, variant, activeKey, activeKeys = {}, onChipClick }) => (
    <div data-testid={`chip-row-${variant}`}>
      {chips.map((c) => (
        <button
          key={c.key}
          data-active={variant === "category" ? String(c.key === activeKey) : String(!!activeKeys[c.key])}
          onClick={() => onChipClick(c.key)}
        >
          {c.label}
        </button>
      ))}
    </div>
  ),
}));
vi.mock("@/components/LocationModal", () => ({ default: () => null }));
vi.mock("@/components/Skeleton", () => ({ SkeletonProducerGrid: () => null }));
vi.mock("@/lib/use-user-city", () => ({
  useUserCity: () => ({ city: null, setCity: vi.fn(), clearCity: vi.fn() }),
}));
vi.mock("@/lib/recently-viewed", () => ({ getRecentlyViewedIds: () => [] }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));

const CATEGORIES = [
  { id: 1, name: "בשר", emoji: null },
  { id: 18, name: "דבש", emoji: null },
];

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn((path) => {
      if (path === "/categories") return Promise.resolve({ data: CATEGORIES });
      if (path === "/producers/count") return Promise.resolve({ data: { count: 0 } });
      return Promise.resolve({ data: [], headers: { "x-total-count": "0" } });
    }),
  },
}));

import api from "@/lib/api";

// MEH-1088 Part A: category chips with 0 approved producers are hidden once the
// catalog is fully loaded. These tests exercise the chips, so the fixture seeds
// one producer per category (בשר, דבש) — otherwise the empty catalog would
// (correctly) hide both chips. totalPages:1 → catalog fully loaded at mount.
const PROPS = {
  initialItems: [
    { id: "11111111-1111-1111-1111-111111111111", name: "עסק בשר", categories: [{ id: 1, name: "בשר" }] },
    { id: "22222222-2222-2222-2222-222222222222", name: "עסק דבש", categories: [{ id: 18, name: "דבש" }] },
  ],
  initialTotal: 2,
  initialPage: 1,
  totalPages: 1,
  perPage: 12,
};

// MEH-1294: syncUrl now mirrors via the shallow History API. Spy on
// pushState/replaceState — the MEH-1084 verb distinction is preserved
// (pushState = category selection, replaceState = refinement/clear). The
// url is the 3rd arg to history.{push,replace}State(state, title, url).
const pushSpy = vi.spyOn(window.history, "pushState");
const replaceSpy = vi.spyOn(window.history, "replaceState");
const lastReplaceUrl = () => replaceSpy.mock.calls.at(-1)?.[2] ?? "";
const lastPushUrl = () => pushSpy.mock.calls.at(-1)?.[2] ?? "";
const producersCalls = () =>
  api.get.mock.calls.filter(([path]) => path === "/producers").map(([, opts]) => opts?.params ?? {});

// jsdom doesn't implement IntersectionObserver — stub it (the infinite-scroll
// effect mounts one when hasMore is true, e.g. the totalPages>1 case below).
beforeAll(() => {
  global.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  // reset the jsdom URL so the same-URL guard starts from a clean slate.
  window.history.replaceState(null, "", "/");
  pushSpy.mockClear();
  replaceSpy.mockClear();
  api.get.mockClear();
  params = {};
});

describe("/producers category axis (MEH-1081)", () => {
  it("clicking a category chip pushes ?category=<id> (Back cancels) and fetches with the id", async () => {
    render(<ProducersClient {...PROPS} />);
    const row = await screen.findByTestId("chip-row-category");
    fireEvent.click(within(row).getByText("דבש"));
    // MEH-1084: category selection is a push (new view), not a replace.
    expect(lastPushUrl()).toContain("category=18");
    expect(lastReplaceUrl()).not.toContain("category=18");
    await waitFor(() => {
      expect(producersCalls().some((p) => String(p.category) === "18")).toBe(true);
    });
  });

  it("deep-link ?category=18 hydrates: chip active + mount fetch carries the id", async () => {
    params = { category: "18" };
    render(<ProducersClient {...PROPS} />);
    // the active category renders twice by design (radio row + removable
    // strip chip) — scope to the radio row for the active-state assertion.
    const row = await screen.findByTestId("chip-row-category");
    const chip = within(row).getByText("דבש");
    expect(chip.dataset.active).toBe("true");
    await waitFor(() => {
      expect(producersCalls().some((p) => String(p.category) === "18")).toBe(true);
    });
  });

  it("category composes with a toggle chip — both in URL and fetch params", async () => {
    // MEH-1259: was the "אורגני" toggle (now removed) — use "ללא גלוטן".
    render(<ProducersClient {...PROPS} />);
    const row = await screen.findByTestId("chip-row-category");
    fireEvent.click(within(row).getByText("דבש"));
    fireEvent.click(within(screen.getByTestId("chip-row-toggle")).getByText("ללא גלוטן"));
    const url = lastReplaceUrl();
    expect(url).toContain("category=18");
    expect(url).toContain("gluten_free=1");
    await waitFor(() => {
      expect(
        producersCalls().some((p) => String(p.category) === "18" && p.gluten_free === true),
      ).toBe(true);
    });
  });

  it("the 'all' sentinel + clear-all drop the category via replace; re-select pushes", async () => {
    params = { category: "18" };
    render(<ProducersClient {...PROPS} />);
    const row = await screen.findByTestId("chip-row-category");
    // "all" returns to baseline → replace (no history push → no double-Back).
    fireEvent.click(within(row).getByText("producers.filters.category_all"));
    expect(lastReplaceUrl()).not.toContain("category=");
    // re-select a real category → push carries the id.
    fireEvent.click(within(row).getByText("דבש"));
    expect(lastPushUrl()).toContain("category=18");
    // clear everything via the active-strip clear-all → replace, category gone.
    fireEvent.click(screen.getByText("producers.filters.clear_all"));
    expect(lastReplaceUrl()).not.toContain("category=");
  });
});

describe("MEH-1088 Part A — hide zero-producer category chips", () => {
  // Catalog fully loaded (totalPages 1) with ONLY a בשר producer → the דבש
  // category (0 approved producers) must not render as a dead-end chip.
  const ONLY_MEAT = [
    { id: "11111111-1111-1111-1111-111111111111", name: "עסק בשר", categories: [{ id: 1, name: "בשר" }] },
  ];

  it("hides a category with 0 approved producers; keeps 'הכל' and non-empty ones", async () => {
    render(<ProducersClient {...PROPS} initialItems={ONLY_MEAT} initialTotal={1} />);
    const row = await screen.findByTestId("chip-row-category");
    expect(within(row).getByText("producers.filters.category_all")).toBeInTheDocument();
    expect(within(row).getByText("בשר")).toBeInTheDocument();
    expect(within(row).queryByText("דבש")).toBeNull();
  });

  it("keeps a URL-active category visible even at 0 producers (clear flow intact)", async () => {
    params = { category: "18" }; // דבש active via URL, but no דבש producer loaded
    render(<ProducersClient {...PROPS} initialItems={ONLY_MEAT} initialTotal={1} />);
    const row = await screen.findByTestId("chip-row-category");
    expect(within(row).getByText("דבש")).toBeInTheDocument();
    expect(within(row).getByText("דבש").dataset.active).toBe("true");
  });

  it("does NOT hide any category while the catalog is not fully loaded (more pages)", async () => {
    // totalPages 2 → hasMore true → nothing filtered (a later page may hold דבש).
    render(<ProducersClient {...PROPS} initialItems={ONLY_MEAT} initialTotal={20} totalPages={2} />);
    const row = await screen.findByTestId("chip-row-category");
    expect(within(row).getByText("בשר")).toBeInTheDocument();
    expect(within(row).getByText("דבש")).toBeInTheDocument();
  });
});
