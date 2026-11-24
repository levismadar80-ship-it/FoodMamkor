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

  it("shows its tabs once, with the queue tabs already in place", async () => {
    api.get.mockImplementation(() => held());
    render(intl(<AdminLayout><div /></AdminLayout>));
    await act(async () => {});
    expect(stripLinks()).toEqual([]);

    await act(async () => release({ data: { stats: { pending_producers: 2, pending_reviews: 3 } } }));
    const links = stripLinks();
    expect(links).toContain("/admin/producers");
    expect(links).toContain("/admin/settings");
    expect(links.length).toBeGreaterThan(2);
  });
});
