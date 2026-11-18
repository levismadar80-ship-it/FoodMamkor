/**
 * MEH-3200: where «מה חדש» and the welcome card land on the real dashboard home.
 * Page-level cells the component tests cannot reach (fresh reviewer, 14/11):
 *   old business  → «חדש במהמקור» card + row, no welcome
 *   new business  → welcome only (never both in the top slot), row still there
 *   organizer     → neither card nor row
 *   first moment due → its card takes the slot over «מה חדש»; welcome still wins
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
  const user = { id: 1, name: "דנה", role: "producer", producer_id: 1 }; // /auth/me carries producer_id
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
  // MEH-3200 part 2: FirstMomentCard icons (rendered by this file only).
  Star: (p) => <span {...p} />,
  UserPlus: (p) => <span {...p} />,
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
const profileState = vi.hoisted(() => ({ value: {}, analytics: { profile_strength: 0 }, profileDelay: 0, analyticsFailOnce: false }));

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn((url) => {
      if (url === "/producers/me/dashboard") {
        return Promise.resolve({
          data: { producer: { id: 1, name: "עסק", status: "approved", availability_state: "accepting_orders" } },
        });
      }
      if (url === "/producers/me/analytics") {
        if (profileState.analyticsFailOnce) {
          profileState.analyticsFailOnce = false;
          return Promise.reject(new Error("down"));
        }
        return Promise.resolve({ data: profileState.analytics });
      }
      if (url === "/producers/me") {
        return new Promise((r) => setTimeout(() => r({ data: profileState.value }), profileState.profileDelay));
      }
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
  beforeEach(() => {
    window.localStorage.clear();
    profileState.analytics = { profile_strength: 0 };
    profileState.profileDelay = 0;
    profileState.analyticsFailOnce = false;
  });

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

  it("first moment due (part 2): its card takes the slot over «מה חדש»", async () => {
    // A previous visit stored 0 reviews; now there is 1.
    window.localStorage.setItem("mehamakor.first_moments.1", JSON.stringify({ baseline: { first_review: 0 }, done: [] }));
    profileState.analytics = { profile_strength: 0, total_reviews: 1 };
    profileState.value = profile({ created_at: new Date(Date.now() - 400 * DAY).toISOString() });
    render(<ProducerDashboardPage />);
    expect(await screen.findByTestId("first-moment")).toHaveAttribute("data-moment", "first_review");
    expect(screen.queryByTestId("whats-new-card")).toBeNull();
  });

  it("first moment due for a new business: the welcome card still wins", async () => {
    window.localStorage.setItem("mehamakor.first_moments.1", JSON.stringify({ baseline: { first_review: 0 }, done: [] }));
    profileState.analytics = { profile_strength: 0, total_reviews: 1 };
    profileState.value = profile({ created_at: new Date().toISOString() });
    render(<ProducerDashboardPage />);
    expect(await screen.findByTestId("owner-welcome")).toBeInTheDocument();
    expect(screen.queryByTestId("first-moment")).toBeNull();
  });

  it("new business, moment due, profile slower than analytics: the moment card never mounts", async () => {
    window.localStorage.setItem("mehamakor.first_moments.1", JSON.stringify({ baseline: { first_review: 0 }, done: [] }));
    profileState.analytics = { profile_strength: 0, total_reviews: 1 };
    profileState.value = profile({ created_at: new Date().toISOString() });
    profileState.profileDelay = 60;
    const mounted = new Set();
    // Read the mutation RECORDS, not the DOM: a card mounted and replaced
    // within one task is gone from the DOM by the time the callback runs.
    const obs = new MutationObserver((records) => {
      for (const rec of records) {
        for (const node of rec.addedNodes) {
          if (node.nodeType !== 1) continue;
          for (const id of ["first-moment", "whats-new-card", "owner-welcome"]) {
            if (node.matches(`[data-testid="${id}"]`) || node.querySelector(`[data-testid="${id}"]`)) mounted.add(id);
          }
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    render(<ProducerDashboardPage />);
    expect(await screen.findByTestId("owner-welcome")).toBeInTheDocument();
    obs.disconnect();
    expect([...mounted]).toEqual(["owner-welcome"]);
  });

  it("analytics failed when the slot opened: a moment found after retry waits (no swap)", async () => {
    window.localStorage.setItem("mehamakor.first_moments.1", JSON.stringify({ baseline: { first_review: 0 }, done: [] }));
    profileState.analytics = { profile_strength: 0, total_reviews: 1 };
    profileState.analyticsFailOnce = true;
    profileState.value = profile({ created_at: new Date(Date.now() - 400 * DAY).toISOString() });
    render(<ProducerDashboardPage />);
    expect(await screen.findByTestId("whats-new-card")).toBeInTheDocument();
    const retry = screen.getAllByRole("button", { name: "section_errors.retry_cta" });
    await act(async () => { retry[retry.length - 1].click(); await new Promise((r) => setTimeout(r, 30)); });
    expect(api.get.mock.calls.filter(([u]) => u === "/producers/me/analytics").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByTestId("first-moment")).toBeNull();
    expect(screen.getByTestId("whats-new-card")).toBeInTheDocument();
  });

  it("organizer with counts: no moment card, and nothing stored for moments", async () => {
    profileState.analytics = { profile_strength: 0, total_reviews: 1 };
    profileState.value = profile({ kind: "organizer", created_at: new Date(Date.now() - 400 * DAY).toISOString() });
    render(<ProducerDashboardPage />);
    await screen.findByTestId("dashboard-help-cta");
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(screen.queryByTestId("first-moment")).toBeNull();
    expect(Object.keys(window.localStorage).filter((k) => k.startsWith("mehamakor.first_moments"))).toEqual([]);
  });

  it("storage that throws: the home renders, the «מה חדש» card still shows", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    profileState.value = profile({ created_at: new Date(Date.now() - 400 * DAY).toISOString() });
    render(<ProducerDashboardPage />);
    expect(await screen.findByTestId("whats-new-card")).toBeInTheDocument();
    expect(screen.queryByTestId("first-moment")).toBeNull();
    vi.restoreAllMocks();
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
