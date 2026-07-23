import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import AdminDashboard from "@/app/[locale]/admin/page";

// MEH-1267: the group-buys dashboard card binds the real total_group_buys
// stat — the hardcoded "›" placeholder is gone.

const DASHBOARD = {
  stats: {
    total_producers: 12,
    pending_producers: 0,
    total_users: 40,
    total_group_buys: 7,
    open_reports: 0,
    new_users_this_week: 0,
    new_producers_this_week: 0,
    total_events: 0,
    total_experiences: 0,
  },
  monthly_producers: [],
  pending_producers: [],
  recent_activity: [],
  daily_active_users: [],
  top_cities: [],
};

const apiMock = vi.hoisted(() => ({
  get: vi.fn(() => Promise.resolve({ data: DASHBOARD })),
  post: vi.fn(() => Promise.resolve({ data: {} })),
}));
vi.mock("@/lib/api", () => ({ default: apiMock }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...p }) => <a href={typeof href === "string" ? href : "#"} {...p}>{children}</a>,
}));

vi.mock("next-intl", () => {
  const flat = {
    "admin.dashboard.stats.group_buys": "קבוצות רכש",
    "admin.dashboard.stats.group_buys_tooltip": "ניהול קבוצות רכש",
    "admin.dashboard.stats.group_buys_tooltip_label": "מידע",
  };
  const resolve = (fullKey, values) => {
    const raw = flat[fullKey] ?? fullKey;
    if (!values || Object.keys(values).length === 0) return raw;
    let s = raw;
    for (const [k, v] of Object.entries(values)) s = s.replaceAll(`{${k}}`, v);
    return s;
  };
  return {
    useTranslations: (scope) => (key, values = {}) =>
      resolve(scope ? `${scope}.${key}` : key, values),
    useLocale: () => "he",
  };
});

describe("AdminDashboard — group-buys stat card (MEH-1267)", () => {
  beforeEach(() => apiMock.get.mockClear());

  it("renders the numeric group-buys stat and not the '›' placeholder", async () => {
    render(<AdminDashboard />);
    // group-buys label + its real value render once data resolves.
    expect(await screen.findByText("קבוצות רכש")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    // the hardcoded placeholder is gone.
    expect(screen.queryByText("›")).not.toBeInTheDocument();
  });
});
