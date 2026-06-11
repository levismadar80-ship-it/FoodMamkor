import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
  useAuth: () => ({ user: userRef.current, logout: vi.fn() }),
}));

// MEH-471: BottomNav reads useTranslations() from next-intl directly.
// MEH-789: 4 destinations (discover/map/about + account sheet) — labels
// updated from the old 3-tab discover/map/profile nav.
vi.mock("next-intl", () => ({
  useTranslations: () => (key) =>
    ({
      "nav.discover": "גלו",
      "nav.map": "מפה",
      "nav.about": "אודות",
      "nav.account": "חשבון",
      "nav.mobile_label": "ניווט מובייל",
      "account.menu.aria": "תפריט חשבון",
    }[key] || key),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// MEH-789: the new pill imports Compass/MapTrifold/Flower for the three
// destinations + User for the logged-out account tab.
vi.mock("@phosphor-icons/react", () => ({
  Compass: (props) => <span data-testid="icon-compass" {...props} />,
  MapTrifold: (props) => <span data-testid="icon-map" {...props} />,
  Flower: (props) => <span data-testid="icon-flower" {...props} />,
  User: (props) => <span data-testid="icon-user" {...props} />,
}));

// The account tab toggles AccountSheet — stub it so this suite stays scoped to
// BottomNav's own structure (the sheet has its own focus/close tests).
vi.mock("@/components/AccountSheet", () => ({
  default: ({ open }) => (open ? <div data-testid="account-sheet" /> : null),
}));
vi.mock("@/components/OnboardingTip", () => ({ default: () => null }));
vi.mock("@/lib/use-onboarding", () => ({
  useOnboarding: () => ({ step: 0, advance: vi.fn(), dismiss: vi.fn() }),
}));

describe("BottomNav", () => {
  beforeEach(() => {
    pathnameRef.current = "/";
    userRef.current = null;
  });

  // MEH-789: 3 destination links (discover/map/about) + an account *button*
  // (toggles the sheet, not a route). The component is the source of truth.
  it("renders exactly 3 destination links in order: Discover / Map / About", () => {
    render(<BottomNav />);
    const labels = screen.getAllByRole("link").map((a) => a.textContent);
    expect(labels).toEqual(["גלו", "מפה", "אודות"]);
  });

  it("links point to /, /map, /about", () => {
    render(<BottomNav />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/", "/map", "/about"]);
  });

  it("does NOT render an events or favorites link", () => {
    render(<BottomNav />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).not.toContain("/events");
    expect(hrefs).not.toContain("/favorites");
  });

  it("account tab is a dialog-toggle button, not a route", () => {
    render(<BottomNav />);
    const account = screen.getByRole("button");
    expect(account).toHaveAttribute("aria-haspopup", "dialog");
    expect(account).toHaveAttribute("aria-expanded", "false");
    // It is not one of the navigation links.
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).not.toContain("/account");
  });

  it("clicking the account tab opens the account sheet", () => {
    render(<BottomNav />);
    expect(screen.queryByTestId("account-sheet")).toBeNull();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("account-sheet")).toBeInTheDocument();
  });

  it("marks the active tab with aria-current on /map", () => {
    pathnameRef.current = "/map";
    render(<BottomNav />);
    const active = screen.getByRole("link", { name: /מפה/ });
    expect(active).toHaveAttribute("aria-current", "page");
  });

  it("shows the user's initial on the account tab when logged in", () => {
    userRef.current = { id: "u1", name: "דנה" };
    render(<BottomNav />);
    // Avatar initial replaces the User glyph; the label stays "חשבון".
    expect(screen.getByText("ד")).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAttribute("aria-haspopup", "dialog");
  });
});
