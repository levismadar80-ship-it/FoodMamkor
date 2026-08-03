import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ProducersClient from "@/components/ProducersClient";

// MEH-1483: /producers backend-driven sort select (?sort=). Pins:
//  (1) the select renders near the counter, default "newest";
//  (2) picking "rating" writes ?sort=rating to the URL AND threads sort into the
//      refetch (the [sortOrder] effect fetches sorted page 1);
//  (3) a ?sort=rating deep-link hydrates the select + fetches sorted;
//  (4) the default (newest) never sends a sort param — byte-identical to today.

let params = {}; // drives useSearchParams().get / getAll

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
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
vi.mock("@/components/CategoryIcons", () => {
  const Glyph = (p) => <span {...p} />;
  return {
    CATEGORY_ICONS: {},
    Meat: Glyph, FishSimple: Glyph, Cheese: Glyph, Bread: Glyph, OliveOil: Glyph, Hive: Glyph,
  };
});
vi.mock("@/components/Breadcrumb", () => ({ default: () => null }));
vi.mock("@/components/ProducerCard", () => ({ default: () => <div data-testid="card" /> }));
vi.mock("@/components/ChipScrollRow", () => ({ default: () => null }));
vi.mock("@/components/LocationModal", () => ({ default: () => null }));
vi.mock("@/components/Skeleton", () => ({ SkeletonProducerGrid: () => null }));
vi.mock("@/lib/producer-filters", () => ({
  buildChipParams: () => ({}),
  CHIPS_CONFIG: [],
  CHIPS_DEFAULT: {},
}));
vi.mock("@/lib/use-user-city", () => ({
  useUserCity: () => ({ city: null, setCity: vi.fn(), clearCity: vi.fn() }),
}));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));

const apiGet = vi.fn(() => Promise.resolve({ data: [], headers: { "x-total-count": "1" } }));
vi.mock("@/lib/api", () => ({ default: { get: (...a) => apiGet(...a) } }));

// One SSR item + total 1 so the results counter (and thus the sort select) render.
// MEH-1864: the sort control is gated on the catalog having enough reviewed
// businesses; every case in THIS file describes the above-threshold behaviour,
// so the flag is on. The gated (below-threshold) behaviour lives in
// RatingDataGate.test.jsx.
const PROPS = {
  initialItems: [{ id: "1", categories: [] }],
  initialTotal: 1,
  initialPage: 1,
  totalPages: 1,
  perPage: 24,
  ratingSortEnabled: true,
};

const sortCalls = () =>
  apiGet.mock.calls.filter(
    ([url, cfg]) => url === "/producers" && cfg?.params?.sort !== undefined,
  );

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  params = {};
  apiGet.mockClear();
});

describe("ProducersClient sort select (MEH-1483)", () => {
  it("renders the sort select defaulting to newest with two options", () => {
    render(<ProducersClient {...PROPS} />);
    const select = screen.getByTestId("producers-sort");
    expect(select).toHaveValue("newest");
    expect(select.querySelectorAll("option")).toHaveLength(2);
  });

  it("default (newest) mount never sends a sort param to /producers", () => {
    render(<ProducersClient {...PROPS} />);
    expect(sortCalls()).toHaveLength(0);
  });

  it("picking rating syncs ?sort=rating to the URL and refetches with sort=rating", async () => {
    render(<ProducersClient {...PROPS} />);
    fireEvent.change(screen.getByTestId("producers-sort"), { target: { value: "rating" } });
    expect(window.location.search).toContain("sort=rating");
    await waitFor(() => {
      const calls = sortCalls();
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.some(([, cfg]) => cfg.params.sort === "rating")).toBe(true);
    });
  });

  it("hydrates from a ?sort=rating deep-link and fetches sorted page 1", async () => {
    params = { sort: "rating" };
    render(<ProducersClient {...PROPS} />);
    expect(screen.getByTestId("producers-sort")).toHaveValue("rating");
    await waitFor(() => {
      expect(
        sortCalls().some(
          ([, cfg]) => cfg.params.sort === "rating" && cfg.params.offset === 0,
        ),
      ).toBe(true);
    });
  });
});
