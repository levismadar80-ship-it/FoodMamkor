import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import BottomNav from "@/components/BottomNav";

const pathnameRef = { current: "/" };
// MEH-729: BottomNav reads usePathname from the next-intl wrapper
// `@/i18n/navigation`, not `next/navigation`. Mocking the wrapper directly
// avoids loading next-intl's createNavigation (which fails to resolve
// `next/navigation` under the vitest ESM resolver).
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => pathnameRef.current,
}));

const userRef = { current: null };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: userRef.current }),
}));

// MEH-471: BottomNav reads useTranslations() from next-intl directly.
vi.mock("next-intl", () => ({
  useTranslations: () => (key) =>
    ({
      "nav.discover": "גלה",
      "nav.map": "מפה",
      "nav.neighbor": "מהשכן",
      "nav.profile": "פרופיל",
      "nav.mobile_label": "ניווט מובייל",
    }[key] || key),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@phosphor-icons/react", () => ({
  House: (props) => <span data-testid="icon-house" {...props} />,
  MapTrifold: (props) => <span data-testid="icon-map" {...props} />,
  CookingPot: (props) => <span data-testid="icon-pot" {...props} />,
  UserCircle: (props) => <span data-testid="icon-user" {...props} />,
}));

describe("BottomNav", () => {
  beforeEach(() => {
    pathnameRef.current = "/";
    userRef.current = null;
  });

  // MEH-729: the "מהשכן" (neighbor) tab was dropped from BottomNav
  // (components/BottomNav.jsx:42-47 now lists only discover/map/profile).
  // Updated to the current 3-tab nav (component = source of truth).
  it("renders exactly 3 tabs in order: גלה / מפה / פרופיל", () => {
    render(<BottomNav />);
    const labels = screen.getAllByRole("link").map((a) => a.textContent);
    expect(labels).toEqual(["גלה", "מפה", "פרופיל"]);
  });

  it("does NOT render an events or favorites link", () => {
    render(<BottomNav />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).not.toContain("/events");
    expect(hrefs).not.toContain("/favorites");
  });

  it("profile tab routes to /login when logged out", () => {
    render(<BottomNav />);
    const profileLink = screen.getByRole("link", { name: /פרופיל/ });
    expect(profileLink).toHaveAttribute("href", "/login");
  });

  it("profile tab routes to /settings when logged in", () => {
    userRef.current = { id: "u1", name: "דנה" };
    render(<BottomNav />);
    const profileLink = screen.getByRole("link", { name: /פרופיל/ });
    expect(profileLink).toHaveAttribute("href", "/settings");
  });

  it("marks the active tab with aria-current on /map", () => {
    pathnameRef.current = "/map";
    render(<BottomNav />);
    const active = screen.getByRole("link", { name: /מפה/ });
    expect(active).toHaveAttribute("aria-current", "page");
  });

  it("marks the profile tab active on /settings", () => {
    userRef.current = { id: "u1", name: "דנה" };
    pathnameRef.current = "/settings";
    render(<BottomNav />);
    const active = screen.getByRole("link", { name: /פרופיל/ });
    expect(active).toHaveAttribute("aria-current", "page");
  });
});
