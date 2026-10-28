/**
 * MEH-2460 — the dashboard tab set follows producer_kind from /auth/me.
 * Business: overview / edit / insights / tools + "view page".
 * Organizer (ADR-036): overview / edit / «האירועים שלכם» — no insights or
 * seller tools, and no "view page" link (/producer/{id} is a business page;
 * the organizer page arrives in MEH-2461).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const authState = { user: null };
const logout = vi.fn();
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: authState.user, loading: false, logout }),
}));
vi.mock("next-intl", () => ({ useTranslations: (scope) => (key) => `${scope}.${key}` }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/producer/dashboard",
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));

import DashboardLayout from "@/app/[locale]/producer/dashboard/layout";

const tabKeys = () =>
  screen
    .getAllByTestId(/^dashboard-tab-/)
    .map((el) => el.getAttribute("data-testid").replace("dashboard-tab-", ""));

beforeEach(() => {
  authState.user = null;
});

describe("MEH-2460 dashboard tabs by producer_kind", () => {
  it("business owner: the four business tabs + view page", () => {
    authState.user = { role: "producer", producer_id: "p-1", producer_kind: "producer" };
    render(<DashboardLayout><div /></DashboardLayout>);
    expect(tabKeys()).toEqual(["overview", "edit", "insights", "tools"]);
    expect(screen.getByTestId("dashboard-view-page")).toBeInTheDocument();
  });

  it("owner with no producer_kind (pre-migration /auth/me) is treated as a business", () => {
    authState.user = { role: "producer", producer_id: "p-1" };
    render(<DashboardLayout><div /></DashboardLayout>);
    expect(tabKeys()).toEqual(["overview", "edit", "insights", "tools"]);
  });

  it("organizer: overview / edit / events — no insights, tools or view page", () => {
    authState.user = { role: "producer", producer_id: "p-2", producer_kind: "organizer" };
    render(<DashboardLayout><div /></DashboardLayout>);
    expect(tabKeys()).toEqual(["overview", "edit", "organizer_events"]);
    const events = screen.getByTestId("dashboard-tab-organizer_events");
    expect(events.getAttribute("href")).toBe("/producer/dashboard/events");
    expect(events.textContent).toContain("dashboard.producer.nav.organizer_events");
    expect(screen.queryByTestId("dashboard-view-page")).not.toBeInTheDocument();
  });
});

// MEH-2490: below md the header avatar menu is hidden and the consumer pill is
// gated off the dashboard, so the layout carries its own «התנתקות».
describe("MEH-2490 logout on the mobile dashboard", () => {
  it("renders a md:hidden logout button with the shared key, and it logs out", () => {
    logout.mockClear();
    authState.user = { role: "producer", producer_id: "p-1" };
    render(<DashboardLayout><div /></DashboardLayout>);
    const btn = screen.getByTestId("dashboard-mobile-logout");
    expect(btn).toHaveTextContent("account.menu.logout");
    expect(btn.parentElement.className).toContain("md:hidden");
    fireEvent.click(btn);
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("an organizer gets it too", () => {
    authState.user = { role: "producer", producer_id: "p-2", producer_kind: "organizer" };
    render(<DashboardLayout><div /></DashboardLayout>);
    expect(screen.getByTestId("dashboard-mobile-logout")).toBeInTheDocument();
  });

  it("the access-denied state has no logout button", () => {
    authState.user = { role: "consumer" };
    render(<DashboardLayout><div /></DashboardLayout>);
    expect(screen.queryByTestId("dashboard-mobile-logout")).toBeNull();
  });
});
