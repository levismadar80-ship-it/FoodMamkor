/**
 * MEH-2429 — owner-dashboard audit fixes (27/10 staging walk-through).
 *
 * Each case asserts what the owner SEES, and each fails on the pre-fix code:
 *   - the tab bar at 375 used `overflow-x-auto` + shrink-0 tabs, so the 4th
 *     tab was clipped and "צפייה בדף" sat off-screen; the view link had no
 *     accessible name of its own (its text was the only label).
 *   - Tools and Insights rendered no <h1>.
 *   - a location row's actions were 16px icons on the same line as a
 *     `truncate`d name.
 *   - the holiday hint's CTA linked to /producer/dashboard — the page it is on.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));
const stableUser = { id: 1, role: "producer", producer_id: "p-1" };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: stableUser, loading: false }),
}));
const stableRouter = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => stableRouter,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => stableRouter,
  usePathname: () => "/producer/dashboard",
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));
const { holidayRef } = vi.hoisted(() => ({ holidayRef: { current: null } }));
vi.mock("@/lib/holidays", () => ({ getUpcomingHoliday: () => holidayRef.current }));

import DashboardLayout from "@/app/[locale]/producer/dashboard/layout";
import ToolsPage from "@/app/[locale]/producer/dashboard/tools/page";
import InsightsPage from "@/app/[locale]/producer/dashboard/insights/page";
import OverviewPage from "@/app/[locale]/producer/dashboard/page";
import LocationsEditor from "@/app/[locale]/producer/dashboard/edit/LocationsEditor";

const nav = he.dashboard.producer.nav;
const zero = { last_7d: 0, last_30d: 0, total: 0 };
const analytics = {
  profile_views: zero,
  search_appearances: zero,
  whatsapp_clicks: zero,
  contact_clicks: zero,
  follower_count: 0,
  new_followers_this_week: 0,
  average_rating: 0,
  total_reviews: 0,
  views_by_day: [],
  top_cities: [],
  conversion_rate: 0,
  profile_strength: 0,
};

function renderIntl(ui) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {ui}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  holidayRef.current = null;
  api.get.mockImplementation((url) => {
    if (url === "/producers/me/analytics") return Promise.resolve({ data: analytics });
    if (url === "/producers/me/dashboard")
      return Promise.resolve({
        data: { producer: { id: "p-1", name: "עסק", status: "approved", slug: "esek" } },
      });
    if (url === "/producers/me") return Promise.resolve({ data: { id: "p-1", status: "approved" } });
    if (url === "/producers/me/locations")
      return Promise.resolve({
        data: [
          { id: "l1", label: "המאפייה (הסניף המרכזי)", kind: "branch", city: "זכרון יעקב", is_primary: true },
          { id: "l2", label: "איסוף — מרכז זכרון", kind: "pickup", city: "זכרון יעקב", is_primary: false },
        ],
      });
    return Promise.resolve({ data: [] });
  });
});

describe("dashboard tab bar at phone width (MEH-2429 §10)", () => {
  it("tabs share the row instead of scrolling, and the view link has its own name", () => {
    renderIntl(
      <DashboardLayout>
        <div />
      </DashboardLayout>,
    );
    const tabs = ["overview", "edit", "insights", "tools"].map((k) => screen.getByTestId(`dashboard-tab-${k}`));
    for (const tab of tabs) expect(tab.className).toMatch(/\bflex-1\b/);
    // The row itself no longer scrolls horizontally on phones.
    expect(tabs[0].parentElement.className).not.toMatch(/overflow-x-auto/);
    const view = screen.getByTestId("dashboard-view-page");
    expect(view).toHaveAttribute("aria-label", nav.view_page);
    expect(view).toHaveAttribute("href", "/producer/p-1");
  });
});

describe("page headings (MEH-2429 §14)", () => {
  it("Tools has an h1 with the tab's label", async () => {
    renderIntl(<ToolsPage />);
    expect(await screen.findByRole("heading", { level: 1, name: nav.tools })).toBeInTheDocument();
  });

  it("Insights has an h1 with the tab's label", async () => {
    renderIntl(<InsightsPage />);
    expect(await screen.findByRole("heading", { level: 1, name: nav.insights })).toBeInTheDocument();
  });
});

describe("location rows (MEH-2429 §16)", () => {
  it("names are not truncated and edit/delete are 44px targets", async () => {
    renderIntl(<LocationsEditor />);
    const name = await screen.findByText("איסוף — מרכז זכרון");
    expect(name.className).not.toMatch(/\btruncate\b/);
    const edits = screen.getAllByLabelText(he.settings.locations.edit_aria);
    const deletes = screen.getAllByLabelText(he.settings.locations.delete_aria);
    for (const b of [...edits, ...deletes]) {
      expect(b.className).toMatch(/min-h-\[44px\]/);
      expect(b.className).toMatch(/min-w-\[44px\]/);
    }
  });
});

describe("holiday hint CTA (MEH-2429 §5)", () => {
  it("goes to the products card, not back to the overview it sits on", async () => {
    holidayRef.current = { emoji: "🕎", color: "#2e6853", dashboardHint: "חנוכה מתקרבת" };
    renderIntl(<OverviewPage />);
    const cta = await screen.findByText(he.dashboard.producer.holiday_catalog_cta);
    expect(cta.closest("a")).toHaveAttribute("href", "/producer/dashboard/edit#products");
  });
});
