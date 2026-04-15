import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import BottomNav from "@/components/BottomNav";

const pathnameRef = { current: "/" };
vi.mock("next/navigation", () => ({
  usePathname: () => pathnameRef.current,
}));

const userRef = { current: null };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: userRef.current }),
}));

vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({
    t: (key) =>
      ({
        nav_discover: "גלה",
        nav_map: "מפה",
        nav_neighbor: "מהשכן",
        nav_profile: "פרופיל",
        nav_mobile_label: "ניווט מובייל",
      }[key] || key),
  }),
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

  it("renders exactly 4 tabs in order: גלה / מפה / מהשכן / פרופיל", () => {
    render(<BottomNav />);
    const labels = screen.getAllByRole("link").map((a) => a.textContent);
    expect(labels).toEqual(["גלה", "מפה", "מהשכן", "פרופיל"]);
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
