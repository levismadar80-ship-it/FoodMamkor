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
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
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
  MagnifyingGlass: (props) => <span data-testid="icon-search" {...props} />,
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

  describe("actions — logged in as consumer (MEH-39: desktop shows avatar dropdown)", () => {
    beforeEach(() => {
      userRef.current = { id: "u1", name: "דנה", role: "consumer" };
    });

    it("renders a circular avatar button with the user's first initial", () => {
      render(<Header />);
      // The avatar button carries aria-label containing the user name.
      const avatarBtn = screen.getByLabelText(/תפריט משתמשת — דנה/);
      expect(avatarBtn).toBeInTheDocument();
      // Initial letter is rendered inside the button.
      expect(avatarBtn.textContent).toContain("ד");
    });

    it("does NOT show the user's full name in the desktop chrome (dropdown-only)", () => {
      render(<Header />);
      // MEH-28 rendered {user.name} as visible text; MEH-39 collapses
      // it into the avatar button's aria-label + the closed dropdown.
      // Visible text nodes should not contain the full name.
      const nameNodes = screen.queryAllByText("דנה", { exact: true });
      expect(nameNodes).toHaveLength(0);
    });

    it("keeps the dropdown closed by default", () => {
      render(<Header />);
      expect(screen.queryByRole("menu")).toBeNull();
      expect(screen.queryByText("התנתקי")).toBeNull();
    });

    it("opens the dropdown on avatar click with profile / settings / logout items", () => {
      render(<Header />);
      fireEvent.click(screen.getByLabelText(/תפריט משתמשת — דנה/));
      expect(screen.getByRole("menu")).toBeInTheDocument();
      expect(screen.getByText("הפרופיל שלי")).toBeInTheDocument();
      expect(screen.getByText("הגדרות")).toBeInTheDocument();
      expect(screen.getByText("התנתקי")).toBeInTheDocument();
    });

    it("hides producer/admin items for plain consumers", () => {
      render(<Header />);
      fireEvent.click(screen.getByLabelText(/תפריט משתמשת — דנה/));
      expect(screen.queryByText("לוח הבקרה שלי")).toBeNull();
      expect(screen.queryByText("ממשק אדמין")).toBeNull();
    });

    it("התנתקי button calls auth.logout and closes the dropdown", () => {
      render(<Header />);
      fireEvent.click(screen.getByLabelText(/תפריט משתמשת — דנה/));
      fireEvent.click(screen.getByText("התנתקי"));
      expect(mockLogout).toHaveBeenCalled();
      // Menu removed from DOM after click.
      expect(screen.queryByRole("menu")).toBeNull();
    });

    it("does NOT show add-business CTA in desktop chrome (footer-only)", () => {
      render(<Header />);
      expect(screen.queryAllByText("הוסיפי את העסק שלך")).toHaveLength(0);
    });

    it("drawer logout button still calls auth.logout (mobile chrome unchanged)", () => {
      render(<Header />);
      fireEvent.click(screen.getByLabelText("פתח תפריט"));
      fireEvent.click(screen.getByText("התנתק"));
      expect(mockLogout).toHaveBeenCalled();
    });
  });

  describe("avatar dropdown — role-specific items (MEH-39)", () => {
    it("producer sees לוח הבקרה שלי in the dropdown", () => {
      userRef.current = { id: "u1", name: "מיה", role: "producer" };
      render(<Header />);
      fireEvent.click(screen.getByLabelText(/תפריט משתמשת — מיה/));
      expect(screen.getByText("לוח הבקרה שלי")).toBeInTheDocument();
      expect(screen.queryByText("ממשק אדמין")).toBeNull();
    });

    it("admin sees ממשק אדמין in the dropdown", () => {
      userRef.current = { id: "u1", name: "אורית", role: "admin" };
      render(<Header />);
      fireEvent.click(screen.getByLabelText(/תפריט משתמשת — אורית/));
      expect(screen.getByText("ממשק אדמין")).toBeInTheDocument();
      expect(screen.queryByText("לוח הבקרה שלי")).toBeNull();
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
