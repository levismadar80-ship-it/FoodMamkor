import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ProducersClient from "@/components/ProducersClient";

// MEH-1081 (MEH-1077 DISC-04): /producers gains a canonical category axis —
// a radio chip row (ChipScrollRow variant="category") backed by ?category=<id>
// (backend: producers.py:56 `category: int`, join on ProducerCategory.category_id).
// These tests pin the four contracts: chip click → URL + fetch param,
// deep-link hydration, compose with a toggle chip, and clear-all reset.

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
}));

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

const PROPS = { initialItems: [], initialTotal: 0, initialPage: 1, totalPages: 1, perPage: 12 };

const lastReplaceUrl = () => router.replace.mock.calls.at(-1)?.[0] ?? "";
const producersCalls = () =>
  api.get.mock.calls.filter(([path]) => path === "/producers").map(([, opts]) => opts?.params ?? {});

beforeEach(() => {
  router.replace.mockClear();
  api.get.mockClear();
  params = {};
});

describe("/producers category axis (MEH-1081)", () => {
  it("clicking a category chip writes ?category=<id> and fetches with the id", async () => {
    render(<ProducersClient {...PROPS} />);
    const row = await screen.findByTestId("chip-row-category");
    fireEvent.click(within(row).getByText("דבש"));
    expect(lastReplaceUrl()).toContain("category=18");
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
    render(<ProducersClient {...PROPS} />);
    const row = await screen.findByTestId("chip-row-category");
    fireEvent.click(within(row).getByText("דבש"));
    fireEvent.click(within(screen.getByTestId("chip-row-toggle")).getByText("אורגני"));
    const url = lastReplaceUrl();
    expect(url).toContain("category=18");
    expect(url).toContain("organic=1");
    await waitFor(() => {
      expect(
        producersCalls().some((p) => String(p.category) === "18" && p.organic === true),
      ).toBe(true);
    });
  });

  it("the 'all' sentinel and clear-all both drop the category", async () => {
    params = { category: "18" };
    render(<ProducersClient {...PROPS} />);
    const row = await screen.findByTestId("chip-row-category");
    fireEvent.click(within(row).getByText("producers.filters.category_all"));
    expect(lastReplaceUrl()).not.toContain("category=");
    // re-select, then clear everything via the active-strip clear-all
    fireEvent.click(within(row).getByText("דבש"));
    expect(lastReplaceUrl()).toContain("category=18");
    fireEvent.click(screen.getByText("producers.filters.clear_all"));
    expect(lastReplaceUrl()).not.toContain("category=");
  });
});
