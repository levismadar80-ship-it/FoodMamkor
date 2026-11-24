/**
 * MEH-3817 — the owner dashboard home paints ONCE, when its four reads
 * (/producers/me/dashboard, /producers/me, /producers/me/analytics,
 * /producers/me/order-settings) have each answered. Painting on the first answer and growing as the others landed
 * moved the cards by up to 0.6 CLS on a throttled phone (measured 24/11).
 *
 * Each read is a promise this test resolves by hand, so the order is the
 * test's, not the mock's.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import ProducerDashboardPage from "@/app/[locale]/producer/dashboard/page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
const { AUTH } = vi.hoisted(() => ({ AUTH: { user: { id: 1, name: "דנה", role: "producer" }, loading: false } }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => AUTH }));
vi.mock("next-intl", () => {
  const t = (key) => key;
  t.rich = (key) => key;
  return { useLocale: () => "he", useTranslations: () => t };
});
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/components/InfoTooltip", () => ({ default: () => null }));
vi.mock("@/components/PhoneVerifyCard", () => ({ default: () => null }));
vi.mock("@/components/ProfileCompletenessCard", () => ({ default: () => null }));
vi.mock("@/lib/holidays", () => ({ getUpcomingHoliday: () => null }));
vi.mock("@/components/HolidayIcon", () => ({ default: () => null }));
vi.mock("@/lib/producer-completeness", () => ({ producerCompleteness: () => ({ missing: [], priority: "green" }) }));

const { pending } = vi.hoisted(() => ({ pending: { current: {} } }));
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(
      (url) =>
        new Promise((resolve, reject) => {
          (pending.current[url] ||= []).push({ resolve, reject });
        }),
    ),
    post: vi.fn(() => Promise.resolve({})),
    put: vi.fn(() => Promise.resolve({})),
  },
}));

const DASHBOARD = {
  producer: { id: "7", name: "חוות ערוגות נועם", availability_state: "accepting_orders", vacation_until: null, status: "approved", plan: "free" },
  favorites_count: 0,
  whatsapp_clicks_week: 0,
};
const PROFILE = { id: 7, name: "חוות ערוגות נועם", slug: "arugot-noam", status: "approved", kind: "producer", images: [], categories: [] };

/** Answer the oldest open call to `url`. */
async function answer(url, outcome) {
  const call = pending.current[url]?.shift();
  if (!call) throw new Error(`no open call to ${url}`);
  await act(async () => {
    if (outcome instanceof Error) call.reject(outcome);
    else call.resolve({ data: outcome });
  });
}

beforeEach(() => {
  pending.current = {};
});

describe("owner dashboard home paints once (MEH-3817)", () => {
  it("stays on the loading line until all four reads answered, then paints the whole page", async () => {
    render(<ProducerDashboardPage />);
    await answer("/producers/me/dashboard", DASHBOARD);
    expect(screen.queryByTestId("producer-overview")).toBeNull();
    expect(screen.getByText("loading_data")).toBeTruthy();

    await answer("/producers/me", PROFILE);
    expect(screen.queryByTestId("producer-overview")).toBeNull();

    await answer("/producers/me/analytics", {});
    expect(screen.queryByTestId("producer-overview")).toBeNull();

    // The order settings decide the top slot's card, so they gate the paint too.
    await answer("/producers/me/order-settings", Object.assign(new Error("404"), { response: { status: 404 } }));
    expect(screen.getByTestId("producer-overview")).toBeTruthy();
    // What the profile brings is there in the first paint, not added after it.
    expect(screen.getByTestId("view-public-link").getAttribute("href")).toBe("/arugot-noam");
  });

  it("a failed read counts as answered: its error card is in the first paint", async () => {
    render(<ProducerDashboardPage />);
    await answer("/producers/me/analytics", new Error("network"));
    await answer("/producers/me", PROFILE);
    await answer("/producers/me/order-settings", new Error("network"));
    expect(screen.queryByTestId("producer-overview")).toBeNull();
    await answer("/producers/me/dashboard", DASHBOARD);
    expect(screen.getByTestId("producer-overview")).toBeTruthy();
    expect(screen.getByTestId("dashboard-analytics-error")).toBeTruthy();
  });

  it("retrying a failed section keeps the page up instead of going back to the loading line", async () => {
    render(<ProducerDashboardPage />);
    await answer("/producers/me/dashboard", DASHBOARD);
    await answer("/producers/me", PROFILE);
    await answer("/producers/me/analytics", new Error("network"));
    await answer("/producers/me/order-settings", new Error("network"));
    const retry = screen.getByTestId("dashboard-analytics-error").querySelector("button");
    await act(async () => {
      fireEvent.click(retry);
    });
    expect(screen.getByTestId("producer-overview")).toBeTruthy();
    expect(screen.queryByText("loading_data")).toBeNull();
  });
});
