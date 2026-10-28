import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import AdminHomePage from "@/app/[locale]/admin/page";
import { AdminDashboardProvider } from "@/app/[locale]/admin/dashboard-data";

// MEH-2399: the home reads the layout's shared /admin/dashboard fetch, so it
// renders under the same provider the layout mounts.
const AdminHome = () => (
  <AdminDashboardProvider>
    <AdminHomePage />
  </AdminDashboardProvider>
);

// MEH-2359: /admin is «מה מחכה לטיפול» — pending businesses + the secondary
// queues that have items. This file used to pin the group-buys stat card
// (MEH-1267); that card, and every other stat, left the home page.

const DASHBOARD = {
  stats: {
    total_producers: 12,
    pending_producers: 2,
    total_users: 40,
    total_group_buys: 7,
    open_reports: 0,
    pending_kashrut_requests: 3,
    pending_category_requests: 0,
    pending_name_change_requests: 1,
    undelivered_whatsapp_7d: 0,
    pending_experiences: 2,
    pending_recipes: 1,
    experiences_awaiting_review: 0,
    recipes_awaiting_review: 0,
  },
  pending_producers: [
    { id: "p1", name: "חוות האגס", city: "כפר סבא" },
    { id: "p2", name: "מאפיית הכפר", city: "בנימינה" },
  ],
};

const apiMock = vi.hoisted(() => ({
  get: vi.fn(() => Promise.resolve({ data: DASHBOARD })),
  post: vi.fn(() => Promise.resolve({ data: {} })),
}));
vi.mock("@/lib/api", () => ({ default: apiMock }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...p }) => <a href={typeof href === "string" ? href : "#"} {...p}>{children}</a>,
}));

vi.mock("next-intl", () => {
  const resolve = (fullKey, values) => {
    let s = fullKey;
    for (const [k, v] of Object.entries(values || {})) s = s.replaceAll(`{${k}}`, v);
    return s;
  };
  return {
    useTranslations: (scope) => (key, values = {}) =>
      resolve(scope ? `${scope}.${key}` : key, values),
    useLocale: () => "he",
  };
});

describe("AdminHome — «מה מחכה לטיפול» (MEH-2359)", () => {
  beforeEach(() => {
    apiMock.get.mockClear();
    apiMock.get.mockImplementation(() => Promise.resolve({ data: DASHBOARD }));
  });

  it("lists the pending businesses with a link to each edit page", async () => {
    render(<AdminHome />);
    expect(await screen.findByText("חוות האגס")).toBeInTheDocument();
    expect(screen.getByText("מאפיית הכפר")).toBeInTheDocument();
    const checks = screen.getAllByText("admin.dashboard.pending_panel.check");
    expect(checks.map((a) => a.getAttribute("href"))).toEqual([
      "/admin/producers/p1/edit",
      "/admin/producers/p2/edit",
    ]);
  });

  it("shows ONLY the secondary queues whose count is > 0, with the count", async () => {
    render(<AdminHome />);
    await screen.findByText("חוות האגס");
    const queues = screen.getByTestId("admin-home-queues");
    const links = Array.from(queues.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    // kashrut (3) and name changes (1) are busy; reports/category/whatsapp/
    // experiences/recipes are 0 → absent, not rendered-with-zero. The
    // experiences/recipes rows read the admin's-turn keys: the owner's-turn
    // aggregates (pending_experiences 2 / pending_recipes 1) must NOT surface.
    expect(links).toEqual(["/admin/kashrut", "/admin/name-change-requests"]);
    expect(queues).toHaveTextContent("3");
    expect(queues).toHaveTextContent("1");
    expect(screen.queryByText("admin.dashboard.queues.all_clear")).not.toBeInTheDocument();
  });

  it("renders no stat cards, charts or server health — those moved to analytics", async () => {
    render(<AdminHome />);
    await screen.findByText("חוות האגס");
    expect(screen.queryByText("קבוצות רכש")).not.toBeInTheDocument();
    expect(screen.queryByText(/dashboard\.(stats|health|dau|top_cities|chart|weekly|activity)\./)).not.toBeInTheDocument();
    expect(document.querySelector("svg polyline")).toBeNull();
    expect(screen.getByText("admin.dashboard.analytics_link").getAttribute("href")).toBe("/admin/analytics");
  });

  it("0 pending + 0 busy queues → both empty lines, no yellow count", async () => {
    apiMock.get.mockImplementation(() =>
      Promise.resolve({
        data: {
          stats: { ...DASHBOARD.stats, pending_producers: 0, pending_kashrut_requests: 0, pending_name_change_requests: 0 },
          pending_producers: [],
        },
      }),
    );
    render(<AdminHome />);
    expect(await screen.findByText("admin.dashboard.pending_panel.empty")).toBeInTheDocument();
    expect(screen.getByText("admin.dashboard.queues.all_clear")).toBeInTheDocument();
    expect(screen.getByTestId("admin-home-queues").querySelectorAll("a")).toHaveLength(0);
    expect(screen.getByTestId("admin-home-pending").querySelector(".bg-yellow-400")).toBeNull();
    expect(screen.getByTestId("admin-home-pending").className).not.toMatch(/border-yellow/);
  });

  it("a stats payload without the per-queue keys is UNKNOWN, not all-clear (MEH-2096)", async () => {
    // A frontend deployed ahead of its backend: only the pre-MEH-2359 keys.
    apiMock.get.mockImplementation(() =>
      Promise.resolve({
        data: { stats: { total_producers: 12, pending_producers: 0, open_reports: 0 }, pending_producers: [] },
      }),
    );
    render(<AdminHome />);
    expect(await screen.findByText("admin.dashboard.pending_panel.empty")).toBeInTheDocument();
    expect(screen.queryByText("admin.dashboard.queues.all_clear")).not.toBeInTheDocument();
    expect(screen.getByTestId("admin-home-queues-unknown")).toHaveTextContent("admin.common.error_loading");
    expect(screen.getByTestId("admin-home-queues").querySelectorAll("a")).toHaveLength(0);
  });

  it("a missing pending_producers count is UNKNOWN in the pending panel too, not «אין ממתינים» (R4-1)", async () => {
    // The count key is absent while the preview list is empty: the panel
    // must say the count could not be read, not that nothing is waiting.
    apiMock.get.mockImplementation(() =>
      Promise.resolve({ data: { stats: { total_producers: 12, open_reports: 0 }, pending_producers: [] } }),
    );
    render(<AdminHome />);
    expect(await screen.findByTestId("admin-home-pending-unknown")).toHaveTextContent("admin.common.error_loading");
    expect(screen.queryByText("admin.dashboard.pending_panel.empty")).not.toBeInTheDocument();
    expect(screen.getByTestId("admin-home-pending").querySelector(".bg-yellow-400")).toBeNull();
  });

  it("a busy queue next to a missing key shows the rows AND the unknown line (R4-2)", async () => {
    // kashrut known-busy, recipes_awaiting_review absent: the known row is
    // listed and the block still says some counts could not be read.
    const { recipes_awaiting_review: _dropped, ...rest } = DASHBOARD.stats;
    apiMock.get.mockImplementation(() =>
      Promise.resolve({ data: { stats: { ...rest, pending_kashrut_requests: 3, pending_name_change_requests: 0 }, pending_producers: [] } }),
    );
    render(<AdminHome />);
    const queues = await screen.findByTestId("admin-home-queues");
    await waitFor(() => expect(queues.querySelectorAll("a")).toHaveLength(1));
    expect(queues.querySelector("a").getAttribute("href")).toBe("/admin/kashrut");
    expect(screen.getByTestId("admin-home-queues-unknown")).toHaveTextContent("admin.common.error_loading");
    expect(screen.queryByText("admin.dashboard.queues.all_clear")).not.toBeInTheDocument();
  });

  it("says how many more are waiting when the preview is shorter than the count", async () => {
    apiMock.get.mockImplementation(() =>
      Promise.resolve({ data: { stats: { ...DASHBOARD.stats, pending_producers: 7 }, pending_producers: DASHBOARD.pending_producers } }),
    );
    render(<AdminHome />);
    expect(await screen.findByText("admin.dashboard.pending_panel.more")).toBeInTheDocument();
  });
});
