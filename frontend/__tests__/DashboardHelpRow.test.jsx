/**
 * MEH-3106: a permanent «צריכים עזרה?» row on the dashboard home opens the
 * support modal (MEH-1355) for every status — until now only the rejected /
 * inactive banners could open it, so a live business had no way in.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
const { analyticsRef, statusRef, kindRef, completeRef } = vi.hoisted(() => ({
  analyticsRef: { current: null },
  statusRef: { current: "approved" },
  kindRef: { current: "producer" },
  completeRef: { current: true },
}));

// Completeness is driven per test (the fixture profile has no images etc.).
vi.mock("@/lib/producer-completeness", async (orig) => {
  const real = await orig();
  return {
    ...real,
    producerCompleteness: (p) =>
      completeRef.current ? { missing: [], priority: "green" } : real.producerCompleteness(p),
  };
});

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
          data: { id: 1, slug: "arugot-noam", status: statusRef.current, kind: kindRef.current, images: [], categories: [], locations: [] },
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

const analytics = {
  profile_views: { last_7d: 1, last_30d: 1, total: 1 },
  whatsapp_clicks: { last_7d: 0, last_30d: 0, total: 0 },
  contact_clicks: { last_7d: 0, last_30d: 0, total: 0 },
  average_rating: 0,
  total_reviews: 0,
  conversion_rate: 0,
};

describe("help row on the dashboard home (MEH-3106)", () => {
  beforeEach(() => {
    kindRef.current = "producer";
    completeRef.current = true;
    analyticsRef.current = analytics;
  });

  for (const status of ["approved", "pending", "draft"]) {
    it(`${status}: the row is there, and its button opens the support modal`, async () => {
      statusRef.current = status;
      render(<ProducerDashboardPage />);
      const row = await screen.findByTestId("dashboard-help-row");
      expect(row).toHaveTextContent("help_row.title");
      expect(row).toHaveTextContent("help_row.body");
      expect(screen.queryByRole("dialog")).toBeNull();
      fireEvent.click(screen.getByTestId("dashboard-help-cta"));
      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveTextContent("heading");
    });
  }

  it("the row comes after the numbers (last card on the page)", async () => {
    statusRef.current = "approved";
    render(<ProducerDashboardPage />);
    const row = await screen.findByTestId("dashboard-help-row");
    const strip = await screen.findByTestId("overview-kpi-strip");
    expect(Boolean(strip.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });
});
