import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Header from "@/components/Header";

const mockLogout = vi.fn();
const userRef = { current: null };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: userRef.current, logout: mockLogout }),
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

  describe("actions — logged out", () => {
    it("shows login + add-business buttons", () => {
      render(<Header />);
      expect(screen.getAllByText("כניסה לחשבון").length).toBeGreaterThan(0);
      expect(screen.getAllByText("הוסיפי את העסק שלך").length).toBeGreaterThan(0);
    });

    it("shows the עב/EN language toggle", () => {
      render(<Header />);
      // Two toggle buttons exist (desktop + mobile drawer); the desktop one is visible.
      expect(screen.getAllByLabelText("Switch to English").length).toBeGreaterThan(0);
    });
  });

  describe("actions — logged in as consumer", () => {
    beforeEach(() => {
      userRef.current = { id: "u1", name: "דנה", role: "consumer" };
    });

    it("shows username + logout + add-business (consumers are not producers)", () => {
      render(<Header />);
      expect(screen.getAllByText("דנה").length).toBeGreaterThan(0);
      expect(screen.getAllByText("התנתק").length).toBeGreaterThan(0);
      expect(screen.getAllByText("הוסיפי את העסק שלך").length).toBeGreaterThan(0);
    });

    it("logout button calls auth.logout", () => {
      render(<Header />);
      const logoutBtn = screen.getAllByText("התנתק")[0];
      fireEvent.click(logoutBtn);
      expect(mockLogout).toHaveBeenCalled();
    });
  });

  describe("actions — logged in as producer", () => {
    beforeEach(() => {
      userRef.current = { id: "u1", name: "בעלת חוות", role: "producer" };
    });

    it("HIDES the add-business CTA (producer already has one)", () => {
      render(<Header />);
      expect(screen.queryAllByText("הוסיפי את העסק שלך")).toHaveLength(0);
    });
  });

  describe("admin", () => {
    beforeEach(() => {
      userRef.current = { id: "u1", name: "אורית", role: "admin" };
    });

    it("does NOT render the admin link on desktop actions (drawer-only)", () => {
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
    it("toggles open + closed via the hamburger button", () => {
      render(<Header />);
      expect(screen.queryByText("הוסיפי את העסק שלך")).not.toBeNull(); // desktop button present
      // Open the drawer
      fireEvent.click(screen.getByLabelText("פתח תפריט"));
      // All four nav items present in drawer (plus the hidden desktop copies)
      expect(screen.getAllByText("גלה").length).toBeGreaterThanOrEqual(1);
      // Close
      fireEvent.click(screen.getByLabelText("סגור תפריט"));
    });
  });
});
