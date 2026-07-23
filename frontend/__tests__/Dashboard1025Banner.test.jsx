/**
 * MEH-1025 Chunk B: producer-side "נשאר להשלים" banner on the dashboard Overview.
 *
 * Whole-page render (Dashboard1DStates convention) driving profile.requested_changes
 * through the /producers/me mock. Locked behavior:
 *   - banner renders when requested_changes set; CTA → /producer/dashboard/edit;
 *     changes_requested_at wrapped dir="ltr"
 *   - requested_changes null → 0 DOM
 *   - generic "ממתין לאישור" pending banner is SUPPRESSED when requested_changes
 *     is set (they'd otherwise stack + contradict), and still shows when it's null
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ProducerDashboardPage from "@/app/[locale]/producer/dashboard/page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
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
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@phosphor-icons/react", () => ({
  ClipboardText: (p) => <span {...p} />,
  Eye: (p) => <span {...p} />,
  LockSimple: (p) => <span {...p} />,
  Sparkle: (p) => <span {...p} />,
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

const { producerRef, profileRef } = vi.hoisted(() => ({
  producerRef: { current: {} },
  profileRef: { current: null },
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
      return Promise.resolve({ data: profileRef.current }); // /producers/me
    }),
    post: vi.fn(() => Promise.resolve({})),
    put: vi.fn(() => Promise.resolve({})),
  },
}));

const FEEDBACK = "חסרה תמונה — יש להעלות לפחות תמונה אחת";
const PENDING_TITLE = "status.pending.title"; // key-echo of the generic banner

function setup({ requested_changes = null, changes_requested_at = null } = {}) {
  producerRef.current = { id: 1, name: "עסק לדוגמה", slug: "demo-farm", status: "pending", availability_state: "accepting_orders" };
  profileRef.current = { id: 1, name: "עסק לדוגמה", slug: "demo-farm", requested_changes, changes_requested_at };
}

describe("Dashboard ChangesRequestedBanner (MEH-1025 Chunk B)", () => {
  beforeEach(() => setup());

  it("renders the banner + body + edit CTA when requested_changes is set", async () => {
    setup({ requested_changes: FEEDBACK, changes_requested_at: "2026-07-07T08:00:00Z" });
    render(<ProducerDashboardPage />);
    await screen.findByTestId("producer-overview");
    expect(screen.getByTestId("changes-requested-banner")).toBeInTheDocument();
    expect(screen.getByText(FEEDBACK)).toBeInTheDocument(); // DB text as-is
    expect(screen.getByTestId("changes-requested-cta")).toHaveAttribute(
      "href",
      "/producer/dashboard/edit",
    );
    // date wrapped dir="ltr" (RTL flip guard)
    expect(document.querySelector('span[dir="ltr"]')).not.toBeNull();
  });

  it("renders 0 DOM when requested_changes is null", async () => {
    setup({ requested_changes: null });
    render(<ProducerDashboardPage />);
    await screen.findByTestId("producer-overview");
    expect(screen.queryByTestId("changes-requested-banner")).not.toBeInTheDocument();
  });

  it("suppresses the generic pending banner when requested_changes is set", async () => {
    setup({ requested_changes: FEEDBACK, changes_requested_at: "2026-07-07T08:00:00Z" });
    render(<ProducerDashboardPage />);
    await screen.findByTestId("producer-overview");
    // specific banner shows, generic "ממתין לאישור" is suppressed
    expect(screen.getByTestId("changes-requested-banner")).toBeInTheDocument();
    expect(screen.queryByText(PENDING_TITLE)).not.toBeInTheDocument();
  });

  it("still shows the generic pending banner when requested_changes is null", async () => {
    setup({ requested_changes: null });
    render(<ProducerDashboardPage />);
    await screen.findByTestId("producer-overview");
    expect(screen.getByText(PENDING_TITLE)).toBeInTheDocument();
  });
});
