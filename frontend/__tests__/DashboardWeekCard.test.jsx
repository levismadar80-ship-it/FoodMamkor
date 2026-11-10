/**
 * MEH-2884 (dashboard placement audit item 5): ONE card for the week's
 * numbers on the Overview. Replaces the MEH-964 1C ActivityPulse tests — the
 * separate «פעילות אחרונה» card is gone; its WhatsApp nudge lives in the strip.
 *
 * Kept rulings (Sapir 03/07): the nudge + wa.me CTA appear ONLY when
 * whatsapp_clicks.last_7d > 0 (never .total). No presence rows, no reviews row.
 * Zero activity → ONE empty state, with a «שתפו» button once the business has
 * a public page. One click per file, in the LAST test (see
 * DashboardInsightsFollowersShare.test.jsx — the MEH-2876 hang).
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
// Overview reads).
const week = (wa, views, { totalWa = wa, totalViews = views } = {}) => ({
  profile_views: { last_7d: views, last_30d: views, total: totalViews },
  whatsapp_clicks: { last_7d: wa, last_30d: wa, total: totalWa },
  contact_clicks: { last_7d: 0, last_30d: 0, total: 0 },
  average_rating: 0,
  total_reviews: 0,
  conversion_rate: 0,
});

describe("the week card (MEH-2884 item 5)", () => {
  beforeEach(() => {
    mockPush.mockClear();
    statusRef.current = "approved";
    kindRef.current = "producer";
    completeRef.current = true;
  });

  it("WhatsApp clicks this week: the nudge + wa.me CTA sit inside the strip; no second card", async () => {
    analyticsRef.current = week(3, 5);
    render(<ProducerDashboardPage />);
    const strip = await screen.findByTestId("overview-kpi-strip");
    const nudge = screen.getByTestId("week-whatsapp-nudge");
    expect(nudge.parentElement, "the nudge and the strip share one block").toBe(strip.parentElement);
    expect(screen.getByTestId("week-whatsapp-cta").getAttribute("href")).toBe("https://wa.me/");
    expect(screen.queryByTestId("overview-zero-state")).toBeNull();
    // MEH-2882 (5): the week card leads to the insights tab.
    const all = screen.getByTestId("week-all-insights");
    expect(all.getAttribute("href")).toBe("/producer/dashboard/insights");
    expect(all).toHaveTextContent("all_insights");
    expect(all.parentElement, "the link sits in the week card").toBe(strip.parentElement);
  });

  it("views only this week: the strip, no nudge (truthful-new ruling)", async () => {
    analyticsRef.current = week(0, 4);
    render(<ProducerDashboardPage />);
    await screen.findByTestId("overview-kpi-strip");
    expect(screen.queryByTestId("week-whatsapp-nudge")).toBeNull();
    expect(screen.queryByTestId("week-whatsapp-cta")).toBeNull();
  });

  it("lifetime clicks but none this week: the strip with zeros, no nudge (never .total)", async () => {
    analyticsRef.current = week(0, 0, { totalWa: 7, totalViews: 12 });
    render(<ProducerDashboardPage />);
    await screen.findByTestId("overview-kpi-strip");
    expect(screen.queryByTestId("week-whatsapp-nudge")).toBeNull();
    expect(screen.queryByTestId("overview-zero-state")).toBeNull();
  });

  it("pending business, no activity: ONE empty state and no share button (no public page yet)", async () => {
    statusRef.current = "pending";
    analyticsRef.current = week(0, 0);
    render(<ProducerDashboardPage />);
    await screen.findByTestId("overview-zero-state");
    expect(screen.queryByTestId("overview-zero-share")).toBeNull();
    // The zero state is not the week card: no link to numbers that are all 0.
    expect(screen.queryByTestId("week-all-insights")).toBeNull();
  });

  it("approved but profile incomplete: no «שתפו» — «הלינק שלי» says sharing is locked", async () => {
    completeRef.current = false;
    analyticsRef.current = week(0, 0);
    render(<ProducerDashboardPage />);
    await screen.findByTestId("overview-zero-state");
    expect(await screen.findByTestId("share-locked-hint")).toBeInTheDocument();
    expect(screen.queryByTestId("overview-zero-share")).toBeNull();
  });

  it("organizer, approved + complete, no activity: no «שתפו» (no /p/ business page)", async () => {
    kindRef.current = "organizer";
    analyticsRef.current = week(0, 0);
    render(<ProducerDashboardPage />);
    await screen.findByTestId("overview-zero-state");
    expect(screen.queryByTestId("overview-zero-share")).toBeNull();
  });

  // LAST — the one click in this file.
  it("approved, no activity: ONE empty state whose «שתפו» shares /p/{slug}", async () => {
    analyticsRef.current = week(0, 0);
    const share = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    render(<ProducerDashboardPage />);
    const empty = await screen.findByTestId("overview-zero-state");
    const button = await screen.findByTestId("overview-zero-share");
    expect(empty.contains(button), "the button is inside the one empty state").toBe(true);
    fireEvent.click(button);
    expect(share).toHaveBeenCalledTimes(1);
    expect(share.mock.calls[0][0].url).toMatch(/\/p\/arugot-noam$/);
    delete navigator.share;
  });
});
