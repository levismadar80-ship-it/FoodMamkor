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
  useSearchParams: () => ({ get: (k) => (k in params ? params[k] : null) }),
}));
vi.mock("next-intl", () => ({ useTranslations: (s) => (k) => (s ? `${s}.${k}` : k) }));
vi.mock("next/link", () => ({ default: ({ children, href }) => <a href={href}>{children}</a> }));
// MEH-990: ProducersClient now renders MapPin/Plant/Leaf icons too (Emoji LOCK
// swap of 📍🌱🌿) — mock all four so the partial mock doesn't throw on render.
vi.mock("@phosphor-icons/react", () => ({
  MagnifyingGlass: (p) => <span {...p} />,
  MapPin: (p) => <span {...p} />,
  Plant: (p) => <span {...p} />,
  Leaf: (p) => <span {...p} />,
}));

// Child components — render nothing meaningful; we only test the search wiring.
vi.mock("@/components/Breadcrumb", () => ({ default: () => null }));
vi.mock("@/components/ProducerCard", () => ({ default: () => <div data-testid="card" /> }));
vi.mock("@/components/ChipScrollRow", () => ({ default: () => null }));
vi.mock("@/components/LocationModal", () => ({ default: () => null }));
vi.mock("@/components/Skeleton", () => ({ SkeletonProducerGrid: () => null }));

// Filter lib — neutralize chips so syncUrl only handles q.
vi.mock("@/lib/producer-filters", () => ({
  buildChipParams: () => ({}),
  CHIPS_CONFIG: [],
  CHIPS_DEFAULT: {},
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
  router.replace.mockClear();
  params = {};
});

describe("ProducersClient free-text search (MEH-830)", () => {
  it("submitting the box writes the term to the URL as ?q= via router.replace", () => {
    render(<ProducersClient {...PROPS} />);
    const box = screen.getByRole("searchbox");
    fireEvent.change(box, { target: { value: "גבינה" } });
    fireEvent.submit(box.closest("form"));
    expect(router.replace).toHaveBeenCalledTimes(1);
    const url = router.replace.mock.calls[0][0];
    expect(url).toContain(`q=${encodeURIComponent("גבינה")}`);
  });

  it("trims whitespace and an empty term clears q (URL has no q=)", () => {
    render(<ProducersClient {...PROPS} />);
    const box = screen.getByRole("searchbox");
    fireEvent.change(box, { target: { value: "   " } });
    fireEvent.submit(box.closest("form"));
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace.mock.calls[0][0]).not.toContain("q=");
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
