/**
 * MEH-2674 — «מוכנים לארח נקודת מסירה» card on the insights page.
 *
 * Same rig as InsightsCoverageRequests.test.jsx (real NextIntlClientProvider
 * + he.json, mocked api + auth). Count states of the 5-state rule:
 * 0 → no card at all (decided, not forgotten) · 1 → one row · many → one
 * row per host in server order. Key missing (pre-MEH-2673 payload) and a
 * malformed row both read as 0. No open/closed state.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
  coverage_requests: [],
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

const T = he.dashboard.producer.analytics.pickup_hosts;

beforeEach(() => {
  api.get.mockReset();
});

describe("Insights pickup-hosts card (MEH-2674)", () => {
  it("0 hosts: no card (the sibling demand card still renders)", async () => {
    mockApi({ ...baseAnalytics, pickup_hosts: [] });
    renderPage();
    await screen.findByTestId("coverage-requests-card");
    expect(screen.queryByTestId("pickup-hosts-card")).toBeNull();
    expect(screen.queryByText(T.title)).toBeNull();
  });

  it("key missing (older payload) or a malformed row: same as 0, no crash", async () => {
    mockApi({ ...baseAnalytics });
    const first = renderPage();
    await screen.findByTestId("coverage-requests-card");
    expect(screen.queryByTestId("pickup-hosts-card")).toBeNull();
    first.unmount();
    mockApi({ ...baseAnalytics, pickup_hosts: [{ email: 123 }, "junk"] });
    renderPage();
    await screen.findByTestId("coverage-requests-card");
    expect(screen.queryByTestId("pickup-hosts-card")).toBeNull();
  });

  it("1 host: title + sub + one mailto row with her city", async () => {
    mockApi({ ...baseAnalytics, pickup_hosts: [{ email: "host@example.com", city: "חדרה" }] });
    renderPage();
    const card = await screen.findByTestId("pickup-hosts-card");
    expect(card).toHaveTextContent(T.title);
    expect(card).toHaveTextContent(T.sub);
    const rows = screen.getAllByTestId("pickup-host-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("host@example.com");
    expect(rows[0]).toHaveTextContent("חדרה");
    expect(rows[0].querySelector("a").getAttribute("href")).toBe("mailto:host@example.com");
  });

  it("many: one row per host, server order kept", async () => {
    mockApi({
      ...baseAnalytics,
      pickup_hosts: [
        { email: "a@example.com", city: "חדרה" },
        { email: "b@example.com", city: "בנימינה" },
        { email: "c@example.com", city: "חדרה" },
      ],
    });
    renderPage();
    await screen.findByTestId("pickup-hosts-card");
    const rows = screen.getAllByTestId("pickup-host-row");
    expect(rows.map((r) => r.querySelector("a").textContent)).toEqual([
      "a@example.com",
      "b@example.com",
      "c@example.com",
    ]);
    expect(rows[1]).toHaveTextContent("בנימינה");
  });
});
