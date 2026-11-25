/**
 * MEH-3526 — order staff see the «הזמנות» tab and nothing else.
 *
 * Staff are not producers (role stays consumer); `/auth/me` carries
 * `staff_of`. The layout must neither show them the "not a business" denied
 * state nor any owner tab, and every other dashboard path sends them to the
 * orders. The server refuses those paths anyway (order_access.py); this is
 * the screen half.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const authState = { user: null };
const nav = { pathname: "/producer/dashboard/orders" };
const replace = vi.fn();
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: authState.user, loading: false, logout: vi.fn() }),
}));
vi.mock("next-intl", () => ({ useTranslations: (scope) => (key) => `${scope}.${key}`, useLocale: () => "he" }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => nav.pathname,
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));
const loadSettings = vi.fn(async () => ({}));
const pendingCount = vi.fn(async () => 2);
vi.mock("@/lib/product-orders", async (importOriginal) => ({
  ...(await importOriginal()),
  loadSettings: (...a) => loadSettings(...a),
  pendingCount: (...a) => pendingCount(...a),
}));

import DashboardLayout from "@/app/[locale]/producer/dashboard/DashboardLayoutClient";

const STAFF = { role: "consumer", producer_id: null, staff_of: { producer_id: "p-1", name: "מאפיית הגבעה" } };
const tabKeys = () =>
  screen.queryAllByTestId(/^dashboard-tab-/).map((el) => el.getAttribute("data-testid").replace("dashboard-tab-", ""));

beforeEach(() => {
  replace.mockClear();
  loadSettings.mockClear();
  pendingCount.mockClear();
  nav.pathname = "/producer/dashboard/orders";
});

describe("MEH-3526 the dashboard for order staff", () => {
  it("shows only the orders tab, with its counter, and no denied state", async () => {
    authState.user = STAFF;
    render(<DashboardLayout><div data-testid="child" /></DashboardLayout>);
    expect(screen.queryByTestId("access-denied")).toBeNull();
    expect(screen.getByTestId("child")).toBeInTheDocument();
    await waitFor(() => expect(tabKeys()).toEqual(["orders"]));
    expect(screen.queryByTestId("dashboard-view-page")).toBeNull();
    // The settings route is the owner's: staff never call it.
    expect(loadSettings).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId("dashboard-orders-count")).toBeInTheDocument());
  });

  for (const path of ["/producer/dashboard", "/producer/dashboard/edit", "/producer/dashboard/tools", "/producer/dashboard/orders/preview"]) {
    it(`sends staff from ${path} to the orders, rendering nothing there`, () => {
      authState.user = STAFF;
      nav.pathname = path;
      render(<DashboardLayout><div data-testid="child" /></DashboardLayout>);
      expect(replace).toHaveBeenCalledWith("/producer/dashboard/orders");
      expect(screen.queryByTestId("child")).toBeNull();
    });
  }

  it("a consumer with no staff_of still gets the denied state", () => {
    authState.user = { role: "consumer", producer_id: null, staff_of: null };
    render(<DashboardLayout><div data-testid="child" /></DashboardLayout>);
    expect(screen.getByTestId("access-denied")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("an owner keeps every tab and is never redirected", async () => {
    authState.user = { role: "producer", producer_id: "p-1", producer_kind: "producer", staff_of: null };
    nav.pathname = "/producer/dashboard/edit";
    render(<DashboardLayout><div data-testid="child" /></DashboardLayout>);
    await waitFor(() => expect(tabKeys()).toEqual(["overview", "orders", "edit", "insights", "tools"]));
    expect(replace).not.toHaveBeenCalled();
  });
});
