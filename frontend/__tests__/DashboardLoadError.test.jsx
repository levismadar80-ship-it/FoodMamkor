/**
 * MEH-956: Regression test — the producer dashboard must render a graceful
 * load-error card (not the infinite "loading" text) when
 * GET /producers/me/dashboard returns a non-2xx — e.g. a 404 for a
 * producer-role account with no business record.
 *
 * Guards the loadError/loading split in
 * frontend/app/[locale]/producer/dashboard/page.js: a failed fetch sets a
 * dedicated `loadError` flag whose render branch precedes the `!data`
 * loading branch, so an error never falls through to the `loading_data`
 * loading text.
 *
 * Component test (not E2E): the dashboard is auth-gated, so an E2E would
 * have to stub the happy-path /auth/me — in tension with the e2e/ no-mocks
 * rule (MEH-417). vitest is the rule-clean home for an isolated render
 * branch (vitest.config.js excludes e2e/**).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ProducerDashboardPage from "@/app/[locale]/producer/dashboard/page";

// Router — the auth guard pushes to /login on a missing/non-producer user;
// our user IS a producer, so push must NOT fire.
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Auth — signed-in producer so the page clears its role guard and fetches.
// `user` is a stable reference (created once in the factory closure) to
// mirror the real context: the dashboard effect deps on `[user, authLoading]`,
// and a new object each render would re-fire the effect every render.
vi.mock("@/lib/auth-context", () => {
  const user = { id: 1, name: "דנה", role: "producer" };
  return {
    useAuth: () => ({ user, loading: false }),
  };
});

// next-intl identity mock — assert on testid + href, not Hebrew copy
// (matches AdminNullGuards / SettingsPage pattern; copy is translation-
// resistant via data-testid per docs/E2E-LOCATORS.md).
vi.mock("next-intl", () => ({
  useLocale: () => "he",
  useTranslations: () => (key) => key,
}));

// Locale-aware CTA Link → plain anchor so href is readable in jsdom.
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

// Icons + child cards aren't rendered in the error branch (early return),
// but are imported at module load — stub them so the import stays cheap.
vi.mock("@phosphor-icons/react", () => ({
  PencilSimple: (p) => <span {...p} />,
  Warning: (p) => <span {...p} />,
  Leaf: (p) => <span {...p} />,
}));
vi.mock("@/components/InfoTooltip", () => ({ default: () => null }));
vi.mock("@/components/PhoneVerifyCard", () => ({ default: () => null }));
vi.mock("@/components/ProfileCompletenessCard", () => ({ default: () => null }));
vi.mock("@/components/ui/Input", () => ({ default: () => null }));
vi.mock("@/lib/holidays", () => ({ getUpcomingHoliday: () => null }));

// API — the dashboard endpoint rejects 404; analytics + profile are
// irrelevant to the error branch (they fail-soft to null).
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn((url) => {
      if (url === "/producers/me/dashboard") {
        return Promise.reject({ response: { status: 404 } });
      }
      return Promise.resolve({ data: null });
    }),
    post: vi.fn(() => Promise.resolve({})),
    put: vi.fn(() => Promise.resolve({})),
  },
}));

describe("Producer dashboard — load-error graceful state (MEH-956)", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("renders the graceful card with a /contact CTA on a 404, not loading text", async () => {
    render(<ProducerDashboardPage />);

    // Error branch replaces the loading text once the 404 rejection settles.
    const card = await screen.findByTestId("dashboard-load-error");
    expect(card).toBeInTheDocument();

    // CTA targets /contact (locale-aware Link mocked to a plain anchor).
    const cta = screen.getByTestId("dashboard-load-error-cta");
    expect(cta).toHaveAttribute("href", "/contact");

    // Error ≠ loading: the loading_data key must not be on screen.
    expect(screen.queryByText("loading_data")).not.toBeInTheDocument();

    // Producer user cleared the guard — no redirect to /login.
    expect(mockPush).not.toHaveBeenCalled();
  });
});
