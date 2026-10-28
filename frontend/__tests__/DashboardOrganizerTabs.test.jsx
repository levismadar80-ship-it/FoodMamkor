/**
 * MEH-2460 — the dashboard tab set follows producer_kind from /auth/me.
 * Business: overview / edit / insights / tools + "view page".
 * Organizer (ADR-036): overview / edit / «האירועים שלכם» — no insights or
 * seller tools, and no "view page" link (/producer/{id} is a business page;
 * the organizer page arrives in MEH-2461).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const authState = { user: null };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: authState.user, loading: false }),
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
