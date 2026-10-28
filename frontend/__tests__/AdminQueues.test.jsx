import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QUEUES, queueCount, visibleQueues } from "@/app/[locale]/admin/queues";

/**
 * MEH-2399 — the queue filter the admin sidebar + home share (admin/queues.js),
 * and the one-fetch contract between admin/layout.js and admin/page.js.
 *
 * Each `visibleQueues` case is named after the input it covers. A count of 0
 * is the only input that hides a queue; every "unknown" spelling (no stats,
 * fetch failed, key missing) keeps it visible (MEH-2096: unknown ≠ empty).
 */

const byKey = (key) => QUEUES.find((q) => q.key === key);
const ZERO = Object.fromEntries(QUEUES.map((q) => [q.stat, 0]));
const keysOf = (list) => list.map((q) => q.key);

describe("queueCount", () => {
  it("a number → that number (0 included)", () => {
    expect(queueCount({ pending_kashrut_requests: 3 }, byKey("kashrut"))).toBe(3);
    expect(queueCount({ pending_kashrut_requests: 0 }, byKey("kashrut"))).toBe(0);
  });
  it("stats null → null", () => {
    expect(queueCount(null, byKey("kashrut"))).toBeNull();
  });
  it("key missing → null, not 0", () => {
    expect(queueCount({}, byKey("kashrut"))).toBeNull();
  });
  it("a non-number value (string \"3\", null) → null", () => {
    expect(queueCount({ pending_kashrut_requests: "3" }, byKey("kashrut"))).toBeNull();
    expect(queueCount({ pending_kashrut_requests: null }, byKey("kashrut"))).toBeNull();
  });
});

describe("visibleQueues", () => {
  it("all counts 0 → only the always-on reports queue", () => {
    expect(keysOf(visibleQueues(ZERO))).toEqual(["reports"]);
  });
  it("kashrut 2, rest 0 → reports + kashrut", () => {
    expect(keysOf(visibleQueues({ ...ZERO, pending_kashrut_requests: 2 }))).toEqual(["reports", "kashrut"]);
  });
  it("stats null (not loaded) → every queue", () => {
    expect(keysOf(visibleQueues(null))).toEqual(keysOf(QUEUES));
  });
  it("countsError with zero stats → every queue", () => {
    expect(keysOf(visibleQueues(ZERO, true))).toEqual(keysOf(QUEUES));
  });
  it("recipes key missing, rest 0 → reports + recipes", () => {
    const { recipes_awaiting_review, ...rest } = ZERO;
    expect(recipes_awaiting_review).toBe(0);
    expect(keysOf(visibleQueues(rest))).toEqual(["reports", "recipes"]);
  });
  it("standing on /admin/recipes with recipes 0 → recipes stays listed", () => {
    const isActive = (href) => href === "/admin/recipes";
    expect(keysOf(visibleQueues(ZERO, false, isActive))).toEqual(["reports", "recipes"]);
  });
});

// ── layout + home: one /admin/dashboard request per navigation ───────────────

const DASHBOARD = {
  stats: { ...ZERO, pending_producers: 1 },
  pending_producers: [{ id: "p1", name: "חוות האגס", city: "כפר סבא" }],
};

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: apiMock }));

const nav = vi.hoisted(() => ({ pathname: "/admin" }));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "a1", role: "admin" }, loading: false }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...p }) => <a href={typeof href === "string" ? href : "#"} {...p}>{children}</a>,
}));
vi.mock("next-intl", () => ({
  useTranslations: (scope) => (key) => (scope ? `${scope}.${key}` : key),
  useLocale: () => "he",
}));

describe("admin layout + home share one /admin/dashboard fetch (MEH-2399)", () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.get.mockImplementation(() => Promise.resolve({ data: DASHBOARD }));
    nav.pathname = "/admin";
  });

  const dashboardCalls = () => apiMock.get.mock.calls.filter(([url]) => url === "/admin/dashboard").length;

  it("landing on /admin → exactly 1 request, and the home renders its data", async () => {
    const { default: AdminLayout } = await import("@/app/[locale]/admin/layout");
    const { default: AdminHome } = await import("@/app/[locale]/admin/page");
    render(<AdminLayout><AdminHome /></AdminLayout>);
    expect(await screen.findByText("חוות האגס")).toBeInTheDocument();
    expect(dashboardCalls()).toBe(1);
  });

  it("navigating /admin → /admin/kashrut → 2 requests total (one per navigation)", async () => {
    const { default: AdminLayout } = await import("@/app/[locale]/admin/layout");
    const { default: AdminHome } = await import("@/app/[locale]/admin/page");
    const { rerender } = render(<AdminLayout><AdminHome /></AdminLayout>);
    await screen.findByText("חוות האגס");
    nav.pathname = "/admin/kashrut";
    await act(async () => {
      rerender(<AdminLayout><div>kashrut page</div></AdminLayout>);
    });
    await waitFor(() => expect(dashboardCalls()).toBe(2));
  });

  it("a failed fetch → the home shows the error line, the request is not retried by the page", async () => {
    apiMock.get.mockImplementation(() => Promise.reject({ response: { status: 500, data: {} } }));
    const { default: AdminLayout } = await import("@/app/[locale]/admin/layout");
    const { default: AdminHome } = await import("@/app/[locale]/admin/page");
    render(<AdminLayout><AdminHome /></AdminLayout>);
    expect(await screen.findByText("admin.common.error_loading")).toBeInTheDocument();
    expect(dashboardCalls()).toBe(1);
  });
});
