/**
 * MEH-3103 — «הלינק שלי» copy feedback on the dashboard home.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { showToast } from "@/lib/toast";
import ProducerDashboardPage from "@/app/[locale]/producer/dashboard/page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
// A stable user object, as the real AuthProvider gives: the tools page's fetch
// effect depends on `user`, and a fresh object per render would refetch forever.
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
vi.mock("@/components/StoryCardCanvas", () => ({ default: () => <div data-testid="story-card-canvas-stub" /> }));
vi.mock("@/components/ReviewCardCanvas", () => ({ default: () => <div data-testid="review-card-canvas-stub" /> }));
vi.mock("@/components/producer/RequestReviewCard", () => ({ default: () => null }));
vi.mock("@/components/InfoTooltip", () => ({ default: () => null }));
vi.mock("@/components/PhoneVerifyCard", () => ({ default: () => null }));
vi.mock("@/components/ProfileCompletenessCard", () => ({ default: () => null }));
vi.mock("@/lib/holidays", () => ({ getUpcomingHoliday: () => null }));
vi.mock("@/components/HolidayIcon", () => ({ default: () => null }));

const { stateRef } = vi.hoisted(() => ({ stateRef: { current: { status: "approved", complete: true, kind: "producer", profileFails: false } } }));

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
        if (stateRef.current.profileFails) return Promise.reject(new Error("network"));
        return Promise.resolve({
          data: { id: 7, name: "חוות ערוגות נועם", slug: "arugot-noam", status: stateRef.current.status, kind: stateRef.current.kind, images: [], categories: [] },
        });
      }
      return Promise.resolve({ data: [] });
    }),
    post: vi.fn(() => Promise.resolve({})),
    put: vi.fn(() => Promise.resolve({})),
  },
}));

beforeEach(() => {
  stateRef.current = { status: "approved", complete: true, kind: "producer", profileFails: false };
});


// MEH-3103: the «הלינק שלי» copy had no catch — a failed copy did nothing
// (a dead button and an unhandled rejection). It now says so. Mocks: the same
// real response shapes as DashboardSharePlacement.test.jsx.
describe("home — «הלינק שלי» copy feedback (MEH-3103)", () => {
  const setClipboard = (value) =>
    Object.defineProperty(navigator, "clipboard", { value, configurable: true });
  let errorSpy;
  beforeEach(() => {
    errorSpy = vi.spyOn(showToast, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
    delete navigator.clipboard;
  });

  it("copy succeeds → the label flips to «הועתק», the link is on the clipboard, no error", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    render(<ProducerDashboardPage />);
    fireEvent.click(await screen.findByTestId("vanity-copy"));
    await waitFor(() => expect(screen.getByTestId("vanity-copy").textContent).toBe("copied"));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/p/arugot-noam"));
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("copy fails → the share_error toast, and the label stays «העתק»", async () => {
    setClipboard(undefined);
    render(<ProducerDashboardPage />);
    fireEvent.click(await screen.findByTestId("vanity-copy"));
    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith("share_error"));
    expect(screen.getByTestId("vanity-copy").textContent).toBe("copy_cta");
  });
});
