/**
 * MEH-2314 — ViewsLineChart x-axis date labels.
 *
 * The last label sat at x = W - padRight with textAnchor="middle", so its
 * right half fell outside the viewBox and was clipped; and the text was the
 * ISO tail "10-25" instead of the Israeli "25.10". Renders the full insights
 * page (same harness as InsightsZeroStates) and reads the rendered <text>
 * nodes of the x-axis, so the assertion is on what the SVG actually draws.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, waitFor } from "@testing-library/react";
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
  Link: ({ href, children, ...rest }) =>
    React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children),
}));

const zeroWindows = { last_7d: 0, last_30d: 0, total: 0 };

// 30 consecutive days ending 2026-10-25, built from date parts (no Date
// arithmetic in the fixture, so no timezone can shift a day).
function thirtyDays() {
  const days = [];
  for (let d = 26; d <= 30; d++) days.push(`2026-09-${String(d).padStart(2, "0")}`);
  for (let d = 1; d <= 25; d++) days.push(`2026-10-${String(d).padStart(2, "0")}`);
  return days.map((date, i) => ({ date, count: i % 4 }));
}

function renderWith(views_by_day) {
  api.get.mockImplementation((url) => {
    if (url === "/producers/me/analytics") {
      return Promise.resolve({
        data: {
          profile_views: zeroWindows,
          search_appearances: zeroWindows,
          whatsapp_clicks: zeroWindows,
          contact_clicks: zeroWindows,
          follower_count: 0,
          new_followers_this_week: 0,
          average_rating: 0,
          total_reviews: 0,
          views_by_day,
          top_cities: [],
        },
      });
    }
    if (url === "/producers/me") {
      return Promise.resolve({ data: { id: 1, status: "approved", slug: "meshek" } });
    }
    return Promise.resolve({ data: [] });
  });
  return render(
    React.createElement(
      NextIntlClientProvider,
      { locale: "he", messages: he, onError: () => {} },
      React.createElement(InsightsPage),
    ),
  );
}

// X-axis labels are the fontSize=10 <text> nodes; Y ticks are fontSize=9.
async function xLabels(container) {
  let nodes = [];
  await waitFor(() => {
    nodes = [...container.querySelectorAll('svg[role="img"] text[font-size="10"]')];
    expect(nodes.length).toBeGreaterThan(0);
  });
  return nodes.map((n) => ({ text: n.textContent, anchor: n.getAttribute("text-anchor") }));
}

// The page is dir="rtl" and SVG text inherits it, which swaps what
// text-anchor start/end mean. jsdom does no layout, so the anchors above are
// only correct if the chart pins its own direction — assert that it does.
function chartDirection(container) {
  return container.querySelector('svg[role="img"]').getAttribute("direction");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ViewsLineChart x-axis labels (MEH-2314)", () => {
  it("30 days: start/mid/end labels in DD.MM, anchored so none leaves the viewBox", async () => {
    const { container } = renderWith(thirtyDays());
    expect(await xLabels(container)).toEqual([
      { text: "26.09", anchor: "start" },
      { text: "11.10", anchor: "middle" },
      { text: "25.10", anchor: "end" },
    ]);
    expect(chartDirection(container)).toBe("ltr");
  });

  it("1 day: a single label, anchored so it stays inside the viewBox", async () => {
    const { container } = renderWith([{ date: "2026-10-25", count: 3 }]);
    expect(await xLabels(container)).toEqual([{ text: "25.10", anchor: "start" }]);
  });

  it("0 days: the empty-state copy, no chart", async () => {
    const { container, findByText } = renderWith([]);
    expect(
      await findByText(he.dashboard.producer.analytics.views_chart_empty),
    ).toBeInTheDocument();
    expect(container.querySelector('svg[role="img"]')).toBeNull();
  });
});
