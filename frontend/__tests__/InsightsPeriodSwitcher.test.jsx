import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

/**
 * MEH-2570 — /producer/dashboard/insights: one period switcher
 * («7 ימים · 30 ימים · הכל») above the windowed cards, one full number per card.
 *
 * Before: every card showed last_7d / last_30d / total side by side under a
 * «7 ימים / ב-30 הימים האחרונים / סה״כ» legend, in compact notation (1.8K).
 *
 * Shown failing (MEH-1619): against origin/staging's page.js every case fails
 * (no `insights-period` group; the card shows three values and "1.8K").
 */

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: { get: apiGet } }));
// Stable objects: the page's fetch effect depends on `user` and `router`, so a
// fresh object per render would refetch forever.
const auth = { user: { role: "producer" }, loading: false };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));
const router = { push: vi.fn() };
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => router,
  Link: ({ children, href, ...p }) => <a href={href} {...p}>{children}</a>,
}));

import InsightsPage from "@/app/[locale]/producer/dashboard/insights/page";

const w = (a, b, c) => ({ last_7d: a, last_30d: b, total: c });
const analytics = {
  profile_views: w(12, 340, 1834),
  search_appearances: w(1, 2, 3),
  whatsapp_clicks: w(4, 5, 6),
  contact_clicks: w(7, 8, 9),
  follower_count: 3,
  new_followers_this_week: 1,
  average_rating: 4.5,
  total_reviews: 2,
  views_by_day: [],
  top_cities: [],
};

beforeEach(() => {
  apiGet.mockImplementation((url) =>
    Promise.resolve({ data: url === "/producers/me" ? { status: "approved", slug: "x" } : analytics }),
  );
});

function renderPage() {
  return render(
    <NextIntlClientProvider locale="he" messages={he}>
      <InsightsPage />
    </NextIntlClientProvider>,
  );
}

const firstValue = () => within(screen.getAllByTestId("windowed-card")[0]).getByTestId("windowed-value").textContent;

describe("insights period switcher (MEH-2570)", () => {
  it("has three periods, 30 days pressed by default, and one 30-day number per card", async () => {
    renderPage();
    const group = await screen.findByTestId("insights-period");
    const buttons = within(group).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["7 ימים", "30 ימים", "הכל"]);
    expect(buttons.map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "true", "false"]);
    expect(screen.getAllByTestId("windowed-value")).toHaveLength(4);
    expect(firstValue()).toBe("340");
  });

  it("switching the period changes every card, and totals are full numbers (no K)", async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId("insights-period-total"));
    expect(firstValue()).toBe("1,834");
    expect(screen.getAllByTestId("windowed-value").map((v) => v.textContent)).toEqual(["1,834", "3", "6", "9"]);
    fireEvent.click(screen.getByTestId("insights-period-last_7d"));
    expect(screen.getAllByTestId("windowed-value").map((v) => v.textContent)).toEqual(["12", "1", "4", "7"]);
    expect(screen.getByTestId("insights-period-last_7d").getAttribute("aria-pressed")).toBe("true");
  });

  it("the old three-window legend is gone", async () => {
    renderPage();
    await screen.findByTestId("insights-period");
    expect(screen.queryByText(/7 ימים \/ ב-30/)).toBeNull();
  });
});
