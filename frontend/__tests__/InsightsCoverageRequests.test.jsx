/**
 * MEH-1676 — «ביקוש מאזורים חדשים» card on the insights page.
 *
 * The three count states of the 5-state rule (0 / 1 / many), rendered under
 * the real NextIntlClientProvider + he.json with mocked api + auth, the same
 * rig as InsightsZeroStates.test.jsx. The card has no open/closed state.
 * A missing `coverage_requests` key (an older cached payload) renders the
 * empty state rather than crashing the page.
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
  useRouter: () => ({ push: vi.fn() }),
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
  top_cities: [],
};
const approvedProfile = { status: "approved", name: "מאפיית השדה" };

function mockApi(analytics) {
  api.get.mockImplementation((url) => {
    if (url === "/producers/me/analytics") return Promise.resolve({ data: analytics });
    if (url === "/producers/me") return Promise.resolve({ data: approvedProfile });
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

const T = he.dashboard.producer.analytics.coverage_requests;

beforeEach(() => {
  api.get.mockReset();
});

describe("Insights coverage-requests card (MEH-1676)", () => {
  it("0 requests: title + empty line, no rows", async () => {
    mockApi({ ...baseAnalytics, coverage_requests: [] });
    renderPage();
    const card = await screen.findByTestId("coverage-requests-card");
    expect(card).toHaveTextContent(T.title);
    expect(card).toHaveTextContent(T.empty);
    expect(screen.queryAllByTestId("coverage-request-row")).toHaveLength(0);
  });

  it("key missing (older payload): same as 0, page does not crash", async () => {
    mockApi({ ...baseAnalytics });
    renderPage();
    const card = await screen.findByTestId("coverage-requests-card");
    expect(card).toHaveTextContent(T.empty);
  });

  it("1 request: one row with the city and the singular count", async () => {
    mockApi({ ...baseAnalytics, coverage_requests: [{ city: "תל אביב-יפו", count: 1 }] });
    renderPage();
    const rows = await screen.findAllByTestId("coverage-request-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("תל אביב-יפו");
    expect(rows[0]).toHaveTextContent(T.row_one.replace("{city}", "תל אביב-יפו"));
    expect(screen.queryByText(T.empty)).toBeNull();
  });

  it("many: one row per city, server order kept, plus the scope line", async () => {
    mockApi({
      ...baseAnalytics,
      coverage_requests: [
        { city: "תל אביב-יפו", count: 5 },
        { city: "חיפה", count: 2 },
      ],
    });
    renderPage();
    const rows = await screen.findAllByTestId("coverage-request-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("תל אביב-יפו");
    expect(rows[0]).toHaveTextContent("5");
    expect(rows[1]).toHaveTextContent("חיפה");
    await waitFor(() =>
      expect(screen.getByTestId("coverage-requests-card")).toHaveTextContent(T.scope),
    );
  });
});
