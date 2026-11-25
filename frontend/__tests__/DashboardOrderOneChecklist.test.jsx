/**
 * MEH-2883 (MEH-2882 PR 2) — placement on the dashboard home:
 * - approved + complete: the «מצב נוכחי» switch comes right after the
 *   greeting, before the now-and-then rows (MEH-3767: «הלינק שלי» moved to
 *   «שיתוף»; the help line is the last row the switch must precede);
 * - a business in draft sees ONE setup checklist: the completeness card, with
 *   the submit actions at its foot — not the draft banner stacked above it;
 * - an organizer in draft keeps its own draft banner (ADR-036).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ProducerDashboardPage from "@/app/[locale]/producer/dashboard/page";

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
vi.mock("@/components/PhoneVerifyCard", () => ({ default: () => <div data-testid="phone-verify-stub" /> }));
vi.mock("@/components/InfoTooltip", () => ({ default: () => null }));
vi.mock("@/lib/holidays", () => ({ getUpcomingHoliday: () => null }));
vi.mock("@/components/HolidayIcon", () => ({ default: () => null }));

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

const before = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => {
  stateRef.current = { status: "approved", kind: "producer", complete: true };
});

describe("approved + complete: the switch first (MEH-2883)", () => {
  it("«מצב נוכחי» renders before the help line, and «הלינק שלי» is not on home", async () => {
    render(<ProducerDashboardPage />);
    await screen.findByTestId("availability-pause-switch");
    const help = screen.getByTestId("dashboard-help-row");
    const heading = document.getElementById("availability-heading");
    expect(heading, "availability card").not.toBeNull();
    expect(before(heading, help), "switch before the help line").toBe(true);
    expect(screen.queryByTestId("vanity-share")).toBeNull();
  });
});

describe("draft: one checklist (MEH-2883)", () => {
  beforeEach(() => {
    stateRef.current = { status: "draft", kind: "producer", complete: false };
  });

  // MEH-3659: the submit button appears inside the card only when every
  // gate row is done; until then there is no button and no hint.
  it("incomplete: the card is the draft checklist, with no submit button and no separate draft banner", async () => {
    render(<ProducerDashboardPage />);
    const card = await screen.findByTestId("profile-completeness-card");
    expect(card.dataset.mode).toBe("draft");
    expect(screen.queryByTestId("draft-submit-banner")).toBeNull();
    expect(screen.queryByTestId("draft-submit-actions")).toBeNull();
    expect(screen.queryByTestId("draft-submit-cta")).toBeNull();
    expect(screen.queryByTestId("draft-missing-list")).toBeNull();
  });

  it("complete and ready: «הכול מוכן» carries the one enabled CTA inside the card", async () => {
    stateRef.current = { status: "draft", kind: "producer", complete: true, ready: true };
    render(<ProducerDashboardPage />);
    const card = await screen.findByTestId("profile-completeness-card");
    const actions = screen.getByTestId("draft-submit-actions");
    expect(card.contains(actions), "actions inside the card").toBe(true);
    expect(screen.getAllByTestId("draft-submit-cta")).toHaveLength(1);
    expect(screen.getByTestId("draft-submit-cta")).toBeEnabled();
    expect(screen.queryByTestId("draft-phone-verify")).toBeNull();
    expect(actions.getAttribute("role"), "no nested role=status").toBeNull();
  });

  it("an organizer keeps its own draft banner (its checklist), and no completeness card", async () => {
    stateRef.current = { status: "draft", kind: "organizer", complete: false };
    render(<ProducerDashboardPage />);
    expect(await screen.findByTestId("draft-submit-banner")).toBeInTheDocument();
    expect(screen.queryByTestId("profile-completeness-card")).toBeNull();
  });
});
