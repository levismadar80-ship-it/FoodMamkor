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
 *   - ShareCta (VanityLinkCard) renders ONLY when complete AND approved;
 *     otherwise a why-locked hint takes its place (never silent).
 *   - availability radios disabled until approved (+ described-by hint).
 *   - KPI strip → warm zero-state when there's no activity yet.
 *   - view-public link points at /{slug}.
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
  average_rating: 0, total_reviews: 0, rank_in_city: null,
  conversion_rate: 0, profile_strength: 0,
};
const ACTIVE = { ...ZERO, profile_views: { last_7d: 2, last_30d: 4, total: 9 } };

function setup({ status = "approved", complete = true, analytics = ACTIVE } = {}) {
  producerRef.current = { id: 1, name: "עסק לדוגמה", slug: "demo-farm", status, availability_state: "accepting_orders" };
  profileRef.current = { id: 1, name: "עסק לדוגמה", slug: "demo-farm" };
  completeRef.current = complete;
  analyticsRef.current = analytics;
}

describe("Dashboard 1D — share-gate (MEH-964)", () => {
  beforeEach(() => setup());

  it("shows the share card when complete AND approved", async () => {
    setup({ status: "approved", complete: true });
    render(<ProducerDashboardPage />);
    await screen.findByTestId("producer-overview");
    expect(screen.queryByTestId("share-locked-hint")).not.toBeInTheDocument();
    // VanityLinkCard renders the /p/{slug} vanity URL
    expect(screen.getByText(/mehamakor\.online\/p\/demo-farm/)).toBeInTheDocument();
  });

  it("hides the share card + shows the locked hint when INCOMPLETE", async () => {
    setup({ status: "approved", complete: false });
    render(<ProducerDashboardPage />);
    await screen.findByTestId("producer-overview");
    expect(screen.getByTestId("share-locked-hint")).toBeInTheDocument();
    expect(screen.queryByText(/mehamakor\.online\/p\//)).not.toBeInTheDocument();
  });

  it("hides the share card + shows the locked hint when UNAPPROVED", async () => {
    setup({ status: "pending", complete: true });
    render(<ProducerDashboardPage />);
    await screen.findByTestId("producer-overview");
    expect(screen.getByTestId("share-locked-hint")).toBeInTheDocument();
    expect(screen.queryByText(/mehamakor\.online\/p\//)).not.toBeInTheDocument();
  });
});

describe("Dashboard 1D — availability-disable (MEH-964)", () => {
  it("disables the availability radios + shows the hint until approved", async () => {
    setup({ status: "pending", complete: true });
    render(<ProducerDashboardPage />);
    await screen.findByTestId("producer-overview");
    expect(screen.getByTestId("availability-disabled-hint")).toBeInTheDocument();
    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBeGreaterThan(0);
    radios.forEach((r) => expect(r).toBeDisabled());
  });

  it("enables the radios (no hint) once approved", async () => {
    setup({ status: "approved", complete: true });
    render(<ProducerDashboardPage />);
    await screen.findByTestId("producer-overview");
    expect(screen.queryByTestId("availability-disabled-hint")).not.toBeInTheDocument();
    screen.getAllByRole("radio").forEach((r) => expect(r).not.toBeDisabled());
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
