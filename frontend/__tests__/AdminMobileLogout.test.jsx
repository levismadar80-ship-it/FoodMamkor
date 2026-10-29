import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// MEH-2533: below md the header avatar menu is hidden and BottomNav is gated
// off /admin (MEH-2359), so the admin layout carries its own «התנתקות» —
// the MEH-2490 pattern from the owner dashboard (#3783).

const apiMock = vi.hoisted(() => ({ get: vi.fn(() => Promise.resolve({ data: { stats: {} } })) }));
vi.mock("@/lib/api", () => ({ default: apiMock }));
const authState = vi.hoisted(() => ({ user: null, logout: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: authState.user, loading: false, logout: authState.logout }),
}));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => "/admin" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...p }) => <a href={typeof href === "string" ? href : "#"} {...p}>{children}</a>,
}));
vi.mock("next-intl", () => ({
  useTranslations: (scope) => (key) => (scope ? `${scope}.${key}` : key),
  useLocale: () => "he",
}));

import AdminLayout from "@/app/[locale]/admin/layout";

describe("MEH-2533 logout on the mobile admin", () => {
  beforeEach(() => authState.logout.mockClear());

  it("an admin gets a md:hidden logout with the shared key, and it logs out", () => {
    authState.user = { id: "a1", role: "admin", name: "ספיר" };
    render(<AdminLayout><div /></AdminLayout>);
    const btn = screen.getByTestId("admin-mobile-logout");
    expect(btn).toHaveTextContent("account.menu.logout");
    expect(btn.parentElement.className).toContain("md:hidden");
    fireEvent.click(btn);
    expect(authState.logout).toHaveBeenCalledTimes(1);
  });

  it("the access-denied state has no logout button", () => {
    authState.user = { id: "c1", role: "consumer" };
    render(<AdminLayout><div /></AdminLayout>);
    expect(screen.getByTestId("access-denied")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-mobile-logout")).toBeNull();
  });
});
