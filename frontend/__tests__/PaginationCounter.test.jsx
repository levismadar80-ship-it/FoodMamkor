/**
 * MEH-159 — Pagination counter stays fresh after delete.
 * liveTotal updates from x-total-count header and /producers/count on focus.
 */
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { render, act, screen } from "@testing-library/react";

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
