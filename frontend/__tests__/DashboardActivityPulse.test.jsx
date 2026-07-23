/**
 * MEH-964 1C: ActivityPulse behavior on the Overview (§5 final-spec rulings).
 *
 * ActivityPulse is an inline section of dashboard/page.js, so the test renders
 * the full dashboard page and drives the analytics payload through the api
 * mock — the whole-component convention established by
 * DashboardSingleCompletenessWidget.test.jsx (same mock set).
 *
 * Locked behavior under test:
 *   - hero + the single section CTA appear ONLY when whatsapp_clicks.last_7d > 0
 *     (truthful-"new" ruling — bound to last_7d, never .total)
 *   - each row gates independently on its own last_7d > 0 (card sizes to
 *     rows.length; views-only profile shows one row, no hero, no CTA)
 *   - both metrics 0 → warm zero-state, no rows
 *   - no reviews row exists (dropped ruling — returns with MEH-966)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ProducerDashboardPage from "@/app/[locale]/producer/dashboard/page";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/lib/auth-context", () => {
  const user = { id: 1, name: "דנה", role: "producer" };
  return {
    useAuth: () => ({ user, loading: false }),
  };
});

vi.mock("next-intl", () => {
  const t = (key) => key;
  t.rich = (key) => key;
  return {
    useLocale: () => "he",
    useTranslations: () => t,
  };
});

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@phosphor-icons/react", () => ({
  PencilSimple: (p) => <span {...p} />,
  Warning: (p) => <span {...p} />,
  Leaf: (p) => <span {...p} />,
  Check: (p) => <span {...p} />,
  ArrowRight: (p) => <span {...p} />,
  X: (p) => <span {...p} />,
  Sparkle: (p) => <span {...p} />,
  WhatsappLogo: (p) => <span {...p} />,
  Eye: (p) => <span {...p} />,
}));
vi.mock("@/components/InfoTooltip", () => ({ default: () => null }));
vi.mock("@/components/PhoneVerifyCard", () => ({ default: () => null }));
vi.mock("@/components/ui/Input", () => ({ default: () => null }));
vi.mock("@/lib/holidays", () => ({ getUpcomingHoliday: () => null }));

// Mutable analytics payload — each test sets it before render (vi.hoisted so
// the api mock factory can close over it despite vi.mock hoisting).
const { analyticsRef } = vi.hoisted(() => ({ analyticsRef: { current: null } }));

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn((url) => {
      if (url === "/producers/me/dashboard") {
        return Promise.resolve({
          data: {
            producer: {
              id: 1,
              name: "עסק לדוגמה",
              status: "approved",
              availability_state: "accepting_orders",
            },
          },
        });
      }
      if (url === "/producers/me/analytics") {
        return Promise.resolve({ data: analyticsRef.current });
      }
      // /producers/me → null profile: the completeness card stays unmounted;
      // the pulse doesn't depend on it.
      return Promise.resolve({ data: null });
    }),
    post: vi.fn(() => Promise.resolve({})),
    put: vi.fn(() => Promise.resolve({})),
  },
}));

// Aggregate shape mirroring producer_me.py:689-705 (only the fields the
// Overview reads).
const zeroAnalytics = {
  profile_views: { last_7d: 0, last_30d: 0, total: 12 },
  whatsapp_clicks: { last_7d: 0, last_30d: 0, total: 7 },
  contact_clicks: { last_7d: 0, last_30d: 0, total: 0 },
  average_rating: 0,
  total_reviews: 0,
  rank_in_city: null,
  conversion_rate: 0,
  profile_strength: 0,
};

describe("Dashboard ActivityPulse (MEH-964 1C)", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("whatsapp activity → hero + both rows + single wa.me CTA", async () => {
    analyticsRef.current = {
      ...zeroAnalytics,
      whatsapp_clicks: { ...zeroAnalytics.whatsapp_clicks, last_7d: 3 },
      profile_views: { ...zeroAnalytics.profile_views, last_7d: 5 },
    };
    render(<ProducerDashboardPage />);

    const pulse = await screen.findByTestId("activity-pulse");
    expect(pulse).toBeInTheDocument();
    expect(screen.getByTestId("activity-pulse-hero")).toBeInTheDocument();
    expect(screen.getByTestId("activity-pulse-row-whatsapp")).toBeInTheDocument();
    expect(screen.getByTestId("activity-pulse-row-view")).toBeInTheDocument();
    const cta = screen.getByTestId("activity-pulse-cta");
    expect(cta).toHaveAttribute("href", "https://wa.me/");
    expect(screen.queryByTestId("activity-pulse-empty")).not.toBeInTheDocument();
  });

  it("views only (whatsapp 0) → one row, NO hero, NO CTA (truthful-new ruling)", async () => {
    analyticsRef.current = {
      ...zeroAnalytics,
      profile_views: { ...zeroAnalytics.profile_views, last_7d: 4 },
    };
    render(<ProducerDashboardPage />);

    await screen.findByTestId("activity-pulse-row-view");
    expect(screen.queryByTestId("activity-pulse-row-whatsapp")).not.toBeInTheDocument();
    expect(screen.queryByTestId("activity-pulse-hero")).not.toBeInTheDocument();
    expect(screen.queryByTestId("activity-pulse-cta")).not.toBeInTheDocument();
    expect(screen.queryByTestId("activity-pulse-empty")).not.toBeInTheDocument();
  });

  it("both windowed metrics 0 → zero-state only (lifetime totals never leak in)", async () => {
    // totals are non-zero on purpose: the pulse must read last_7d, not .total.
    analyticsRef.current = { ...zeroAnalytics };
    render(<ProducerDashboardPage />);

    const empty = await screen.findByTestId("activity-pulse-empty");
    expect(empty).toBeInTheDocument();
    expect(screen.queryByTestId("activity-pulse-hero")).not.toBeInTheDocument();
    expect(screen.queryByTestId("activity-pulse-row-whatsapp")).not.toBeInTheDocument();
    expect(screen.queryByTestId("activity-pulse-row-view")).not.toBeInTheDocument();
    expect(screen.queryByTestId("activity-pulse-cta")).not.toBeInTheDocument();
  });

  it("no reviews row exists in any state (dropped ruling — MEH-966)", async () => {
    analyticsRef.current = {
      ...zeroAnalytics,
      whatsapp_clicks: { ...zeroAnalytics.whatsapp_clicks, last_7d: 1 },
      total_reviews: 9,
      average_rating: 4.8,
    };
    render(<ProducerDashboardPage />);

    await screen.findByTestId("activity-pulse");
    expect(screen.queryByTestId("activity-pulse-row-review")).not.toBeInTheDocument();
  });
});
