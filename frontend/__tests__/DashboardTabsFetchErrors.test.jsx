/**
 * MEH-1777 — a rejected fetch on the insights / tools dashboard tabs used to
 * collapse into `.catch(() => setX(null))`, and each page's loading gate
 * cannot distinguish "still in flight" from "failed" — so a real failure
 * rendered the loading string FOREVER, with no error state and no way out.
 *
 * Sibling of __tests__/DashboardSectionFetchErrors.test.jsx (MEH-1261 F2),
 * which already covers this exact class on the Overview index — this file
 * covers the two other dashboard tabs that had the same gap, unfixed by
 * that ticket because it only touched dashboard/page.js.
 *
 * These assert BEHAVIOUR at the render boundary — what the page SHOWS for a
 * given fetch outcome — not that a particular line was edited (ADR-032 §3.6).
 *
 * DISCRIMINATION: against the pre-fix `.catch(() => setData(null))` /
 * `.catch(() => setAnalytics(null))`, the "rejected" cases below render the
 * permanent loading string forever (never resolve to an error testid), so
 * they fail on the old code. The "resolved" cases pass in both worlds and
 * are the controls — they rule out "the page just always shows an error".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import InsightsPage from "@/app/[locale]/producer/dashboard/insights/page";
import ToolsPage from "@/app/[locale]/producer/dashboard/tools/page";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));
// Stable `user` reference for the same reason as the router mock below — an
// unstable object recreated on every call re-triggers the fetch effect on
// every render, flipping the error state during the assertion window.
const stableUser = { id: 1, role: "producer" };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: stableUser, loading: false }),
}));
// Stable object (not re-created per call) — an unstable router reference
// re-triggers the fetch effect on every render, which flips the error state
// on and off during the assertion window. next-intl's real useRouter() is
// referentially stable; this mock just has to not lie about that.
const stableRouter = { push: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => stableRouter,
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => stableRouter,
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

function renderPage(Page) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <Page />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Insights tab — analytics fetch failure (MEH-1777)", () => {
  it("a rejected analytics fetch shows a distinct error, never the permanent loading string", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/producers/me/analytics") return Promise.reject(new Error("network"));
      if (url === "/producers/me") return Promise.resolve({ data: { id: 1, status: "approved" } });
      return Promise.resolve({ data: [] });
    });
    renderPage(InsightsPage);

    await waitFor(() => expect(screen.getByTestId("insights-load-error")).toBeInTheDocument());
    expect(screen.getByText(he.dashboard.producer.section_errors.analytics)).toBeInTheDocument();
    // The permanent-loading regression: this string must NOT be showing once
    // the error state has resolved.
    expect(screen.queryByText(he.dashboard.producer.loading_analytics)).not.toBeInTheDocument();
  });

  it("retry re-fires the fetch and clears the error on success", async () => {
    let calls = 0;
    api.get.mockImplementation((url) => {
      if (url === "/producers/me/analytics") {
        calls += 1;
        return calls === 1 ? Promise.reject(new Error("network")) : Promise.resolve({ data: baseAnalytics });
      }
      if (url === "/producers/me") return Promise.resolve({ data: { id: 1, status: "approved" } });
      return Promise.resolve({ data: [] });
    });
    renderPage(InsightsPage);

    await waitFor(() => expect(screen.getByTestId("insights-load-error")).toBeInTheDocument());
    fireEvent.click(screen.getByText(he.dashboard.producer.section_errors.retry_cta));

    await waitFor(() => expect(screen.queryByTestId("insights-load-error")).not.toBeInTheDocument());
    expect(calls).toBe(2);
  });

  it("control: a resolved analytics fetch never shows the error state", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/producers/me/analytics") return Promise.resolve({ data: baseAnalytics });
      if (url === "/producers/me") return Promise.resolve({ data: { id: 1, status: "approved" } });
      return Promise.resolve({ data: [] });
    });
    renderPage(InsightsPage);

    await waitFor(() =>
      expect(screen.getByText(he.dashboard.producer.analytics.top_cities_title)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("insights-load-error")).not.toBeInTheDocument();
  });
});

describe("Tools tab — dashboard fetch failure (MEH-1777)", () => {
  it("a rejected dashboard fetch shows a distinct error, never the permanent loading string", async () => {
    api.get.mockImplementation(() => Promise.reject(new Error("network")));
    renderPage(ToolsPage);

    await waitFor(() => expect(screen.getByTestId("tools-load-error")).toBeInTheDocument());
    expect(screen.getByText(he.dashboard.producer.section_errors.tools)).toBeInTheDocument();
    expect(screen.queryByText(he.dashboard.producer.loading_data)).not.toBeInTheDocument();
  });

  it("retry re-fires the fetch and clears the error on success", async () => {
    let calls = 0;
    api.get.mockImplementation(() => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new Error("network"))
        : Promise.resolve({ data: { producer: { id: "p1" } } });
    });
    renderPage(ToolsPage);

    await waitFor(() => expect(screen.getByTestId("tools-load-error")).toBeInTheDocument());
    fireEvent.click(screen.getByText(he.dashboard.producer.section_errors.retry_cta));

    await waitFor(() => expect(screen.queryByTestId("tools-load-error")).not.toBeInTheDocument());
    expect(calls).toBe(2);
  });

  it("control: a resolved dashboard fetch never shows the error state", async () => {
    api.get.mockImplementation(() => Promise.resolve({ data: { producer: { id: "p1" } } }));
    renderPage(ToolsPage);

    await waitFor(() =>
      expect(screen.getByText(he.dashboard.producer.quick_links.manage_events.title)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("tools-load-error")).not.toBeInTheDocument();
  });
});
