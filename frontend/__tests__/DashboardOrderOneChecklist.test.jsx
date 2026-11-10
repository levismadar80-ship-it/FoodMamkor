/**
 * MEH-2883 (MEH-2882 PR 2) — placement on the dashboard home:
 * - approved + complete: the «מצב נוכחי» switch comes right after the
 *   greeting, BEFORE «הלינק שלי» and the numbers (daily before now-and-then);
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
  it("«מצב נוכחי» renders before «הלינק שלי»", async () => {
    render(<ProducerDashboardPage />);
    const share = await screen.findByTestId("vanity-share");
    const heading = document.getElementById("availability-heading");
    expect(heading, "availability card").not.toBeNull();
    expect(before(heading, share), "switch before the link").toBe(true);
  });
});

describe("draft: one checklist (MEH-2883)", () => {
  beforeEach(() => {
    stateRef.current = { status: "draft", kind: "producer", complete: false };
  });

  it("a business sees the completeness card with the submit actions inside it, and no separate draft banner", async () => {
    render(<ProducerDashboardPage />);
    const card = await screen.findByTestId("profile-completeness-card");
    expect(screen.queryByTestId("draft-submit-banner")).toBeNull();
    const actions = screen.getByTestId("draft-submit-actions");
    expect(card.contains(actions), "actions live inside the one card").toBe(true);
    expect(screen.getAllByTestId("draft-submit-cta")).toHaveLength(1);
    // The draft banner's own list is not repeated inside the card.
    expect(screen.queryByTestId("draft-missing-list")).toBeNull();
  });

  it("incomplete + phone unverified: the phone check is inside the card, and the one CTA is disabled with its hint", async () => {
    render(<ProducerDashboardPage />);
    const card = await screen.findByTestId("profile-completeness-card");
    const phone = screen.getByTestId("draft-phone-verify");
    expect(card.contains(phone), "phone check inside the card").toBe(true);
    const cta = screen.getByTestId("draft-submit-cta");
    expect(cta).toBeDisabled();
    expect(cta.getAttribute("aria-describedby")).toBe("draft-cta-hint");
    expect(document.getElementById("draft-cta-hint"), "disabled-CTA hint").not.toBeNull();
  });

  it("complete and ready: the green card still carries the actions, and the CTA is enabled", async () => {
    stateRef.current = { status: "draft", kind: "producer", complete: true, ready: true };
    render(<ProducerDashboardPage />);
    const card = await screen.findByTestId("profile-completeness-card");
    const actions = screen.getByTestId("draft-submit-actions");
    expect(card.contains(actions), "actions inside the complete card").toBe(true);
    expect(screen.getByTestId("draft-submit-cta")).toBeEnabled();
    expect(screen.queryByTestId("draft-phone-verify")).toBeNull();
    // One live region: the actions sit inside the card's own status region.
    expect(actions.getAttribute("role"), "no nested role=status").toBeNull();
  });

  it("an organizer keeps its own draft banner (its checklist), and no completeness card", async () => {
    stateRef.current = { status: "draft", kind: "organizer", complete: false };
    render(<ProducerDashboardPage />);
    expect(await screen.findByTestId("draft-submit-banner")).toBeInTheDocument();
    expect(screen.queryByTestId("profile-completeness-card")).toBeNull();
  });
});
