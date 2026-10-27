/**
 * MEH-2430 — owner-dashboard information that misled (27/10 staging audit).
 *
 * What the owner sees, not which lines changed. Every case below fails on the
 * pre-fix code:
 *   - a past event rendered «פעיל» with a «ביטול» button;
 *   - a past approved experience rendered «מאושרת» with «ביטול»;
 *   - an open group buy past its deadline rendered «פתוחה»;
 *   - the Overview rendered a «בעלת עסק השבוע» badge for a feature that does
 *     not exist, and a conversion line mixing a 30-day window into 7-day KPIs.
 * Future rows are the controls: they must keep their old badges and actions,
 * so "everything now says הסתיים" cannot pass.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { israelToday } from "@/lib/israel-date";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));
const ROUTER = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => ROUTER }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ROUTER,
  usePathname: () => "/producer/dashboard",
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));
const AUTH = { user: { id: "u1", role: "producer", producer_id: "p1" }, loading: false };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => AUTH }));
vi.mock("@/lib/toast", () => ({ showToast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/holidays", () => ({ getUpcomingHoliday: () => null }));

import EventsPage from "@/app/[locale]/producer/dashboard/events/page";
import ExperiencesPage from "@/app/[locale]/producer/dashboard/experiences/page";
import GroupBuysPage from "@/app/[locale]/producer/dashboard/group-buys/page";
import OverviewPage from "@/app/[locale]/producer/dashboard/page";

const P = he.dashboard.producer;
const PAST = "2020-01-01";
const FUTURE = "2099-01-01";

function renderIntl(ui) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const rowOf = (title) => screen.getByText(title).closest("li");

beforeEach(() => vi.clearAllMocks());

describe("events list (MEH-2430 §1)", () => {
  it("a past event says «הסתיים» and offers no cancel; a future one is unchanged", async () => {
    api.get.mockResolvedValue({
      data: [
        { id: "e1", title: "אירוע שעבר", event_date: PAST, city: "חיפה", is_active: true },
        { id: "e2", title: "אירוע שיבוא", event_date: FUTURE, city: "חיפה", is_active: true },
      ],
    });
    renderIntl(<EventsPage />);
    await waitFor(() => screen.getByText("אירוע שעבר"));

    const past = within(rowOf("אירוע שעבר"));
    expect(past.getByText(P.manage_events.badge_past)).toBeInTheDocument();
    expect(past.queryByText(P.manage_events.badge_active)).not.toBeInTheDocument();
    expect(past.queryByText(P.manage_events.action_cancel)).not.toBeInTheDocument();

    const future = within(rowOf("אירוע שיבוא"));
    expect(future.getByText(P.manage_events.badge_active)).toBeInTheDocument();
    expect(future.getByText(P.manage_events.action_cancel)).toBeInTheDocument();
  });

  // The boundary: an event dated today (Israel calendar) is still on, so a
  // `<=` in place of `<` turns this red.
  it("an event dated today is not «הסתיים»", async () => {
    api.get.mockResolvedValue({
      data: [{ id: "e3", title: "אירוע היום", event_date: israelToday(), city: "חיפה", is_active: true }],
    });
    renderIntl(<EventsPage />);
    await waitFor(() => screen.getByText("אירוע היום"));

    const today = within(rowOf("אירוע היום"));
    expect(today.queryByText(P.manage_events.badge_past)).not.toBeInTheDocument();
    expect(today.getByText(P.manage_events.action_cancel)).toBeInTheDocument();
  });
});

describe("experiences list (MEH-2430 §1)", () => {
  it("a past approved experience says «הסתיימה» and offers no cancel", async () => {
    api.get.mockResolvedValue({
      data: [
        { id: "x1", title: "סדנה שעברה", event_date: PAST, city: "חיפה", status: "approved", is_active: true },
        { id: "x2", title: "סדנה שתבוא", event_date: FUTURE, city: "חיפה", status: "approved", is_active: true },
      ],
    });
    renderIntl(<ExperiencesPage />);
    await waitFor(() => screen.getByText("סדנה שעברה"));

    const past = within(rowOf("סדנה שעברה"));
    expect(past.getByText(P.manage_experiences.badge_past)).toBeInTheDocument();
    expect(past.queryByText(P.manage_experiences.action_cancel)).not.toBeInTheDocument();

    const future = within(rowOf("סדנה שתבוא"));
    expect(future.queryByText(P.manage_experiences.badge_past)).not.toBeInTheDocument();
    expect(future.getByText(P.manage_experiences.action_cancel)).toBeInTheDocument();
  });
});

describe("group buys list (MEH-2430 §2)", () => {
  it("an open group buy past its deadline says «המועד עבר»", async () => {
    const gb = (id, title, deadline) => ({
      id, title, product_name: "קמח", producer_id: "p1", status: "open", deadline,
      price_per_unit_group: 13, price_per_unit_regular: 18, commits_count: 1, min_participants: 2,
      created_at: "2026-01-01T00:00:00Z",
    });
    api.get.mockImplementation((url, opts) => {
      if (url === "/producers/me/dashboard")
        return Promise.resolve({ data: { producer: { id: "p1", status: "approved", city: "חיפה" } } });
      if (url === "/producers/me/group-buys")
        return Promise.resolve({
          data: [gb("g1", "רכש שעבר", "2020-01-01T10:00:00Z"), gb("g2", "רכש פתוח", "2099-01-01T10:00:00Z")],
        });
      return Promise.resolve({ data: [] });
    });
    renderIntl(<GroupBuysPage />);
    await waitFor(() => screen.getByText("רכש שעבר"));

    const G = he.group_buys.dashboard;
    const pastCard = screen.getByText("רכש שעבר").closest('[data-testid="manage-group-buy-card"]');
    expect(within(pastCard).getByText(G.status_deadline_passed)).toBeInTheDocument();
    expect(within(pastCard).queryByText(G.status.open)).not.toBeInTheDocument();
    const openCard = screen.getByText("רכש פתוח").closest('[data-testid="manage-group-buy-card"]');
    expect(within(openCard).getByText(G.status.open)).toBeInTheDocument();
  });

  // MEH-2437: the list is the business's own, in one call — the page used to
  // fetch the whole site's group buys once per status and filter here.
  it("reads its own list from /producers/me/group-buys, never the site-wide /group-buys", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/producers/me/dashboard")
        return Promise.resolve({ data: { producer: { id: "p1", status: "approved", city: "חיפה" } } });
      if (url === "/producers/me/group-buys")
        return Promise.resolve({
          data: [{
            id: "g9", title: "רכש שלי", product_name: "קמח", producer_id: "p1", status: "funded",
            deadline: "2099-01-01T10:00:00Z", price_per_unit_group: 13, price_per_unit_regular: 18,
            commits_count: 2, min_participants: 2, created_at: "2026-01-01T00:00:00Z",
          }],
        });
      return Promise.resolve({ data: [] });
    });
    renderIntl(<GroupBuysPage />);
    await waitFor(() => screen.getByText("רכש שלי"));
    const urls = api.get.mock.calls.map(([url]) => url);
    expect(urls.filter((u) => u === "/producers/me/group-buys")).toHaveLength(1);
    expect(urls).not.toContain("/group-buys");
  });
});

describe("overview KPI strip (MEH-2430 §4, §17)", () => {
  it("no «עסק השבוע» badge and no conversion line, even when the old eligibility held", async () => {
    const w = (n) => ({ last_7d: n, last_30d: n, total: n });
    api.get.mockImplementation((url) => {
      if (url === "/producers/me/dashboard")
        return Promise.resolve({
          data: { producer: { id: "p1", name: "עסק", status: "approved", availability_state: "accepting_orders" } },
        });
      if (url === "/producers/me/analytics")
        return Promise.resolve({
          data: {
            profile_views: w(50), whatsapp_clicks: w(3), contact_clicks: w(1),
            average_rating: 4.7, total_reviews: 3,
            // The exact condition that used to show the badge.
            rank_in_city: 1, profile_strength: 95, conversion_rate: 6,
          },
        });
      return Promise.resolve({ data: null });
    });
    renderIntl(<OverviewPage />);
    await screen.findByTestId("overview-kpi-strip");

    expect(screen.queryByText(/עסק השבוע/)).not.toBeInTheDocument();
    expect(screen.queryByText(/לכל 100 מבקרות/)).not.toBeInTheDocument();
    expect(screen.getByText(P.analytics.kpi.contact_clicks)).toBeInTheDocument();
  });
});
