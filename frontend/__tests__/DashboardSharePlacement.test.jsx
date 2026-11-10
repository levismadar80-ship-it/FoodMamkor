/**
 * MEH-2880 + MEH-2882 PR 1 — the share surfaces, against the REAL response
 * shapes: GET /producers/me/dashboard has no `slug`; GET /producers/me does.
 *
 * Home (daily): «לצפייה בעמוד שלך» + the short «הלינק שלי» card render from
 * the profile's slug. The QR card and «ערכת שיתוף» are NOT on home.
 * Tools («כלים» → «שיתוף», one-time / occasional): the QR card and «ערכת
 * שיתוף», approved business only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ProducerDashboardPage from "@/app/[locale]/producer/dashboard/page";
import ToolsPage from "@/app/[locale]/producer/dashboard/tools/page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: 1, name: "דנה", role: "producer" }, loading: false }),
}));
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
vi.mock("@/components/StoryCardCanvas", () => ({ default: () => <div data-testid="story-card-canvas-stub" /> }));
vi.mock("@/components/ReviewCardCanvas", () => ({ default: () => <div data-testid="review-card-canvas-stub" /> }));
vi.mock("@/components/producer/RequestReviewCard", () => ({ default: () => null }));
vi.mock("@/components/InfoTooltip", () => ({ default: () => null }));
vi.mock("@/components/PhoneVerifyCard", () => ({ default: () => null }));
vi.mock("@/components/ProfileCompletenessCard", () => ({ default: () => null }));
vi.mock("@/lib/holidays", () => ({ getUpcomingHoliday: () => null }));
vi.mock("@/components/HolidayIcon", () => ({ default: () => null }));

const { stateRef } = vi.hoisted(() => ({ stateRef: { current: { status: "approved", complete: true } } }));

vi.mock("@/lib/producer-completeness", () => ({
  producerCompleteness: () => ({ missing: stateRef.current.complete ? [] : ["city"], priority: "green" }),
}));

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn((url) => {
      if (url === "/producers/me/dashboard") {
        // The real payload (producer_me.py): no slug, no images, no categories.
        return Promise.resolve({
          data: {
            producer: { id: "7", name: "חוות ערוגות נועם", availability_state: "accepting_orders", vacation_until: null, status: stateRef.current.status, plan: "free" },
            favorites_count: 0,
            whatsapp_clicks_week: 0,
          },
        });
      }
      if (url === "/producers/me/analytics") return Promise.resolve({ data: null });
      if (url === "/producers/me") {
        return Promise.resolve({
          data: { id: 7, name: "חוות ערוגות נועם", slug: "arugot-noam", status: stateRef.current.status, kind: "producer", images: [], categories: [] },
        });
      }
      return Promise.resolve({ data: [] });
    }),
    post: vi.fn(() => Promise.resolve({})),
    put: vi.fn(() => Promise.resolve({})),
  },
}));

beforeEach(() => {
  stateRef.current = { status: "approved", complete: true };
});

describe("home — the link renders from the profile's slug (MEH-2880)", () => {
  it("an approved, complete business sees «הלינק שלי» and the view-public link, with the real dashboard payload", async () => {
    render(<ProducerDashboardPage />);
    expect(await screen.findByTestId("vanity-share")).toBeInTheDocument();
    const view = await screen.findByTestId("view-public-link");
    expect(view.getAttribute("href")).toBe("/arugot-noam");
  });

  it("the QR card and «ערכת שיתוף» are not on home (moved to «כלים» → «שיתוף»)", async () => {
    render(<ProducerDashboardPage />);
    await screen.findByTestId("vanity-share");
    expect(screen.queryByTestId("business-qr-card")).toBeNull();
    expect(screen.queryByTestId("share-kit-section")).toBeNull();
  });
});

describe("tools — «שיתוף» holds the QR card and «ערכת שיתוף» (MEH-2882 PR 1)", () => {
  it("approved + complete: the share section with the QR card and the share kit", async () => {
    render(<ToolsPage />);
    const section = await screen.findByTestId("tools-share-section");
    expect(section.getAttribute("id")).toBe("share");
    await waitFor(() => expect(section.querySelector('[data-testid="business-qr-card"]')).not.toBeNull());
    expect(section.querySelector('[data-testid="share-kit-section"]')).not.toBeNull();
  });

  it("pending: no share section (nothing to share before the page is public)", async () => {
    stateRef.current = { status: "pending", complete: true };
    render(<ToolsPage />);
    await screen.findByTestId("tools-grid");
    expect(screen.queryByTestId("tools-share-section")).toBeNull();
  });
});
