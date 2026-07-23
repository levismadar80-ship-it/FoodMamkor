/**
 * MEH-1101 — insights zero-state paths (isolation).
 *
 * Renders the full insights page under the real NextIntlClientProvider +
 * he.json with mocked api + auth, covering the three zero-state paths:
 * pre-publish banner, followers-zero CTA, and the small-n cities text list —
 * plus the approved regression (none of them show; bars return at n>=3).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import InsightsPage from "@/app/[locale]/producer/dashboard/insights/page";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: 1, role: "producer" }, loading: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => <a href={typeof href === "string" ? href : "#"} {...rest}>{children}</a>,
}));

const zeroWindows = { last_7d: 0, last_30d: 0, total: 0 };
const baseAnalytics = {
  profile_views: zeroWindows,
  search_appearances: zeroWindows,
  whatsapp_clicks: zeroWindows,
  contact_clicks: zeroWindows,
  follower_count: 0,
  new_followers_this_week: 0,
  average_rating: 0,
  total_reviews: 0,
  views_by_day: [],
  top_cities: [{ city: "חיפה", count: 4 }],
};

function mockApi(profile, analytics) {
  api.get.mockImplementation((url) => {
    if (url === "/producers/me/analytics") return Promise.resolve({ data: analytics });
    if (url === "/producers/me") return Promise.resolve({ data: profile });
    return Promise.resolve({ data: [] });
  });
}

function renderPage() {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <InsightsPage />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Insights zero-states (MEH-1101)", () => {
  it("pending producer: banner + followers CTA + single-city text list", async () => {
    mockApi({ id: 1, status: "pending", slug: null }, baseAnalytics);
    renderPage();

    await waitFor(() => expect(screen.getByTestId("insights-zero-state")).toBeInTheDocument());
    expect(screen.getByText(he.dashboard.producer.insights_zero_state.title)).toBeInTheDocument();
    expect(screen.getByTestId("followers-zero-cta")).toBeInTheDocument();
    expect(screen.getByTestId("top-cities-list")).toBeInTheDocument();
    // KPI cards still render beneath the banner (value 0, not hidden).
    expect(
      screen.getByText(he.dashboard.producer.analytics.windowed.profile_views),
    ).toBeInTheDocument();
  });

  it("approved producer with data: no banner, numeric followers, bars at n=3", async () => {
    mockApi(
      { id: 1, status: "approved", slug: "meshek" },
      {
        ...baseAnalytics,
        follower_count: 5,
        new_followers_this_week: 2,
        top_cities: [
          { city: "חיפה", count: 9 },
          { city: "תל אביב", count: 5 },
          { city: "ירושלים", count: 2 },
        ],
      },
    );
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByText(he.dashboard.producer.analytics.top_cities_title),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("insights-zero-state")).not.toBeInTheDocument();
    expect(screen.queryByTestId("followers-zero-cta")).not.toBeInTheDocument();
    expect(screen.queryByTestId("top-cities-list")).not.toBeInTheDocument();
    // 3 proportional bars render for n=3.
    expect(screen.getAllByTestId("city-bar")).toHaveLength(3);
  });
});
