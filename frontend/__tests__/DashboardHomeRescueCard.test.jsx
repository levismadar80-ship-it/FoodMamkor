/**
 * MEH-2884 (dashboard placement audit item 7): with the rescue-bags pilot on,
 * an approved business gets a short entry to the rescue tool on the dashboard
 * home, right after the availability switch. Existing strings (the «כלים»
 * tile's), same flag. Off / pending / organizer → nothing on home.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ProducerDashboardPage from "@/app/[locale]/producer/dashboard/page";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/lib/auth-context", () => {
  const user = { id: 1, name: "דנה", role: "producer" };
  return {
    useAuth: () => ({ user, loading: false }),
  };
});

vi.mock("next-intl", () => {
  const t = (key) => key;
  t.rich = (key) => key;
  return {
    useLocale: () => "he",
    useTranslations: () => t,
  };
});

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@phosphor-icons/react", () => ({
  PencilSimple: (p) => <span {...p} />,
  Warning: (p) => <span {...p} />,
  Leaf: (p) => <span {...p} />,
  Check: (p) => <span {...p} />,
  ArrowRight: (p) => <span {...p} />,
  X: (p) => <span {...p} />,
  Sparkle: (p) => <span {...p} />,
  WhatsappLogo: (p) => <span {...p} />,
  Eye: (p) => <span {...p} />,
  EnvelopeSimple: (p) => <span {...p} />,
  ShoppingBag: (p) => <span {...p} />,
  LockSimple: (p) => <span {...p} />,
  PaperPlaneTilt: (p) => <span {...p} />,
}));
vi.mock("@/components/InfoTooltip", () => ({ default: () => null }));
vi.mock("@/components/PhoneVerifyCard", () => ({ default: () => null }));
vi.mock("@/components/ui/Input", () => ({ default: () => null }));
vi.mock("@/lib/holidays", () => ({ getUpcomingHoliday: () => null }));
// MEH-1687 D: the holiday hint renders HolidayIcon (Phosphor names this file's icon mock lacks).
vi.mock("@/components/HolidayIcon", () => ({ default: () => null }));

// Mutable analytics payload — each test sets it before render (vi.hoisted so
// the api mock factory can close over it despite vi.mock hoisting).
const { analyticsRef, statusRef } = vi.hoisted(() => ({
  analyticsRef: { current: null },
  statusRef: { current: "approved" },
}));

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn((url) => {
      if (url === "/producers/me/dashboard") {
        return Promise.resolve({
          data: {
            producer: {
              id: 1,
              name: "עסק לדוגמה",
              status: statusRef.current,
              availability_state: "accepting_orders",
            },
          },
        });
      }
      if (url === "/producers/me/analytics") {
        return Promise.resolve({ data: analyticsRef.current });
      }
      if (url === "/producers/me") {
        // The slug lives on the profile, never on /me/dashboard (MEH-2880).
        return Promise.resolve({
          data: { id: 1, slug: "arugot-noam", status: statusRef.current, kind: "producer", images: [], categories: [], locations: [] },
        });
      }
      // /producers/me → null profile: the completeness card stays unmounted;
      // the pulse doesn't depend on it.
      return Promise.resolve({ data: null });
    }),
    post: vi.fn(() => Promise.resolve({})),
    put: vi.fn(() => Promise.resolve({})),
  },
}));

// Aggregate shape mirroring producer_me.py:689-705 (only the fields the
// Overview reads).
const analytics = {
  profile_views: { last_7d: 1, last_30d: 1, total: 1 },
  whatsapp_clicks: { last_7d: 0, last_30d: 0, total: 0 },
  contact_clicks: { last_7d: 0, last_30d: 0, total: 0 },
  average_rating: 0,
  total_reviews: 0,
  conversion_rate: 0,
};

describe("rescue entry on the dashboard home (MEH-2884 item 7)", () => {
  beforeEach(() => {
    statusRef.current = "approved";
    analyticsRef.current = analytics;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("pilot on, approved: one card into /producer/dashboard/rescue, right after the availability switch", async () => {
    vi.stubEnv("NEXT_PUBLIC_RESCUE_BAGS_ENABLED", "true");
    render(<ProducerDashboardPage />);
    const card = await screen.findByTestId("home-rescue-card");
    expect(card.getAttribute("href")).toBe("/producer/dashboard/rescue");
    expect(card).toHaveTextContent("quick_links.rescue.title");
    const availability = document.getElementById("availability-heading");
    expect(availability, "availability card").not.toBeNull();
    expect(
      Boolean(availability.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING),
      "after the switch",
    ).toBe(true);
  });

  it("pilot off: no card", async () => {
    vi.stubEnv("NEXT_PUBLIC_RESCUE_BAGS_ENABLED", "false");
    render(<ProducerDashboardPage />);
    await screen.findByTestId("overview-kpi-strip");
    expect(screen.queryByTestId("home-rescue-card")).toBeNull();
  });

  it("pilot on, pending business: no card on home (the «כלים» tile still has it)", async () => {
    vi.stubEnv("NEXT_PUBLIC_RESCUE_BAGS_ENABLED", "true");
    statusRef.current = "pending";
    render(<ProducerDashboardPage />);
    await screen.findByTestId("overview-kpi-strip");
    expect(screen.queryByTestId("home-rescue-card")).toBeNull();
  });
});
