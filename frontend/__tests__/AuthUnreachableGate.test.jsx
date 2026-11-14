/**
 * MEH-3172 — a stored token whose /auth/me never answered is not "signed out".
 *
 * Before: /admin and /producer/dashboard read `!loading && !user` as signed
 * out and pushed /login. A 502, a redeploy, or a request aborted by a
 * navigation therefore sent a logged-in admin to the login page (seen on
 * WebKit, MEH-3153). Now that state renders a retry in place and pushes
 * nothing; a real sign-out (no token, or a 401) still redirects.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const apiMock = vi.hoisted(() => ({ get: vi.fn(() => Promise.resolve({ data: { stats: {} } })) }));
vi.mock("@/lib/api", () => ({ default: apiMock }));
const authState = vi.hoisted(() => ({
  user: null,
  authUnreachable: false,
  retrySession: vi.fn(),
  logout: vi.fn(),
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ ...authState, loading: false }),
}));
const push = vi.hoisted(() => vi.fn());
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, prefetch, ...p }) => <a href={typeof href === "string" ? href : href?.pathname} {...p}>{children}</a>,
  usePathname: () => "/admin",
  useRouter: () => ({ push, replace: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...p }) => <a href={typeof href === "string" ? href : "#"} {...p}>{children}</a>,
}));
vi.mock("next-intl", () => ({
  useTranslations: (scope) => (key) => (scope ? `${scope}.${key}` : key),
  useLocale: () => "he",
}));

import AdminLayout from "@/app/[locale]/admin/AdminLayoutClient";
import DashboardLayout from "@/app/[locale]/producer/dashboard/DashboardLayoutClient";

const LAYOUTS = [
  ["/admin", AdminLayout],
  ["/producer/dashboard", DashboardLayout],
];

describe("MEH-3172 /auth/me unreachable ≠ signed out", () => {
  beforeEach(() => {
    push.mockClear();
    authState.retrySession.mockClear();
    authState.user = null;
    authState.authUnreachable = false;
  });

  for (const [name, Layout] of LAYOUTS) {
    it(`${name}: unreachable → a retry in place, no /login push`, () => {
      authState.authUnreachable = true;
      render(<Layout><div data-testid="child" /></Layout>);
      expect(push).not.toHaveBeenCalled();
      const box = screen.getByTestId("auth-unreachable");
      expect(box).toHaveTextContent("error.mapper.network");
      expect(screen.queryByTestId("child")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "error.retry" }));
      expect(authState.retrySession).toHaveBeenCalledTimes(1);
    });

    it(`${name}: signed out (no user, reachable) → still pushes /login`, () => {
      render(<Layout><div /></Layout>);
      expect(push).toHaveBeenCalledTimes(1);
      expect(push.mock.calls[0][0]).toMatch(/^\/login\?redirect=/);
      expect(screen.queryByTestId("auth-unreachable")).toBeNull();
    });
  }
});
