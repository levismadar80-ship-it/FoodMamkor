/**
 * MEH-157 / MEH-1355 — producer status banners on the dashboard Overview.
 *
 * Whole-page render (Dashboard1025Banner convention: key-echo next-intl mock,
 * mocked api/auth/icons) driving producer.status + user.producer_rejection_reason.
 * MEH-1355 migrated the /settings business-tab deltas here, so this suite now
 * also covers the rejected-reason display, the migrated fix-it tips, the NEW
 * inactive banner, and the shared support modal.
 *
 * Un-skipped from the pre-i18n MEH-729 version — the old suite asserted raw
 * Hebrew literals against a page that now requires next-intl context; the
 * key-echo mock makes those assertions stable again.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProducerDashboardPage from "@/app/[locale]/producer/dashboard/page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { userRef, producerRef } = vi.hoisted(() => ({
  userRef: { current: { id: 1, name: "שרה", role: "producer" } },
  producerRef: { current: {} },
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: userRef.current, loading: false }),
}));
vi.mock("next-intl", () => {
  const t = (key) => key;
  t.rich = (key) => key;
  return { useLocale: () => "he", useTranslations: () => t };
});
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@phosphor-icons/react", () => ({
  EnvelopeSimple: (p) => <span {...p} />,
  Eye: (p) => <span {...p} />,
  LockSimple: (p) => <span {...p} />,
  Sparkle: (p) => <span {...p} />,
  Warning: (p) => <span {...p} />,
  WhatsappLogo: (p) => <span {...p} />,
  X: (p) => <span {...p} />,
}));
vi.mock("@/components/InfoTooltip", () => ({ default: () => null }));
vi.mock("@/components/PhoneVerifyCard", () => ({ default: () => null }));
vi.mock("@/components/ProfileCompletenessCard", () => ({ default: () => null }));
vi.mock("@/lib/holidays", () => ({ getUpcomingHoliday: () => null }));
vi.mock("@/lib/producer-completeness", () => ({
  producerCompleteness: () => ({ missing: [], priority: "green" }),
}));

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn((url) => {
      if (url === "/producers/me/dashboard") {
        return Promise.resolve({ data: { producer: producerRef.current } });
      }
      if (url === "/producers/me/analytics") {
        return Promise.resolve({
          data: {
            profile_views: { last_7d: 0, total: 0 },
            whatsapp_clicks: { last_7d: 0, total: 0 },
            contact_clicks: { last_7d: 0, total: 0 },
            average_rating: 0, total_reviews: 0, conversion_rate: 0,
          },
        });
      }
      return Promise.resolve({ data: null }); // /producers/me
    }),
    post: vi.fn(() => Promise.resolve({})),
  },
}));

function setup(
  status,
  { rejection_reason = null, rejection_reason_code = null, resubmission_count = 0 } = {},
) {
  producerRef.current = {
    id: 1,
    name: "חוות הבוקר",
    slug: "chavat-haboker",
    status,
    availability_state: "accepting_orders",
  };
  userRef.current = {
    id: 1,
    name: "שרה",
    role: "producer",
    producer_rejection_reason: rejection_reason,
    // MEH-2210: the code + count ride /auth/me beside the reason (chunk A).
    producer_rejection_reason_code: rejection_reason_code,
    producer_resubmission_count: resubmission_count,
  };
}

describe("producer dashboard status banners (MEH-1355)", () => {
  beforeEach(() => setup("approved"));

  it("rejected: renders reason (as a quote) + the resubmit CTA + support trigger, no generic tips (MEH-2210)", async () => {
    setup("rejected", {
      rejection_reason: "התמונות לא ברורות מספיק",
      rejection_reason_code: "missing_image",
    });
    render(<ProducerDashboardPage />);
    const banner = await screen.findByTestId("status-rejected-banner");
    expect(banner).toHaveAttribute("role", "alert");
    expect(screen.getByTestId("status-rejected-reason")).toHaveTextContent(
      "התמונות לא ברורות מספיק",
    );
    // The reason-driven line, keyed on the admin's code (key-echo mock).
    expect(screen.getByTestId("status-rejected-line")).toHaveTextContent(
      "by_code.missing_image",
    );
    expect(screen.getByTestId("status-rejected-resubmit")).toBeInTheDocument();
    expect(screen.getByTestId("status-rejected-support")).toBeInTheDocument();
    // MEH-2210 absence assertion: the three MEH-1355 tips that did not depend
    // on the reason are gone from the page.
    expect(screen.queryByText("status.rejected.tip_details")).not.toBeInTheDocument();
    expect(screen.queryByText("status.rejected.tip_photos")).not.toBeInTheDocument();
    expect(screen.queryByText("status.rejected.tip_address")).not.toBeInTheDocument();
  });

  it("rejected: omits the quote when no rejection_reason is set, CTA still shown (legacy row)", async () => {
    setup("rejected", { rejection_reason: null });
    render(<ProducerDashboardPage />);
    await screen.findByTestId("producer-overview");
    expect(screen.getByTestId("status-rejected-banner")).toBeInTheDocument();
    expect(screen.queryByTestId("status-rejected-reason")).not.toBeInTheDocument();
    expect(screen.queryByTestId("status-rejected-line")).not.toBeInTheDocument();
    expect(screen.getByTestId("status-rejected-resubmit")).toBeInTheDocument();
  });

  it("rejected: at the cap the CTA is gone and the capped line shows (MEH-2210)", async () => {
    setup("rejected", { rejection_reason: "x", resubmission_count: 3 });
    render(<ProducerDashboardPage />);
    await screen.findByTestId("producer-overview");
    expect(screen.queryByTestId("status-rejected-resubmit")).not.toBeInTheDocument();
    expect(screen.getByTestId("status-rejected-capped")).toBeInTheDocument();
    expect(screen.getByTestId("status-rejected-support")).toBeInTheDocument();
  });

  it("rejected → resubmit click flips the page to the pending banner in the same session (MEH-2210)", async () => {
    setup("rejected", { rejection_reason: "x", rejection_reason_code: "missing_docs" });
    render(<ProducerDashboardPage />);
    await screen.findByTestId("status-rejected-banner");
    fireEvent.click(screen.getByTestId("status-rejected-resubmit"));
    await screen.findByTestId("status-pending-banner");
    expect(screen.queryByTestId("status-rejected-banner")).not.toBeInTheDocument();
  });

  it("inactive: renders the amber banner + support trigger (literal 'inactive')", async () => {
    setup("inactive");
    render(<ProducerDashboardPage />);
    await screen.findByTestId("producer-overview");

    const banner = screen.getByTestId("status-inactive-banner");
    expect(banner).toBeInTheDocument();
    expect(banner.className).toContain("amber");
    expect(screen.getByText("status.inactive.title")).toBeInTheDocument();
    expect(screen.getByTestId("status-inactive-support")).toBeInTheDocument();
    // NOT the rejected banner
    expect(screen.queryByTestId("status-rejected-banner")).not.toBeInTheDocument();
  });

  it("support modal opens from a banner with wa.me + mailto entries", async () => {
    setup("inactive");
    render(<ProducerDashboardPage />);
    await screen.findByTestId("producer-overview");

    fireEvent.click(screen.getByTestId("status-inactive-support"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const wa = document.querySelector('a[href^="https://wa.me/"]');
    // MEH-2113 rider (Sapir ruling 18/08): the support modal now promises the
    // monitored contact@ address on the canonical domain, not the dead support@.
    const mail = document.querySelector('a[href^="mailto:contact@mehamakor.co.il"]');
    expect(wa).not.toBeNull();
    expect(mail).not.toBeNull();
  });

  it("approved: renders no rejected/inactive banner", async () => {
    setup("approved");
    render(<ProducerDashboardPage />);
    await screen.findByTestId("producer-overview");

    expect(screen.queryByTestId("status-rejected-banner")).not.toBeInTheDocument();
    expect(screen.queryByTestId("status-inactive-banner")).not.toBeInTheDocument();
  });
});
