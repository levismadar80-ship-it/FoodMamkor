import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, renderHook, act } from "@testing-library/react";
import { HomeProducersGrid } from "@/app/[locale]/home/HomeProducersGrid";
import { useHomePage } from "@/lib/use-home-page";
import api from "@/lib/api";

// MEH-1282 (GAP A): a "קרוב אליי" search that finds nothing nearby falls back to
// the full list. The MEH-1269 toast alone was too transient — the final state
// (chip cleared, full list shown) read as "nothing happened". These tests pin
// (1) the grid renders a persistent inline notice when the flag is set, and
// (2) useHomePage sets the flag on an empty geo search and clears it on any
// filter action (here: a chip toggle).

// ---------- Part 1: grid render ----------

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
vi.mock("@/components/ChipScrollRow", () => ({ default: () => null }));

// Hook-test dependencies (Part 2).
const router = { replace: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
// MEH-1774: useHomePage now also takes the locale-aware router for the chip
// deep-link; without this mock the real one runs outside a next-intl provider.
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/i18n-key-map", () => ({ mapKey: (k) => k }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/use-user-city", () => ({
  useUserCity: () => ({ city: null, setCity: vi.fn() }),
}));
vi.mock("@/lib/use-onboarding", () => ({
  useOnboarding: () => ({ step: -1, advance: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock("@/lib/recently-viewed", () => ({ getRecentlyViewedIds: () => [] }));
vi.mock("@/lib/friday-mode", () => ({ isFridayMode: () => false }));
vi.mock("@/lib/featured-producer", () => ({ selectFeaturedProducer: () => null }));
vi.mock("@/lib/toast", () => ({ showToast: { info: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/user-location", () => ({
  getUserLocation: () => ({ lat: 32.0853, lng: 34.7818 }),
  setUserLocation: vi.fn(),
}));
// Every /producers call (geo + fallback) resolves empty → triggers the guard.
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [] })) },
}));

const baseProps = {
  producers: [],
  producersLoading: false,
  visibleProducers: [],
  hasMore: false,
  visibleCount: 8,
  filters: { category: "", delivery_city: "", has_delivery: false },
  chips: {},
  categories: [],
  showNewUserHint: false,
  fridayMode: false,
  step0Visible: false,
  onboardStep: -1,
  onboardAdvance: () => {},
  onboardDismiss: () => {},
  onAdvanceFromStep0: () => {},
  onChipNavigate: () => {},
  onClearCategory: () => {},
  onClearLocation: () => {},
  onLoadMore: () => {},
};

describe("HomeProducersGrid geo-empty notice (MEH-1282)", () => {
  it("renders the persistent inline notice when geoEmptyNotice is set", () => {
    render(<HomeProducersGrid {...baseProps} geoEmptyNotice={true} />);
    const notice = screen.getByTestId("geo-empty-notice");
    expect(notice).toBeInTheDocument();
    expect(notice).toHaveTextContent("home.producers.geo_empty");
  });

  it("does not render the notice when the flag is unset", () => {
    render(<HomeProducersGrid {...baseProps} geoEmptyNotice={false} />);
    expect(screen.queryByTestId("geo-empty-notice")).not.toBeInTheDocument();
  });
});

// ---------- Part 2: hook set-on-empty + clear-on-filter-action ----------

const flush = async () => {
  // Drain the loadProducersGeo promise chain (two radii + fallback fetch).
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

beforeEach(() => {
  router.replace.mockClear();
  api.get.mockClear();
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("useHomePage geoEmptyNotice (MEH-1282)", () => {
  it("sets the notice when a near-me search finds nothing at any radius", async () => {
    const { result } = renderHook(() => useHomePage());
    expect(result.current.geoEmptyNotice).toBe(false);
    await act(async () => {
      result.current.handleNearMe();
      await flush();
    });
    expect(result.current.geoEmptyNotice).toBe(true);
  });

  it("clears the notice on a chip toggle (filter action)", async () => {
    const { result } = renderHook(() => useHomePage());
    await act(async () => {
      result.current.handleNearMe();
      await flush();
    });
    expect(result.current.geoEmptyNotice).toBe(true);
    act(() => result.current.navigateToChip("kosher"));
    expect(result.current.geoEmptyNotice).toBe(false);
  });
});
