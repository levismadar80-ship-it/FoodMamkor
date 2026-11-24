/**
 * MEH-3818 — admin screens appear once, instead of filling in under the admin.
 *
 * Measured on a throttled phone before the fix:
 *  - /admin/producers opened with an EMPTY table («אין עסקים…») and then
 *    filled it, which also inserted the SLA line above the toolbar (0.04
 *    shift). For that beat the queue read "nothing to approve".
 *  - the phone nav strip showed its fixed tabs first and inserted the queue
 *    tabs among them when the counts arrived, pushing the rest aside (part of
 *    the 0.09 on /admin, with the logout button: AdminMobileLogout.test.jsx).
 *
 * Each case holds the read open, checks what is on screen meanwhile, then lets
 * it answer.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ProducersPage from "@/app/[locale]/admin/producers/page";
import AdminLayout from "@/app/[locale]/admin/AdminLayoutClient";
import { QUEUES } from "@/app/[locale]/admin/queues";

const nav = vi.hoisted(() => ({ pathname: "/admin/producers" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => `/he${nav.pathname}`,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, prefetch, ...p }) => <a href={typeof href === "string" ? href : "#"} {...p}>{children}</a>,
  usePathname: () => nav.pathname,
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "a1", role: "admin", name: "ספיר" }, loading: false, logout: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const EMPTY = he.admin.producers.table.empty;
const intl = (ui) => (
  <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>{ui}</NextIntlClientProvider>
);

let release;
const held = () => new Promise((r) => { release = r; });

beforeEach(() => {
  vi.clearAllMocks();
  nav.pathname = "/admin/producers";
});

describe("MEH-3818 — /admin/producers", () => {
  it("shows the skeleton, not an empty table, until the list answers", async () => {
    api.get.mockImplementation((url) => (url === "/admin/producers" ? held() : Promise.resolve({ data: [] })));
    render(intl(<ProducersPage />));
    await act(async () => {});
    expect(screen.queryByText(EMPTY)).toBeNull();
    expect(screen.queryByTestId("admin-freshness-stale-toggle")).toBeNull();

    await act(async () => release({ data: [] }));
    expect(await screen.findByTestId("admin-freshness-stale-toggle")).toBeInTheDocument();
    expect(screen.getByText(EMPTY)).toBeInTheDocument();
  });

  it("a failed first read still shows the page, with its error", async () => {
    api.get.mockImplementation((url) =>
      url === "/admin/producers" ? Promise.reject(new Error("down")) : Promise.resolve({ data: [] }),
    );
    render(intl(<ProducersPage />));
    expect(await screen.findByTestId("admin-freshness-stale-toggle")).toBeInTheDocument();
    expect(screen.queryByText(EMPTY)).toBeNull();
  });
});

describe("MEH-3818 — the phone nav strip", () => {
  const stripLinks = () =>
    [...document.querySelectorAll("div.md\\:hidden nav a")].map((a) => a.getAttribute("href"));
  const placeholder = () => document.querySelector("div.md\\:hidden nav span[aria-hidden='true']");

  it("holds its height with a hidden placeholder, then shows its tabs with the queue tabs already in place", async () => {
    api.get.mockImplementation(() => held());
    render(intl(<AdminLayout><div /></AdminLayout>));
    await act(async () => {});
    expect(stripLinks()).toEqual([]);
    expect(placeholder()).not.toBeNull();

    await act(async () => release({ data: { stats: { ...Object.fromEntries(QUEUES.map((q) => [q.stat, 0])), pending_kashrut_requests: 1 } } }));
    const links = stripLinks();
    expect(links).toContain("/admin/kashrut");
    expect(links).not.toContain("/admin/category-requests");
    expect(links).toContain("/admin/settings");
    expect(placeholder()).toBeNull();
  });

  it("a failed first read still shows the tabs and the home's logout", async () => {
    nav.pathname = "/admin";
    api.get.mockImplementation(() => Promise.reject(new Error("down")));
    render(intl(<AdminLayout><div /></AdminLayout>));
    expect(await screen.findByTestId("admin-mobile-logout")).toBeInTheDocument();
    expect(stripLinks()).toContain("/admin/settings");
  });

  it("keeps its tabs while a refetch after a failure is in flight", async () => {
    api.get.mockImplementation(() => Promise.reject(new Error("down")));
    const { rerender } = render(intl(<AdminLayout><div /></AdminLayout>));
    await act(async () => {});
    expect(stripLinks()).toContain("/admin/settings");

    api.get.mockImplementation(() => held());
    nav.pathname = "/admin/settings";
    rerender(intl(<AdminLayout><div /></AdminLayout>));
    await act(async () => {});
    expect(api.get).toHaveBeenLastCalledWith("/admin/dashboard");
    expect(stripLinks()).toContain("/admin/settings");
    expect(placeholder()).toBeNull();
  });

  it("shows its tabs after 2.5 s when the counts never answer", async () => {
    vi.useFakeTimers();
    try {
      api.get.mockImplementation(() => new Promise(() => {}));
      render(intl(<AdminLayout><div /></AdminLayout>));
      await act(async () => {});
      expect(stripLinks()).toEqual([]);
      await act(async () => { vi.advanceTimersByTime(2499); });
      expect(stripLinks()).toEqual([]);
      await act(async () => { vi.advanceTimersByTime(1); });
      expect(stripLinks()).toContain("/admin/settings");
    } finally {
      vi.useRealTimers();
    }
  });
});
