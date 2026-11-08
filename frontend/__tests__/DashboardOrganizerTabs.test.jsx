/**
 * MEH-2460 — the dashboard tab set follows producer_kind from /auth/me.
 * Business: overview / edit / insights / tools + "view page".
 * Organizer (ADR-036): overview / edit / «האירועים שלכם» — no insights or
 * seller tools, and no "view page" link (/producer/{id} is a business page;
 * the organizer page arrives in MEH-2461).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";

const authState = { user: null };
const nav = { pathname: "/producer/dashboard" };
const logout = vi.fn();
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: authState.user, loading: false, logout }),
}));
vi.mock("next-intl", () => ({ useTranslations: (scope) => (key) => `${scope}.${key}` }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => nav.pathname,
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));

import DashboardLayout from "@/app/[locale]/producer/dashboard/DashboardLayoutClient";

const tabKeys = () =>
  screen
    .getAllByTestId(/^dashboard-tab-/)
    .map((el) => el.getAttribute("data-testid").replace("dashboard-tab-", ""));

beforeEach(() => {
  authState.user = null;
  nav.pathname = "/producer/dashboard";
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

// MEH-2728: logout lives once, at the bottom of «סקירה», in a quiet colour —
// not under every working screen in red.
describe("MEH-2728 logout only on the overview", () => {
  it("is absent from a working screen (edit)", () => {
    authState.user = { role: "producer", producer_id: "p-1" };
    nav.pathname = "/producer/dashboard/edit";
    render(<DashboardLayout><div /></DashboardLayout>);
    expect(screen.queryByTestId("dashboard-mobile-logout")).toBeNull();
  });

  it("is absent from a tools spoke (rescue)", () => {
    authState.user = { role: "producer", producer_id: "p-1" };
    nav.pathname = "/producer/dashboard/rescue";
    render(<DashboardLayout><div /></DashboardLayout>);
    expect(screen.queryByTestId("dashboard-mobile-logout")).toBeNull();
  });

  it("is not red on the overview", () => {
    authState.user = { role: "producer", producer_id: "p-1" };
    render(<DashboardLayout><div /></DashboardLayout>);
    expect(screen.getByTestId("dashboard-mobile-logout").className).not.toContain("text-error");
  });
});

// MEH-2728: a screen opened from «כלים» keeps «כלים» lit, so the owner can see
// where she is and tap back.
describe("MEH-2728 the tools tab stays active on its spokes", () => {
  for (const spoke of ["rescue", "group-buys", "events", "experiences", "recipes", "events/new"]) {
    it(`/producer/dashboard/${spoke}`, () => {
      authState.user = { role: "producer", producer_id: "p-1" };
      nav.pathname = `/producer/dashboard/${spoke}`;
      render(<DashboardLayout><div /></DashboardLayout>);
      expect(screen.getByTestId("dashboard-tab-tools").getAttribute("aria-current")).toBe("page");
      expect(screen.getByTestId("dashboard-tab-overview").getAttribute("aria-current")).toBeNull();
    });
  }

  // Derived, not listed: every screen the «כלים» page links to must keep the
  // tab lit, so a new tool card without an `also` entry goes red here.
  it("every spoke linked from tools/page.js lights the tools tab", () => {
    const src = readFileSync(
      path.resolve(__dirname, "../app/[locale]/producer/dashboard/tools/page.js"),
      "utf8",
    );
    const spokes = [...src.matchAll(/href="(\/producer\/dashboard\/[a-z0-9/-]+)"/g)].map((m) => m[1]);
    expect(spokes.length).toBeGreaterThanOrEqual(5);
    authState.user = { role: "producer", producer_id: "p-1" };
    for (const spoke of spokes) {
      nav.pathname = spoke;
      const { unmount } = render(<DashboardLayout><div /></DashboardLayout>);
      expect(
        screen.getByTestId("dashboard-tab-tools").getAttribute("aria-current"),
        spoke,
      ).toBe("page");
      unmount();
    }
  });

  it("an organizer's events tab is still the active one on /events", () => {
    authState.user = { role: "producer", producer_id: "p-2", producer_kind: "organizer" };
    nav.pathname = "/producer/dashboard/events";
    render(<DashboardLayout><div /></DashboardLayout>);
    expect(screen.getByTestId("dashboard-tab-organizer_events").getAttribute("aria-current")).toBe("page");
  });

  it("the edit tab is not lit by the tools spokes", () => {
    authState.user = { role: "producer", producer_id: "p-1" };
    nav.pathname = "/producer/dashboard/rescue";
    render(<DashboardLayout><div /></DashboardLayout>);
    expect(screen.getByTestId("dashboard-tab-edit").getAttribute("aria-current")).toBeNull();
  });
});

// MEH-2728: the tab bar sticks BELOW the site's sticky header (whose live height
// Header.jsx publishes as --chrome-top), not at top-0 where the header covers it.
describe("MEH-2728 the tab bar sits under the sticky header", () => {
  it("uses --chrome-top, not top-0", () => {
    authState.user = { role: "producer", producer_id: "p-1" };
    render(<DashboardLayout><div /></DashboardLayout>);
    const navEl = screen.getByRole("navigation");
    expect(navEl.className).toContain("--chrome-top");
    expect(navEl.className.split(/\s+/)).not.toContain("top-0");
  });
});
