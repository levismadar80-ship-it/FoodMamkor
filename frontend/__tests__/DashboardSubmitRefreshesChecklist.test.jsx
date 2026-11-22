/**
 * MEH-2926 — after «שליחה לבדיקה» the completeness card follows the new state.
 * onSubmitted used to flip only `data.producer.status`, while the card reads
 * `profile`, so «השלב הבא: …» stayed on screen after the page was sent.
 * Mocks copied from DashboardOrderOneChecklist.test.jsx.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProducerDashboardPage from "@/app/[locale]/producer/dashboard/page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
// One user object for the whole test: a fresh object per render re-runs the
// page's [user] fetch effects on every render, and the refetch would put the
// server's old status back over the one this test is checking.
const AUTH = { user: { id: 1, name: "דנה", role: "producer" }, loading: false };
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
vi.mock("@/components/PhoneVerifyCard", () => ({ default: () => <div data-testid="phone-verify-stub" /> }));
vi.mock("@/components/InfoTooltip", () => ({ default: () => null }));
vi.mock("@/lib/holidays", () => ({ getUpcomingHoliday: () => null }));
vi.mock("@/components/HolidayIcon", () => ({ default: () => null }));
// The submit itself (confirm step, POST, toast) is DraftSubmitBanner's and has
// its own tests; here a stub calls onSubmitted, which is what a 200 does.
vi.mock("@/components/producer/DraftSubmitBanner", () => ({
  default: ({ onSubmitted }) => (
    <button type="button" data-testid="stub-submit" onClick={() => onSubmitted?.()}>
      submit
    </button>
  ),
}));

const { stateRef } = vi.hoisted(() => ({ stateRef: { current: {} } }));

// The submit gate the actions read (DraftSubmitBanner → submissionMissingItems).
// `ready` = nothing missing; otherwise phone verification is the missing item.
vi.mock("@/lib/submission-gate", async (orig) => {
  const real = await orig();
  return {
    ...real,
    submissionMissingItems: () => (stateRef.current.ready ? [] : [real.MISSING_PHONE_VERIFIED]),
  };
});

vi.mock("@/lib/producer-completeness", async (orig) => {
  const real = await orig();
  return {
    ...real,
    producerCompleteness: (p) => (stateRef.current.complete ? { missing: [], priority: "green" } : real.producerCompleteness(p)),
  };
});

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn((url) => {
      const { status, kind } = stateRef.current;
      if (url === "/producers/me/dashboard") {
        return Promise.resolve({ data: { producer: { id: "7", name: "חוות ערוגות נועם", availability_state: "accepting_orders", vacation_until: null, status, plan: "free" } } });
      }
      if (url === "/producers/me/analytics") {
        return Promise.resolve({ data: { profile_views: { total: 3, last_7d: 3 }, whatsapp_clicks: { total: 1, last_7d: 1 }, contact_clicks: { total: 0, last_7d: 0 }, average_rating: 0, total_reviews: 0 } });
      }
      if (url === "/producers/me") {
        return Promise.resolve({ data: { id: 7, name: "חוות ערוגות נועם", slug: "arugot-noam", status, kind, phone_verified: false, images: [], categories: [], locations: [], products: [] } });
      }
      return Promise.resolve({ data: [] });
    }),
    post: vi.fn(() => Promise.resolve({})),
    put: vi.fn(() => Promise.resolve({})),
  },
}));


describe("after submit-for-review (MEH-2926)", () => {
  beforeEach(() => {
    stateRef.current = { status: "draft", kind: "producer", complete: false, ready: true };
  });

  // MEH-3659: draft = the submit-gate checklist; after submit the same card
  // turns into «לשפר את העמוד» (improve mode) with no reload.
  it("the card switches from the draft checklist to «לשפר את העמוד» and the pending banner takes over", async () => {
    render(<ProducerDashboardPage />);
    const card = await screen.findByTestId("profile-completeness-card");
    expect(card.dataset.mode).toBe("draft");
    fireEvent.click(screen.getByTestId("stub-submit"));
    await screen.findByTestId("status-pending-banner");
    // The checklist stays: she can keep improving the page while we review.
    expect(screen.getByTestId("profile-completeness-card").dataset.mode).toBe("improve");
  });
});
