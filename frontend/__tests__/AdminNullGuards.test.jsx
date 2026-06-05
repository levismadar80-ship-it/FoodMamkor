/**
 * MEH-147: Regression tests — admin pages must not crash when the API
 * returns null/undefined for optional array fields, and must show an
 * empty state instead of a blank section.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// ── Shared icon mock ────────────────────────────────────────────────────────
vi.mock("@phosphor-icons/react", () => ({
  CalendarBlank: (p) => <span {...p} />,
  CookingPot: (p) => <span {...p} />,
  Cow: (p) => <span {...p} />,
  Heart: (p) => <span {...p} />,
  HourglassSimple: (p) => <span {...p} />,
  Leaf: (p) => <span {...p} />,
  Package: (p) => <span {...p} />,
  Seal: (p) => <span {...p} />,
  Sparkle: (p) => <span {...p} />,
  Star: (p) => <span {...p} />,
  Storefront: (p) => <span {...p} />,
  Trash: (p) => <span {...p} />,
  Truck: (p) => <span {...p} />,
  Users: (p) => <span {...p} />,
  Warning: (p) => <span {...p} />,
}));

// MEH-475 PR-A1: admin/page now reads useTranslations() from next-intl.
// Identity mock — tests assert on null-guard behavior, not copy.
vi.mock("next-intl", () => ({
  useTranslations: () => (key, values = {}) => {
    if (values && Object.keys(values).length > 0) {
      let s = key;
      for (const [k, v] of Object.entries(values)) s = s.replaceAll(`{${k}}`, v);
      return s;
    }
    return key;
  },
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// ── API mock ─────────────────────────────────────────────────────────────────
const apiResponseRef = { current: { data: null } };
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(() => Promise.resolve(apiResponseRef.current)),
    post: vi.fn(() => Promise.resolve({})),
    put: vi.fn(() => Promise.resolve({})),
    delete: vi.fn(() => Promise.resolve({})),
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────
const minDashboard = (overrides = {}) => ({
  stats: {
    total_producers: 10,
    pending_producers: 0,
    total_users: 50,
    total_home_products: 5,
    open_reports: 0,
    hidden_home_products: 0,
    new_users_this_week: 3,
    new_producers_this_week: 1,
    total_events: 2,
    total_experiences: 1,
  },
  monthly_producers: [],
  pending_producers: null,   // ← null — the old code would crash here
  recent_activity: null,     // ← null
  daily_active_users: [],
  top_cities: [],
  server_health: null,
  ...overrides,
});

const minAnalytics = (overrides = {}) => ({
  monthly: [],
  by_category: [],
  by_city: null,        // ← null
  top_producers: null,  // ← null
  map_points: null,     // ← null
  ...overrides,
});

// ── AdminDashboard (admin/page.js) ───────────────────────────────────────────
describe("AdminDashboard — null array guards (MEH-147)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders without crash when pending_producers and recent_activity are null", async () => {
    apiResponseRef.current = { data: minDashboard() };
    const { default: AdminDashboard } = await import("@/app/[locale]/admin/page");
    render(<AdminDashboard />);
    // MEH-729: admin/page migrated to next-intl (MEH-475); the identity mock
    // above renders the i18n *key*, so assert on keys, not the Hebrew literals.
    await waitFor(() => expect(screen.getByText("dashboard.title")).toBeInTheDocument());
    expect(screen.getByText("dashboard.pending_panel.empty")).toBeInTheDocument();
    expect(screen.getByText("dashboard.activity.empty")).toBeInTheDocument();
  });

  it("renders pending list when pending_producers is a non-empty array", async () => {
    apiResponseRef.current = {
      data: minDashboard({
        pending_producers: [{ id: "p1", name: "חוות האגס", city: "כפר סבא" }],
        recent_activity: [],
      }),
    };
    const { default: AdminDashboard } = await import("@/app/[locale]/admin/page");
    render(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText("חוות האגס")).toBeInTheDocument());
  });
});

// ── AdminAnalyticsPage (admin/analytics/page.js) ────────────────────────────
describe("AdminAnalyticsPage — null array guards (MEH-147)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders without crash when by_city, top_producers, and map_points are null", async () => {
    apiResponseRef.current = { data: minAnalytics() };
    const { default: AdminAnalyticsPage } = await import("@/app/[locale]/admin/analytics/page");
    render(<AdminAnalyticsPage />);
    await waitFor(() => expect(screen.getByText("analytics.title")).toBeInTheDocument());
    // All three null arrays should render the empty state (MEH-729: identity
    // mock → key; top_cities/top_producers/geographic share analytics.no_data_display).
    const emptyMsgs = screen.getAllByText("analytics.no_data_display");
    expect(emptyMsgs.length).toBeGreaterThanOrEqual(2);
  });

  it("renders top cities list when by_city is a non-empty array", async () => {
    apiResponseRef.current = {
      data: minAnalytics({
        by_city: [{ city: "תל אביב", count: 20 }, { city: "ירושלים", count: 15 }],
        top_producers: [],
        map_points: [],
      }),
    };
    const { default: AdminAnalyticsPage } = await import("@/app/[locale]/admin/analytics/page");
    render(<AdminAnalyticsPage />);
    await waitFor(() => expect(screen.getByText("תל אביב")).toBeInTheDocument());
    expect(screen.getByText("ירושלים")).toBeInTheDocument();
  });
});

// ── AdminContentPage — CategoriesEditor (admin/content/page.js) ─────────────
describe("CategoriesEditor — empty state (MEH-147)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("shows empty state text when category list is empty", async () => {
    apiResponseRef.current = { data: [] };
    const { default: AdminContentPage } = await import("@/app/[locale]/admin/content/page");
    render(<AdminContentPage />);
    await waitFor(() =>
      // MEH-729: content/page migrated to next-intl; identity mock → key.
      expect(screen.getByText("content.categories.empty")).toBeInTheDocument(),
    );
  });

  it("renders category rows when list is non-empty", async () => {
    apiResponseRef.current = {
      data: [{ id: 1, name: "חלב ומוצריו", emoji: "🥛" }],
    };
    const { default: AdminContentPage } = await import("@/app/[locale]/admin/content/page");
    render(<AdminContentPage />);
    await waitFor(() =>
      expect(screen.getByDisplayValue("חלב ומוצריו")).toBeInTheDocument(),
    );
  });
});
