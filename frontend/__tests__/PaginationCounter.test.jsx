/**
 * MEH-159 — Pagination counter stays fresh after delete.
 * liveTotal updates from x-total-count header and /producers/count on focus.
 */
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { render, act, screen } from "@testing-library/react";

// MEH-475 PR-C4a chunk 4a: mock next-intl. ProducersClient + sub-components
// (RecentlyViewedStrip / FilterEmptyState / CatalogEmptyState / PageOverflowState
// / ServerPageLinks) all call useTranslations(). Map keys this test asserts on;
// ICU plural strings resolve via simple substitution so {count} interpolations
// render naturally.
vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => {
    const flat = {
      "breadcrumb.home": "בית",
      "breadcrumb.all": "כל בתי העסק",
      "title.all": "כל בתי העסק",
      "discovery.found_count": `נמצאו ${vars?.count ?? 0} בתי עסק`,
      "discovery.all_count": `כל ${vars?.count ?? 0} בתי העסק`,
      "discovery.showing_count": `מציגות ${vars?.loaded ?? 0} מתוך ${vars?.total ?? 0} בתי עסק`,
      "discovery.all_shown": `הצגנו את כל ${vars?.count ?? 0} בתי העסק`,
      "discovery.loading_more_aria": "טוענת עוד בתי עסק",
      "filters.city_chip": "בעיר שלי",
      "filters.filter_by": "מסנן לפי:",
      "filters.clear_all": "נקי הכל",
      "recently_viewed.aria": "ביקרת לאחרונה",
      "recently_viewed.label": "ביקרת לאחרונה",
    };
    return flat[key] ?? key;
  },
}));

// jsdom doesn't implement IntersectionObserver — stub it out.
beforeAll(() => {
  global.IntersectionObserver = class {
    observe() {}
    disconnect() {}
  };
});

// Minimal mock for ProducersClient dependencies
vi.mock("@/components/Breadcrumb", () => ({ default: () => null }));
vi.mock("@/components/ProducerCard", () => ({ default: () => null }));
vi.mock("@/components/ChipScrollRow", () => ({ default: () => null }));
vi.mock("@/components/LocationModal", () => ({ default: () => null }));
vi.mock("@/components/Skeleton", () => ({
  SkeletonProducerGrid: () => null,
}));
vi.mock("@/lib/producer-filters", () => ({
  buildChipParams: vi.fn(() => ({})),
  CHIPS_CONFIG: [],
  CHIPS_DEFAULT: {},
}));
vi.mock("@/lib/use-user-city", () => ({
  useUserCity: () => ({ city: null, setCity: vi.fn() }),
}));
vi.mock("@/lib/recently-viewed", () => ({
  getRecentlyViewedIds: vi.fn(() => []),
}));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => null }),
  useRouter: () => ({ replace: vi.fn() }),
}));

const apiGetSpy = vi.fn();
vi.mock("@/lib/api", () => ({
  default: { get: (...args) => apiGetSpy(...args) },
}));

import ProducersClient from "@/components/ProducersClient";

const INITIAL_ITEMS = [{ id: "1", name: "עסק א", city: "חיפה", slug: "a", status: "approved" }];

function makeProps(overrides = {}) {
  return {
    initialItems: INITIAL_ITEMS,
    initialTotal: 50,
    initialPage: 1,
    totalPages: 3,
    perPage: 24,
    ...overrides,
  };
}

describe("MEH-159 — liveTotal pagination counter", () => {
  afterEach(() => vi.clearAllMocks());

  it("shows initialTotal on first render", () => {
    apiGetSpy.mockResolvedValue({ data: [], headers: {} });
    render(<ProducersClient {...makeProps()} />);
    expect(screen.getByText(/מתוך 50/)).toBeInTheDocument();
  });

  it("updates counter when /producers/count returns fresh value on tab focus", async () => {
    apiGetSpy.mockResolvedValue({ data: { count: 45 }, headers: {} });

    render(<ProducersClient {...makeProps({ initialTotal: 50 })} />);
    expect(screen.getByText(/מתוך 50/)).toBeInTheDocument();

    await act(async () => {
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(screen.getByText(/מתוך 45/)).toBeInTheDocument();
  });

  it("does not update on visibilitychange when tab is hidden", async () => {
    apiGetSpy.mockResolvedValue({ data: { count: 30 }, headers: {} });

    render(<ProducersClient {...makeProps({ initialTotal: 50 })} />);

    await act(async () => {
      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // /producers/count should NOT have been called when hidden
    const countCalls = apiGetSpy.mock.calls.filter(([url]) => url === "/producers/count");
    expect(countCalls).toHaveLength(0);
    expect(screen.getByText(/מתוך 50/)).toBeInTheDocument();
  });
});
