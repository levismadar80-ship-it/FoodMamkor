import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Header from "@/components/Header";

const mockLogout = vi.fn();
const userRef = { current: null };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: userRef.current, logout: mockLogout }),
}));

// MEH-29: Header now reads usePathname() for active-link state +
// transparent-on-homepage logic. Default to /about so existing
// assertions don't fight the transparent-on-/ rendering; individual
// suites can swap to "/" to test homepage behavior.
const pathnameRef = { current: "/about" };
vi.mock("next/navigation", () => ({
  usePathname: () => pathnameRef.current,
}));

const setLang = vi.fn();
vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({
    lang: "he",
    setLang,
    t: (key) =>
      ({
        nav_discover: "גלה",
        nav_map: "מפה",
        nav_neighbor: "מהשכן",
        nav_about: "אודות",
        nav_login: "כניסה לחשבון",
        nav_logout: "התנתק",
        nav_add_business: "הוסיפי את העסק שלך",
        nav_favorites: "מועדפים",
        nav_admin: "אדמין",
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

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt, ...props }) => <img src={src} alt={alt} {...props} />,
}));

vi.mock("@phosphor-icons/react", () => ({
  Heart: (props) => <span data-testid="icon-heart" {...props} />,
  List: (props) => <span data-testid="icon-hamburger" {...props} />,
  X: (props) => <span data-testid="icon-close" {...props} />,
}));

describe("Header", () => {
  beforeEach(() => {
    userRef.current = null;
    pathnameRef.current = "/about";
    mockLogout.mockClear();
    setLang.mockClear();
  });

  describe("navigation", () => {
    it("shows exactly 4 desktop nav links: גלה / מפה / מהשכן / אודות", () => {
      render(<Header />);
      // Top-level desktop nav items (use role=link filter to include only hrefs)
      const nav = screen.getAllByRole("link", { name: "גלה" });
      expect(nav.length).toBeGreaterThan(0);
      expect(screen.getAllByRole("link", { name: "מפה" }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("link", { name: "מהשכן" }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("link", { name: "אודות" }).length).toBeGreaterThan(0);
    });

    it("does NOT render an /events link anywhere in the header", () => {
      render(<Header />);
      const eventLinks = screen.queryAllByRole("link").filter((a) =>
        a.getAttribute("href")?.startsWith("/events"),
      );
      expect(eventLinks).toHaveLength(0);
    });
  });

  describe("actions — logged out (MEH-28: desktop shows ONLY login)", () => {
    it("shows the login link in desktop actions", () => {
      render(<Header />);
      expect(screen.getAllByText("כניסה לחשבון").length).toBeGreaterThan(0);
    });

    it("does NOT show add-business CTA in the header chrome (moved to footer)", () => {
      render(<Header />);
      // Drawer is closed by default → add-business should be absent everywhere.
      expect(screen.queryAllByText("הוסיפי את העסק שלך")).toHaveLength(0);
    });

    it("does NOT show the עב/EN language toggle on desktop (drawer-only now)", () => {
      render(<Header />);
      // Drawer is closed by default → toggle should be absent.
      expect(screen.queryAllByLabelText("Switch to English")).toHaveLength(0);
    });

    it("reveals the language toggle inside the opened hamburger drawer", () => {
      render(<Header />);
      fireEvent.click(screen.getByLabelText("פתח תפריט"));
      expect(screen.getByLabelText("Switch to English")).toBeInTheDocument();
    });
  });

  describe("actions — logged in as consumer (MEH-28: desktop shows ONLY {name})", () => {
    beforeEach(() => {
      userRef.current = { id: "u1", name: "דנה", role: "consumer" };
    });

    it("shows the user name in desktop actions (linking to /settings)", () => {
      render(<Header />);
      expect(screen.getAllByText("דנה").length).toBeGreaterThan(0);
    });

    it("does NOT show a logout button in desktop chrome (drawer-only)", () => {
      render(<Header />);
      // Drawer closed → logout button absent everywhere.
      expect(screen.queryAllByText("התנתק")).toHaveLength(0);
    });

    it("does NOT show add-business CTA in desktop chrome (footer-only)", () => {
      render(<Header />);
      expect(screen.queryAllByText("הוסיפי את העסק שלך")).toHaveLength(0);
    });

    it("drawer logout button calls auth.logout", () => {
      render(<Header />);
      fireEvent.click(screen.getByLabelText("פתח תפריט"));
      fireEvent.click(screen.getByText("התנתק"));
      expect(mockLogout).toHaveBeenCalled();
    });
  });

  describe("actions — logged in as producer", () => {
    beforeEach(() => {
      userRef.current = { id: "u1", name: "בעלת חוות", role: "producer" };
    });

    it("HIDES the add-business CTA in the drawer (producer already has one)", () => {
      render(<Header />);
      fireEvent.click(screen.getByLabelText("פתח תפריט"));
      expect(screen.queryAllByText("הוסיפי את העסק שלך")).toHaveLength(0);
    });
  });

  describe("admin", () => {
    beforeEach(() => {
      userRef.current = { id: "u1", name: "אורית", role: "admin" };
    });

    it("does NOT render the admin link in desktop chrome (drawer-only)", () => {
      render(<Header />);
      // While the hamburger drawer is closed, the admin link should not be present.
      expect(screen.queryAllByText("אדמין")).toHaveLength(0);
    });

    it("renders the admin link inside the opened hamburger drawer", () => {
      render(<Header />);
      fireEvent.click(screen.getByLabelText("פתח תפריט"));
      expect(screen.getByText("אדמין")).toBeInTheDocument();
    });
  });

  describe("mobile hamburger drawer", () => {
    it("reveals add-business + nav items when opened, hides them when closed", () => {
      render(<Header />);
      // Drawer closed
      expect(screen.queryByText("הוסיפי את העסק שלך")).toBeNull();
      // Open
      fireEvent.click(screen.getByLabelText("פתח תפריט"));
      expect(screen.getAllByText("גלה").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("הוסיפי את העסק שלך")).toBeInTheDocument();
      // Close
      fireEvent.click(screen.getByLabelText("סגור תפריט"));
      expect(screen.queryByText("הוסיפי את העסק שלך")).toBeNull();
    });
  });

  // MEH-29: active-link tracking via usePathname()
  describe("active nav link (MEH-29)", () => {
    it("marks the homepage link aria-current=page when pathname=/", () => {
      pathnameRef.current = "/";
      render(<Header />);
      const discover = screen.getAllByRole("link", { name: "גלה" });
      // The desktop nav link should carry aria-current="page".
      expect(discover.some((a) => a.getAttribute("aria-current") === "page")).toBe(true);
      // The other nav links should NOT.
      const map = screen.getAllByRole("link", { name: "מפה" });
      expect(map.some((a) => a.getAttribute("aria-current") === "page")).toBe(false);
    });

    it("marks /map active when pathname is /map", () => {
      pathnameRef.current = "/map";
      render(<Header />);
      const map = screen.getAllByRole("link", { name: "מפה" });
      expect(map.some((a) => a.getAttribute("aria-current") === "page")).toBe(true);
    });

    it("uses prefix matching — /map/anything still highlights מפה", () => {
      pathnameRef.current = "/map/123";
      render(<Header />);
      const map = screen.getAllByRole("link", { name: "מפה" });
      expect(map.some((a) => a.getAttribute("aria-current") === "page")).toBe(true);
    });

    it("uses EXACT match for / — does not light up גלה on every page", () => {
      pathnameRef.current = "/about";
      render(<Header />);
      const discover = screen.getAllByRole("link", { name: "גלה" });
      expect(discover.some((a) => a.getAttribute("aria-current") === "page")).toBe(false);
    });
  });

  // MEH-29: transparent-on-homepage state
  describe("transparent on homepage hero (MEH-29)", () => {
    it("renders transparent header on / before scroll", () => {
      pathnameRef.current = "/";
      const { container } = render(<Header />);
      const header = container.querySelector("header");
      expect(header.className).toMatch(/bg-transparent/);
    });

    it("renders cream header on non-homepage routes", () => {
      pathnameRef.current = "/about";
      const { container } = render(<Header />);
      const header = container.querySelector("header");
      expect(header.className).not.toMatch(/bg-transparent/);
      expect(header.className).toMatch(/bg-background/);
    });
  });
});
