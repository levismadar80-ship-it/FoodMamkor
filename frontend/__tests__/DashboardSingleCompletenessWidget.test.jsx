/**
 * MEH-961: Regression test — the producer dashboard must mount exactly ONE
 * profile-completeness widget.
 *
 * Before the fix, two widgets co-existed on /producer/dashboard and showed
 * conflicting numbers for the same owner:
 *   - the canonical <ProfileCompletenessCard> (MEH-288/MEH-897), a ring driven
 *     by the lib/producer-completeness.js heuristic, AND
 *   - a stale inline <ProfileStrengthCard> (MEH-57) inside AnalyticsSection,
 *     driven by the backend `analytics.profile_strength` — a different calc.
 *
 * The stale ProfileStrengthCard was removed. This test renders the full
 * happy-path dashboard (so AnalyticsSection — the stale widget's old home —
 * renders for real) and asserts a single completeness indicator: the canonical
 * card is the only element exposing role="progressbar" (the ring). If a second
 * completeness widget is ever re-introduced, this count breaks.
 *
 * Component test (not E2E): the dashboard is auth-gated; vitest is the
 * rule-clean home for an isolated render (matches DashboardLoadError.test.jsx).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ProducerDashboardPage from "@/app/[locale]/producer/dashboard/page";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Signed-in producer so the page clears its role guard and fetches. Stable
// `user` ref so the [user, authLoading] effect doesn't re-fire every render.
vi.mock("@/lib/auth-context", () => {
  const user = { id: 1, name: "דנה", role: "producer" };
  return {
    useAuth: () => ({ user, loading: false }),
  };
});

// next-intl identity mock — `t(key) => key`, plus `t.rich` (the dashboard uses
// t.rich for welcome_subtitle on the happy path, unlike the error-branch test).
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
  // MEH-990: real ProfileCompletenessCard now renders Check (checklist) + ArrowRight (CTA)
  Check: (p) => <span {...p} />,
  ArrowRight: (p) => <span {...p} />,
}));
vi.mock("@/components/InfoTooltip", () => ({ default: () => null }));
vi.mock("@/components/PhoneVerifyCard", () => ({ default: () => null }));
vi.mock("@/components/ui/Input", () => ({ default: () => null }));
vi.mock("@/lib/holidays", () => ({ getUpcomingHoliday: () => null }));
// ProfileCompletenessCard is NOT mocked — we render the real canonical card so
// its ring (role="progressbar") is the thing we count.

// An incomplete profile → the canonical card renders its ring (the non-green
// branch), not the collapsed green confirmation line.
const incompleteProfile = {
  id: 1,
  name: "עסק לדוגמה",
  city: null,
  lat: null,
  lng: null,
  phone: null,
  instagram: null,
  categories: [],
  images: [],
  delivery_areas: [],
};

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn((url) => {
      if (url === "/producers/me/dashboard") {
        return Promise.resolve({
          data: { producer: { id: 1, name: "עסק לדוגמה", status: "approved", availability_state: "accepting_orders" } },
        });
      }
      if (url === "/producers/me/analytics") {
        // A non-null analytics object → AnalyticsSection renders (the stale
        // widget's old home). The dashboard gates the section on the analytics
        // object itself (page.js: `{analytics ? ... }`), not on any field —
        // profile_strength: 0 mirrors the production 0% the stale widget showed.
        return Promise.resolve({ data: { profile_strength: 0 } });
      }
      if (url === "/producers/me") {
        return Promise.resolve({ data: incompleteProfile });
      }
      return Promise.resolve({ data: null });
    }),
    post: vi.fn(() => Promise.resolve({})),
    put: vi.fn(() => Promise.resolve({})),
  },
}));

describe("Producer dashboard — single completeness widget (MEH-961)", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("mounts exactly one completeness widget (the canonical ring)", async () => {
    render(<ProducerDashboardPage />);

    // Wait for the happy-path fetches to settle and the canonical card's ring
    // to mount. AnalyticsSection has also rendered by now.
    const ring = await screen.findByRole("progressbar");
    expect(ring).toBeInTheDocument();

    // Exactly one completeness indicator — the stale ProfileStrengthCard (which
    // had no progressbar role and lived in AnalyticsSection) is gone.
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);

    // Producer user cleared the guard — no redirect to /login.
    expect(mockPush).not.toHaveBeenCalled();
  });
});
