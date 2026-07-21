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

function setup(status, { rejection_reason = null } = {}) {
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
  };
}

describe("producer dashboard status banners (MEH-1355)", () => {
  beforeEach(() => setup("approved"));

  it("rejected: renders reason + migrated tips + support trigger", async () => {
    setup("rejected", { rejection_reason: "התמונות לא ברורות מספיק" });
    render(<ProducerDashboardPage />);
    await screen.findByTestId("producer-overview");

    const banner = screen.getByTestId("status-rejected-banner");
    expect(banner).toBeInTheDocument();
    // admin reason rendered as-is (like ChangesRequestedBanner's DB text)
    expect(screen.getByTestId("status-rejected-reason")).toHaveTextContent(
      "התמונות לא ברורות מספיק",
    );
    // 3 fix-it tips migrated from the removed /settings business tab (key-echo)
    expect(screen.getByText("status.rejected.tip_details")).toBeInTheDocument();
    expect(screen.getByText("status.rejected.tip_photos")).toBeInTheDocument();
    expect(screen.getByText("status.rejected.tip_address")).toBeInTheDocument();
    expect(screen.getByTestId("status-rejected-support")).toBeInTheDocument();
  });

  it("rejected: omits the reason paragraph when no rejection_reason is set", async () => {
    setup("rejected", { rejection_reason: null });
    render(<ProducerDashboardPage />);
    await screen.findByTestId("producer-overview");

    expect(screen.getByTestId("status-rejected-banner")).toBeInTheDocument();
    expect(screen.queryByTestId("status-rejected-reason")).not.toBeInTheDocument();
    // tips still render even without a reason
    expect(screen.getByText("status.rejected.tip_photos")).toBeInTheDocument();
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
    const mail = document.querySelector('a[href^="mailto:support@mehamakor.online"]');
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
