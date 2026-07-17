/**
 * MEH-1261 F2 — analytics/profile fetch failures on the producer Overview must
 * be visible + retryable, and each section must fail independently.
 *
 * Before the fix, `.catch(() => setAnalytics(null))` left the
 * "loading_analytics" line up forever, and `.catch(() => setProfile(null))`
 * silently unmounted the completeness card — a failed section was
 * indistinguishable from a slow one.
 *
 * Locked behavior under test:
 *   - dashboard OK + analytics/profile rejected → both section error cards
 *     render (role=alert), the analytics loading line is gone, and the page
 *     itself still renders (independence — no page-level failure)
 *   - clicking the analytics retry re-fires ONLY the analytics fetch; on
 *     success the error clears and the zero-state strip renders
 *
 * REUSES: __tests__/DashboardLoadError.test.jsx (mount harness — identity
 * next-intl mock + stable producer user + mocked child cards).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ProducerDashboardPage from "@/app/[locale]/producer/dashboard/page";
import api from "@/lib/api";

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

// Identity translations; `t.rich` is used by welcome_subtitle so the identity
// fn also carries a `rich` member (returns the key, ignores the tag map).
vi.mock("next-intl", () => ({
  useLocale: () => "he",
  useTranslations: () => {
    const t = (key) => key;
    t.rich = (key) => key;
    return t;
  },
}));

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
  Eye: (p) => <span {...p} />,
  LockSimple: (p) => <span {...p} />,
  Sparkle: (p) => <span {...p} />,
  WhatsappLogo: (p) => <span {...p} />,
  X: (p) => <span {...p} />,
}));
vi.mock("@/components/InfoTooltip", () => ({ default: () => null }));
vi.mock("@/components/PhoneVerifyCard", () => ({ default: () => null }));
vi.mock("@/components/ProfileCompletenessCard", () => ({ default: () => null }));
vi.mock("@/app/[locale]/producer/dashboard/ChangesRequestedBanner", () => ({
  default: () => null,
}));
vi.mock("@/lib/holidays", () => ({ getUpcomingHoliday: () => null }));

const PRODUCER = {
  id: "p-1",
  name: "מאפיית הבית",
  status: "approved",
  availability_state: "available",
  vacation_until: null,
};

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(() => Promise.resolve({})),
    put: vi.fn(() => Promise.resolve({})),
  },
}));

function mockGets({ analytics, profile }) {
  api.get.mockImplementation((url) => {
    if (url === "/producers/me/dashboard") {
      return Promise.resolve({ data: { producer: PRODUCER } });
    }
    if (url === "/producers/me/analytics") return analytics(url);
    if (url === "/producers/me") return profile(url);
    return Promise.resolve({ data: null });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Producer dashboard — independent section fetch errors (MEH-1261 F2)", () => {
  it("failed analytics + profile fetches render visible error cards, page still up", async () => {
    mockGets({
      analytics: () => Promise.reject(new Error("boom")),
      profile: () => Promise.reject(new Error("boom")),
    });
    render(<ProducerDashboardPage />);

    const analyticsErr = await screen.findByTestId("dashboard-analytics-error");
    expect(analyticsErr).toHaveAttribute("role", "alert");
    const profileErr = await screen.findByTestId("dashboard-profile-error");
    expect(profileErr).toHaveAttribute("role", "alert");

    // No frozen loading line, and the dashboard content itself rendered —
    // the section failures are independent, not page-fatal.
    expect(screen.queryByText("loading_analytics")).not.toBeInTheDocument();
    expect(screen.getByTestId("producer-overview")).toBeInTheDocument();
  });

  it("analytics retry re-fetches only analytics; success clears the error", async () => {
    let analyticsCalls = 0;
    mockGets({
      analytics: () => {
        analyticsCalls += 1;
        return analyticsCalls === 1
          ? Promise.reject(new Error("boom"))
          : Promise.resolve({
              data: {
                profile_views: { total: 0, last_7d: 0 },
                whatsapp_clicks: { total: 0, last_7d: 0 },
              },
            });
      },
      profile: () => Promise.reject(new Error("boom")),
    });
    render(<ProducerDashboardPage />);

    const analyticsErr = await screen.findByTestId("dashboard-analytics-error");
    const profileCallsBefore = api.get.mock.calls.filter(
      ([u]) => u === "/producers/me",
    ).length;
    fireEvent.click(analyticsErr.querySelector("button"));

    await waitFor(() =>
      expect(screen.queryByTestId("dashboard-analytics-error")).not.toBeInTheDocument(),
    );
    // Zero-activity strip renders once analytics resolves (hasActivity=false).
    expect(await screen.findByTestId("overview-zero-state")).toBeInTheDocument();
    expect(analyticsCalls).toBe(2);
    // Retry fired ONLY the analytics fetch — the profile call count is flat.
    const profileCallsAfter = api.get.mock.calls.filter(
      ([u]) => u === "/producers/me",
    ).length;
    expect(profileCallsAfter).toBe(profileCallsBefore);
  });
});
