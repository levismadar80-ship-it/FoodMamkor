import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ProducersClient from "@/components/ProducersClient";
import {
  RATING_SORT_THRESHOLD,
  countRatedProducers,
  isRatingSortEnabled,
} from "@/lib/rating-gate";

/**
 * MEH-1864 — rating data gate.
 *
 * Pins the two halves of the acceptance criteria that a component test can
 * reach:
 *   (1) the classifier itself (lib/rating-gate.js) sorts a below-threshold
 *       catalog from an at-threshold one — run FIRST, because every assertion
 *       below is only worth reading if the classifier discriminates;
 *   (2) /producers offers no rating sort below the threshold, and a hand-typed
 *       ?sort=rating degrades to the default instead of sending a sort the UI
 *       never offered (the backend still answers that URL — untouched here).
 *
 * The above-threshold behaviour is pinned separately in
 * ProducersClientSort.test.jsx; this file's positive case exists only so the
 * negative ones are known to discriminate (a gate that hides the control in
 * BOTH states would pass every "absent" assertion here).
 */

let params = {}; // drives useSearchParams().get / getAll

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => ({
    get: (k) => (k in params ? params[k] : null),
    getAll: (k) => (k in params ? [params[k]] : []),
  }),
}));
vi.mock("next-intl", () => ({
  useTranslations: (s) => (k) => (s ? `${s}.${k}` : k),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }) => <a href={href}>{children}</a>,
}));
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
    Meat: Glyph,
    FishSimple: Glyph,
    Cheese: Glyph,
    Bread: Glyph,
    OliveOil: Glyph,
    Hive: Glyph,
  };
});
vi.mock("@/components/Breadcrumb", () => ({ default: () => null }));
vi.mock("@/components/ProducerCard", () => ({
  default: () => <div data-testid="card" />,
}));
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

const apiGet = vi.fn(() =>
  Promise.resolve({ data: [], headers: { "x-total-count": "1" } }),
);
vi.mock("@/lib/api", () => ({ default: { get: (...a) => apiGet(...a) } }));

const BASE_PROPS = {
  initialItems: [{ id: "1", categories: [] }],
  initialTotal: 1,
  initialPage: 1,
  totalPages: 1,
  perPage: 24,
};

const sortCalls = () =>
  apiGet.mock.calls.filter(
    ([url, cfg]) => url === "/producers" && cfg?.params?.sort !== undefined,
  );

// The rendered label for the rating option under the mocked translator —
// derived from the key the component asks for, never a copied literal.
const TOP_RATED_LABEL = "producers.sort.top_rated";

const producers = (ratedCount, unratedCount = 3) => [
  ...Array.from({ length: ratedCount }, (_, i) => ({
    id: `r${i}`,
    reviews_count: 1 + i,
    avg_rating: 4,
  })),
  ...Array.from({ length: unratedCount }, (_, i) => ({
    id: `u${i}`,
    reviews_count: 0,
    avg_rating: 0,
  })),
];

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  params = {};
  apiGet.mockClear();
});

// ── (1) classifier self-test — read this before trusting anything below ──
describe("rating-gate classifier (MEH-1864)", () => {
  it("counts only businesses carrying at least one review", () => {
    expect(countRatedProducers(producers(4))).toBe(4);
    // avg_rating alone must not qualify anything: reviews_count is the anchor.
    expect(
      countRatedProducers([{ reviews_count: 0, avg_rating: 5 }]),
    ).toBe(0);
    expect(countRatedProducers(null)).toBe(0);
    expect(countRatedProducers([])).toBe(0);
  });

  it("sorts below-threshold from at-threshold at exactly the boundary", () => {
    expect(isRatingSortEnabled(producers(RATING_SORT_THRESHOLD - 1))).toBe(false);
    expect(isRatingSortEnabled(producers(RATING_SORT_THRESHOLD))).toBe(true);
    expect(isRatingSortEnabled(producers(RATING_SORT_THRESHOLD + 1))).toBe(true);
  });

  it("is 5 businesses with >= 1 review", () => {
    expect(RATING_SORT_THRESHOLD).toBe(5);
  });
});

// ── (2) /producers sort UI ──
describe("/producers rating sort gate (MEH-1864)", () => {
  it("offers no rating sort below the threshold", () => {
    const { container } = render(
      <ProducersClient {...BASE_PROPS} ratingSortEnabled={false} />,
    );
    expect(screen.queryByTestId("producers-sort")).not.toBeInTheDocument();
    // The option's label must be absent from the whole subtree, not merely
    // outside the (also absent) select.
    expect(container.textContent).not.toContain(TOP_RATED_LABEL);
  });

  it("offers it above the threshold — the gate discriminates", () => {
    const { container } = render(
      <ProducersClient {...BASE_PROPS} ratingSortEnabled />,
    );
    expect(screen.getByTestId("producers-sort")).toBeInTheDocument();
    expect(container.textContent).toContain(TOP_RATED_LABEL);
  });

  it("hides the control when the prop is omitted (fail-closed default)", () => {
    render(<ProducersClient {...BASE_PROPS} />);
    expect(screen.queryByTestId("producers-sort")).not.toBeInTheDocument();
  });

  it("degrades a hand-typed ?sort=rating to the default while gated", async () => {
    params = { sort: "rating" };
    render(<ProducersClient {...BASE_PROPS} ratingSortEnabled={false} />);
    // No sorted refetch: the axis was never adopted, so the listing is the
    // plain default one. (The backend route itself is untouched — a direct
    // GET /producers?sort=rating still answers 200.)
    await waitFor(() => expect(apiGet).toHaveBeenCalled()); // mount settled
    expect(sortCalls()).toHaveLength(0);
    expect(window.location.search).not.toContain("sort=rating");
  });
});
