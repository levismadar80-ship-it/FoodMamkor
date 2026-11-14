/**
 * MEH-3200: where «מה חדש» and the welcome card land on the real dashboard home.
 * Page-level cells the component tests cannot reach (fresh reviewer, 14/11):
 *   old business  → «חדש במהמקור» card + row, no welcome
 *   new business  → welcome only (never both in the top slot), row still there
 *   organizer     → neither card nor row
 * Mocks copied from DashboardSingleCompletenessWidget.test.jsx (same page).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import api from "@/lib/api";
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
  PencilSimple: (p) => <span {...p} />,
  Warning: (p) => <span {...p} />,
  Leaf: (p) => <span {...p} />,
  // MEH-990: real ProfileCompletenessCard now renders Check (checklist) + ArrowRight (CTA)
  Check: (p) => <span {...p} />,
  ArrowRight: (p) => <span {...p} />,
  // MEH-964 1C: ActivityPulse references WhatsappLogo + Eye in its rows array
  // on every render (the count gate only hides them from the DOM).
  WhatsappLogo: (p) => <span {...p} />,
  Eye: (p) => <span {...p} />,
  // MEH-3200: WhatsNewCard (dashboard home) renders a close X.
  X: (p) => <span {...p} />,
  // MEH-964 1D: page.js now imports Sparkle (KPI zero-state) + LockSimple
  // (share-locked hint); both mount on the no-activity / locked paths.
  Sparkle: (p) => <span {...p} />,
  LockSimple: (p) => <span {...p} />,
}));
vi.mock("@/components/InfoTooltip", () => ({ default: () => null }));
vi.mock("@/components/PhoneVerifyCard", () => ({ default: () => null }));
vi.mock("@/components/ui/Input", () => ({ default: () => null }));
vi.mock("@/lib/holidays", () => ({ getUpcomingHoliday: () => null }));
// MEH-1687 D: the holiday hint renders HolidayIcon (Phosphor names this file's icon mock lacks).
vi.mock("@/components/HolidayIcon", () => ({ default: () => null }));
// ProfileCompletenessCard is NOT mocked — we render the real canonical card so
// its ring (role="progressbar") is the thing we count.

const DAY = 24 * 60 * 60 * 1000;
const profileState = vi.hoisted(() => ({ value: {} }));

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn((url) => {
      if (url === "/producers/me/dashboard") {
        return Promise.resolve({
          data: { producer: { id: 1, name: "עסק", status: "approved", availability_state: "accepting_orders" } },
        });
      }
      if (url === "/producers/me/analytics") return Promise.resolve({ data: { profile_strength: 0 } });
      if (url === "/producers/me") return Promise.resolve({ data: profileState.value });
      return Promise.resolve({ data: null });
    }),
    post: vi.fn(() => Promise.resolve({})),
    put: vi.fn(() => Promise.resolve({})),
  },
}));

const profile = (over) => ({
  id: 1, name: "עסק", city: null, lat: null, lng: null, phone: null, instagram: null,
  categories: [], images: [], delivery_areas: [], kind: "business", ...over,
});

describe("dashboard home — «מה חדש» and welcome placement (MEH-3200)", () => {
  beforeEach(() => window.localStorage.clear());

  it("old business: the «מה חדש» card and row, no welcome", async () => {
    profileState.value = profile({ created_at: new Date(Date.now() - 400 * DAY).toISOString() });
    render(<ProducerDashboardPage />);
    expect(await screen.findByTestId("whats-new-card")).toBeInTheDocument();
    expect(screen.getByTestId("whats-new-row")).toBeInTheDocument();
    expect(screen.queryByTestId("owner-welcome")).toBeNull();
  });

  it("new business: the welcome card takes the slot, never both", async () => {
    profileState.value = profile({ created_at: new Date().toISOString() });
    render(<ProducerDashboardPage />);
    expect(await screen.findByTestId("owner-welcome")).toBeInTheDocument();
    expect(screen.queryByTestId("whats-new-card")).toBeNull();
    expect(screen.getByTestId("whats-new-row")).toBeInTheDocument();
  });

  it("organizer: neither card nor row", async () => {
    profileState.value = profile({ kind: "organizer", created_at: new Date().toISOString() });
    render(<ProducerDashboardPage />);
    await screen.findByTestId("dashboard-help-cta");
    // Let /producers/me (kind: organizer) resolve and render before asserting absence.
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(api.get).toHaveBeenCalledWith("/producers/me");
    expect(screen.queryByTestId("whats-new-card")).toBeNull();
    expect(screen.queryByTestId("owner-welcome")).toBeNull();
    expect(screen.queryByTestId("whats-new-row")).toBeNull();
  });
});
