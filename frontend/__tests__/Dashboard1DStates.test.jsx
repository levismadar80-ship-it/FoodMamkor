/**
 * MEH-964 1D: state-driven Overview UX — empty-state, share-gate,
 * availability-disable, view-public.
 *
 * Renders the full dashboard page (whole-component convention from
 * DashboardActivityPulse.test.jsx) and drives three mutable payloads:
 *   - producerRef.status  → isApproved (status === "approved")
 *   - completeRef.current → isComplete (producerCompleteness mock)
 *   - analyticsRef.current→ hasActivity (profile_views/whatsapp_clicks total)
 *
 * Locked behavior under test:
 *   - «הלינק שלי» is no longer on the home (MEH-3767, moved to «שיתוף»).
 *   - availability pause switch disabled until approved (+ described-by hint).
 *     MEH-2759: it was four radios.
 *   - KPI strip → warm zero-state when there's no activity yet.
 *   - view-public link points at /{slug}.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ProducerDashboardPage from "@/app/[locale]/producer/dashboard/page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// MEH-2876: ONE user object for every render, like the real auth context
// (state, not a fresh literal). A new object per call changed the `user`
// dependency of the page's fetch effects on every render, so each fetch's
// setState re-ran the effects: an endless fetch → render loop. The other
// cases ended before it mattered; the «שתפו» click (outside act) made React
// flush it synchronously and the worker spun at 100% CPU.
const AUTH = vi.hoisted(() => ({ user: { id: 1, name: "דנה", role: "producer" }, loading: false }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => AUTH,
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
// MEH-1428: the "ערכת שיתוף" section mounts two canvas cards. Stubbed here for
// the same reason the sibling cards above are: this file asserts a PAGE-level
// contract, and a real canvas would drag Instagram-card geometry (and its icon
// set) into it. Their own behaviour is covered by ReviewCardLayout.test.jsx +
// ShareKitOwnerMode.test.jsx.
vi.mock("@/components/StoryCardCanvas", () => ({
  default: () => <div data-testid="story-card-canvas-stub" />,
}));
vi.mock("@/components/ReviewCardCanvas", () => ({
  default: () => <div data-testid="review-card-canvas-stub" />,
}));
vi.mock("@phosphor-icons/react", () => ({
  ChatText: (p) => <span {...p} />,
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
// MEH-1687 D: the holiday hint renders HolidayIcon (Phosphor names this file's icon mock lacks).
vi.mock("@/components/HolidayIcon", () => ({ default: () => null }));

// Mutable refs the api + completeness mocks close over (vi.hoisted — mock
// factories are hoisted above these declarations).
const { producerRef, analyticsRef, profileRef, completeRef } = vi.hoisted(() => ({
  producerRef: { current: {} },
  analyticsRef: { current: null },
  profileRef: { current: null },
  completeRef: { current: false },
}));

vi.mock("@/lib/producer-completeness", () => ({
  producerCompleteness: () => ({
    missing: completeRef.current ? [] : ["עיר"],
    priority: completeRef.current ? "green" : "yellow",
  }),
}));

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn((url) => {
      if (url === "/producers/me/dashboard") {
        return Promise.resolve({ data: { producer: producerRef.current } });
      }
      if (url === "/producers/me/analytics") return Promise.resolve({ data: analyticsRef.current });
      return Promise.resolve({ data: profileRef.current }); // /producers/me
    }),
    post: vi.fn(() => Promise.resolve({})),
    put: vi.fn(() => Promise.resolve({})),
  },
}));

const ZERO = {
  profile_views: { last_7d: 0, last_30d: 0, total: 0 },
  whatsapp_clicks: { last_7d: 0, last_30d: 0, total: 0 },
  contact_clicks: { last_7d: 0, last_30d: 0, total: 0 },
  average_rating: 0, total_reviews: 0,
  conversion_rate: 0,
};
const ACTIVE = { ...ZERO, profile_views: { last_7d: 2, last_30d: 4, total: 9 } };

function setup({ status = "approved", complete = true, analytics = ACTIVE } = {}) {
  // MEH-2880: the REAL shape of GET /producers/me/dashboard — no `slug`
  // (producer_me.py). The slug lives on GET /producers/me (profileRef). This
  // mock used to carry a slug the endpoint never sends, which hid the bug.
  producerRef.current = { id: 1, name: "עסק לדוגמה", status, availability_state: "accepting_orders", vacation_until: null, plan: "free" };
  profileRef.current = { id: 1, name: "עסק לדוגמה", slug: "demo-farm" };
  completeRef.current = complete;
  analyticsRef.current = analytics;
}

// MEH-3767: «הלינק שלי» left the home for «שיתוף»; its share-gate cases
// (complete AND approved, else the locked hint) moved with it to
// DashboardSharePlacement.test.jsx. Here: the home no longer carries either.
describe("Dashboard 1D — «הלינק שלי» is not on the home (MEH-3767)", () => {
  it.each([
    ["approved + complete", { status: "approved", complete: true }],
    ["approved + incomplete", { status: "approved", complete: false }],
    ["pending", { status: "pending", complete: true }],
  ])("%s: no link card and no locked hint", async (_label, opts) => {
    setup(opts);
    render(<ProducerDashboardPage />);
    await screen.findByTestId("overview-kpi-strip");
    expect(screen.queryByTestId("vanity-share")).toBeNull();
    expect(screen.queryByTestId("share-locked-hint")).toBeNull();
    expect(screen.queryByText(/mehamakor\.co\.il\/p\//)).toBeNull();
  });
});

describe("Dashboard 1D — availability-disable (MEH-964)", () => {
  // MEH-3079: was «disabled switch + hint» (MEH-964 1D). A new business could
  // not use or read a locked switch, so the card waits for approval.
  it("hides the availability card until approved", async () => {
    setup({ status: "pending", complete: true });
    render(<ProducerDashboardPage />);
    // The numbers strip renders after the fetches settle (MEH-3767: the
    // locked hint that used to mark this moment left the home).
    await screen.findByTestId("overview-kpi-strip");
    expect(screen.queryByTestId("availability-pause-switch")).toBeNull();
  });

  it("enables the pause switch (no hint) once approved", async () => {
    setup({ status: "approved", complete: true });
    render(<ProducerDashboardPage />);
    await screen.findByTestId("producer-overview");
    expect(screen.getByTestId("availability-pause-switch")).not.toBeDisabled();
  });
});

describe("Dashboard 1D — empty-state + view-public (MEH-964)", () => {
  it("renders the warm zero-state (not the KPI strip) when there's no activity", async () => {
    setup({ status: "approved", complete: true, analytics: ZERO });
    render(<ProducerDashboardPage />);
    await screen.findByTestId("producer-overview");
    expect(screen.getByTestId("overview-zero-state")).toBeInTheDocument();
  });

  it("renders the KPI strip (not the zero-state) once there's activity", async () => {
    setup({ status: "approved", complete: true, analytics: ACTIVE });
    render(<ProducerDashboardPage />);
    await screen.findByTestId("producer-overview");
    expect(screen.queryByTestId("overview-zero-state")).not.toBeInTheDocument();
  });

  it("exposes a view-public link to /{slug}", async () => {
    setup({ status: "approved", complete: true });
    render(<ProducerDashboardPage />);
    await screen.findByTestId("producer-overview");
    expect(screen.getByTestId("view-public-link")).toHaveAttribute("href", "/demo-farm");
  });
});
