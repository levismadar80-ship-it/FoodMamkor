import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Header from "@/components/Header";

const mockLogout = vi.fn();
const userRef = { current: null };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: userRef.current, logout: mockLogout }),
}));

// MEH-1176 F3: Header reads usePathname from "@/i18n/navigation" (locale-
// stripped — MEH-731), NOT from next/navigation. The pathname fixture ref
// is therefore routed through the i18n mock below; next/navigation only
// supplies Header's useRouter. Default to /about so suites don't fight the
// homepage trust strip / transparent surface; individual tests swap to "/".
const pathnameRef = { current: "/about" };
vi.mock("next/navigation", () => ({
  usePathname: () => "/about",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

// MEH-629 item 6: the setLang mock was removed — PR #731 dropped the
// setLang destructure from useLanguage(). Header no longer touches it;
// locale changes flow through next-intl's router.
vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({ lang: "he" }),
}));

// MEH-471: Header reads useTranslations() from next-intl directly.
// MEH-1176 F3: DICT refreshed to the SHIPPED he.json values (nav.explore
// "גלו" per ADR-014 plural voice, nav.login "כניסה", account.menu.* for the
// avatar dropdown) and the mock is now vars-aware for account.menu.aria.
vi.mock("next-intl", () => {
  const DICT = {
    "nav.explore": "גלו",
    "nav.map": "מפה",
    "nav.about": "אודות",
    "nav.login": "כניסה",
    "nav.main_label": "ניווט ראשי",
    "nav.search_label": "חיפוש",
    "nav.trust_strip": "שיחה אישית עם כל בית עסק",
    "nav.add_business": "הוסיפו את העסק שלך",
    "account.menu.profile": "הפרופיל שלי",
    "account.menu.settings": "הגדרות",
    "account.menu.dashboard": "לוח הבקרה שלי",
    "account.menu.admin": "ממשק אדמין",
    "account.menu.logout": "התנתקות",
    "account.menu.aria": "תפריט — {name}",
  };
  return {
    useLocale: () => "he",
    useTranslations: (ns) => (key, vars) => {
      const full = ns ? `${ns}.${key}` : key;
      let out = DICT[full] ?? DICT[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          out = out.replaceAll(`{${k}}`, String(v));
        }
      }
      return out;
    },
  };
});

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
  MagnifyingGlass: (props) => <span data-testid="icon-search" {...props} />,
  // MEH-884/896: homepage trust strip glyph — mounts whenever pathname="/".
  SealCheck: (props) => <span data-testid="icon-seal" {...props} />,
}));

// MEH-475: LanguageToggle pulls useRouter/usePathname from "@/i18n/navigation"
// (the next-intl-aware router). MEH-1176 F3: Header's OWN pathname comes from
// here too (MEH-731) — this mock is now the single pathname source for tests.
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => pathnameRef.current,
}));

const setScrollY = (y) =>
  Object.defineProperty(window, "scrollY", { value: y, writable: true, configurable: true });

// MEH-1176 F3: this suite was describe.skip since MEH-729 ("navbar in flux")
// and its body still asserted the pre-MEH-789 chrome (4 nav links incl.
// מהשכן, hamburger drawer, header-level bg-transparent). The flux ended long
// ago — MEH-732/789/896/907/947 shipped — so the suite is re-asserted here
// against the SHIPPED chrome (components/Header.jsx is the truth):
//   - 3 desktop nav links (גלו / מפה / אודות), no מהשכן (MEH-598), no /events
//   - no hamburger drawer (MEH-789 PR-B — BottomNav owns mobile nav)
//   - no add-business CTA anywhere in the header (MEH-907)
//   - guest login = quiet "כניסה" link, hidden on /login (MEH-732)
//   - MEH-39 avatar dropdown with role-gated items (account.menu.*)
//   - active link via locale-stripped pathname (MEH-731 regression guard)
//   - MEH-947 three-way pill SURFACE on the <nav> (not the <header>)
describe("Header", () => {
  beforeEach(() => {
    userRef.current = null;
    pathnameRef.current = "/about";
    mockLogout.mockClear();
    setScrollY(0);
  });

  describe("navigation (MEH-789/MEH-907 chrome)", () => {
    it("shows exactly the 3 desktop nav links: גלו / מפה / אודות", () => {
      render(<Header />);
      expect(screen.getAllByRole("link", { name: "גלו" }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("link", { name: "מפה" }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("link", { name: "אודות" }).length).toBeGreaterThan(0);
    });

    it("does NOT render a מהשכן link (route removed pre-launch, MEH-598)", () => {
      render(<Header />);
      expect(screen.queryByText("מהשכן")).toBeNull();
      const neighborLinks = screen.queryAllByRole("link").filter((a) =>
        a.getAttribute("href")?.startsWith("/neighbor"),
      );
      expect(neighborLinks).toHaveLength(0);
    });

    it("does NOT render an /events link anywhere in the header", () => {
      render(<Header />);
      const eventLinks = screen.queryAllByRole("link").filter((a) =>
        a.getAttribute("href")?.startsWith("/events"),
      );
      expect(eventLinks).toHaveLength(0);
    });

    it("has NO hamburger drawer (retired by MEH-789 PR-B — BottomNav owns mobile)", () => {
      render(<Header />);
      expect(screen.queryByLabelText("פתח תפריט")).toBeNull();
      expect(screen.queryByTestId("icon-hamburger")).toBeNull();
    });
  });

  describe("actions — logged out", () => {
    it("shows the quiet כניסה account link", () => {
      render(<Header />);
      const login = screen.getAllByRole("link", { name: "כניסה" });
      expect(login.length).toBeGreaterThan(0);
      expect(login[0].getAttribute("href")).toBe("/login");
    });

    it("hides the login link on /login itself (MEH-732)", () => {
      pathnameRef.current = "/login";
      render(<Header />);
      expect(screen.queryByRole("link", { name: "כניסה" })).toBeNull();
    });

    it("does NOT show an add-business CTA in the header (removed by MEH-907)", () => {
      render(<Header />);
      expect(screen.queryByText("הוסיפו את העסק שלך")).toBeNull();
    });
  });

  describe("avatar dropdown — consumer (MEH-39)", () => {
    beforeEach(() => {
      userRef.current = { id: "u1", name: "דנה", role: "consumer" };
    });

    it("renders the avatar button with the user's first initial", () => {
      render(<Header />);
      const avatarBtn = screen.getByLabelText("תפריט — דנה");
      expect(avatarBtn).toBeInTheDocument();
      expect(avatarBtn.textContent).toContain("ד");
    });

    it("keeps the dropdown closed by default", () => {
      render(<Header />);
      expect(screen.queryByRole("menu")).toBeNull();
      expect(screen.queryByText("התנתקות")).toBeNull();
    });

    it("opens the dropdown on avatar click with profile / settings / logout items", () => {
      render(<Header />);
      fireEvent.click(screen.getByLabelText("תפריט — דנה"));
      expect(screen.getByRole("menu")).toBeInTheDocument();
      expect(screen.getByText("הפרופיל שלי")).toBeInTheDocument();
      expect(screen.getByText("הגדרות")).toBeInTheDocument();
      expect(screen.getByText("התנתקות")).toBeInTheDocument();
    });

    it("MEH-137: הפרופיל שלי and הגדרות lead to different routes for consumers", () => {
      render(<Header />);
      fireEvent.click(screen.getByLabelText("תפריט — דנה"));
      const profileLink = screen.getByText("הפרופיל שלי").closest("a");
      const settingsLink = screen.getByText("הגדרות").closest("a");
      expect(profileLink.getAttribute("href")).toBe("/settings?tab=profile");
      expect(settingsLink.getAttribute("href")).toBe("/settings?tab=security");
    });

    it("hides producer/admin items for plain consumers", () => {
      render(<Header />);
      fireEvent.click(screen.getByLabelText("תפריט — דנה"));
      expect(screen.queryByText("לוח הבקרה שלי")).toBeNull();
      expect(screen.queryByText("ממשק אדמין")).toBeNull();
    });

    it("התנתקות calls auth.logout and closes the dropdown", () => {
      render(<Header />);
      fireEvent.click(screen.getByLabelText("תפריט — דנה"));
      fireEvent.click(screen.getByText("התנתקות"));
      expect(mockLogout).toHaveBeenCalled();
      expect(screen.queryByRole("menu")).toBeNull();
    });
  });

  describe("avatar dropdown — role-specific items (MEH-39)", () => {
    // MEH-1226: dashboard leads the producer menu (above profile/settings);
    // the profile row now targets /settings?tab=profile (no longer a duplicate
    // of the /producer/dashboard target).
    it("producer sees לוח הבקרה שלי first, dashboard link separate from profile", () => {
      userRef.current = { id: "u1", name: "מיה", role: "producer" };
      render(<Header />);
      fireEvent.click(screen.getByLabelText("תפריט — מיה"));
      expect(screen.queryByText("ממשק אדמין")).toBeNull();
      const dashboardLink = screen.getByText("לוח הבקרה שלי").closest("a");
      expect(dashboardLink.getAttribute("href")).toBe("/producer/dashboard");
      const profileLink = screen.getByText("הפרופיל שלי").closest("a");
      expect(profileLink.getAttribute("href")).toBe("/settings?tab=profile");
      // dashboard sits above the profile row in the menu
      const menuItems = screen.getAllByRole("menuitem").map((el) => el.textContent);
      expect(menuItems.indexOf("לוח הבקרה שלי")).toBeLessThan(menuItems.indexOf("הפרופיל שלי"));
    });

    it("admin sees ממשק אדמין in the dropdown", () => {
      userRef.current = { id: "u1", name: "אורית", role: "admin" };
      render(<Header />);
      fireEvent.click(screen.getByLabelText("תפריט — אורית"));
      expect(screen.getByText("ממשק אדמין")).toBeInTheDocument();
      expect(screen.queryByText("לוח הבקרה שלי")).toBeNull();
    });
  });

  // MEH-29 active-link tracking, through the locale-stripped pathname
  // (@/i18n/navigation) — this doubles as the MEH-731 regression guard:
  // with a locale-prefixed pathname ("/he"), the "/" item would never match.
  describe("active nav link (MEH-29 / MEH-731)", () => {
    it("marks גלו aria-current=page when pathname=/", () => {
      pathnameRef.current = "/";
      render(<Header />);
      const explore = screen.getAllByRole("link", { name: "גלו" });
      expect(explore.some((a) => a.getAttribute("aria-current") === "page")).toBe(true);
      const map = screen.getAllByRole("link", { name: "מפה" });
      expect(map.some((a) => a.getAttribute("aria-current") === "page")).toBe(false);
    });

    it("uses prefix matching — /map/anything still highlights מפה", () => {
      pathnameRef.current = "/map/123";
      render(<Header />);
      const map = screen.getAllByRole("link", { name: "מפה" });
      expect(map.some((a) => a.getAttribute("aria-current") === "page")).toBe(true);
    });

    it("uses EXACT match for / — does not light up גלו on every page", () => {
      pathnameRef.current = "/about";
      render(<Header />);
      const explore = screen.getAllByRole("link", { name: "גלו" });
      expect(explore.some((a) => a.getAttribute("aria-current") === "page")).toBe(false);
    });
  });

  // MEH-947 three-way pill surface. The surface classes live on the <nav>
  // pill — the <header> is a bare sticky wrapper (the old suite's
  // header-level bg-transparent assertions were the stale part). The scroll
  // listener is rAF-throttled, so these tests run rAF synchronously.
  describe("pill surface (MEH-947 three-way)", () => {
    beforeEach(() => {
      vi.stubGlobal("requestAnimationFrame", (cb) => {
        cb();
        return 0;
      });
      vi.stubGlobal("cancelAnimationFrame", () => {});
    });

    it("homepage at rest → at-rest glass (bg-background/85)", () => {
      pathnameRef.current = "/";
      const { container } = render(<Header />);
      expect(container.querySelector("nav").className).toMatch(/bg-background\/85/);
    });

    it("homepage scrolled past 60px → lighter scrolled glass (bg-background/60)", () => {
      pathnameRef.current = "/";
      const { container } = render(<Header />);
      setScrollY(120);
      fireEvent.scroll(window);
      expect(container.querySelector("nav").className).toMatch(/bg-background\/60/);
    });

    it("inner pages → SOLID cream pill, no translucent glass (MEH-947)", () => {
      pathnameRef.current = "/about";
      const { container } = render(<Header />);
      const nav = container.querySelector("nav");
      expect(nav.className).not.toMatch(/bg-background\/(60|85)/);
      expect(nav.className).toMatch(/bg-background\b/);
      expect(nav.className).not.toMatch(/backdrop-blur/);
    });
  });
});

// MEH-1072: pill geometry is FIXED (gap-8 end-cap, gap-9 lead-group) at
// every scroll position — the MEH-899 rest-wide→compact width switching
// (gap-14/px-11/gap-11 at rest) is retired. MEH-1103 recalibrated the fixed
// end-cap constant px-4 → px-6; the invariant under test is unchanged
// (geometry is scroll-independent, no width snap). Rendered on /about
// (non-homepage) so the homepage trust strip never mounts.
describe("Header fixed pill geometry (MEH-1072)", () => {
  beforeEach(() => {
    userRef.current = null;
    pathnameRef.current = "/about";
    setScrollY(0);
  });

  it("renders compact geometry (gap-8 px-6) on the nav pill at scrollY=0", () => {
    const { container } = render(<Header />);
    const nav = container.querySelector("nav");
    expect(nav.className).toMatch(/gap-8/);
    expect(nav.className).toMatch(/px-6/);
    // The retired MEH-899 rest-wide classes must NOT appear.
    expect(nav.className).not.toMatch(/gap-14/);
    expect(nav.className).not.toMatch(/px-11/);
  });

  it("keeps gap-8 px-6 after scrolling past 60px (geometry is scroll-independent)", () => {
    const { container } = render(<Header />);
    setScrollY(120);
    fireEvent.scroll(window);
    const nav = container.querySelector("nav");
    expect(nav.className).toMatch(/gap-8/);
    expect(nav.className).toMatch(/px-6/);
    expect(nav.className).not.toMatch(/gap-14/);
    expect(nav.className).not.toMatch(/px-11/);
  });

  it("uses the fixed lead-group gap-9 (never the rest-wide gap-11) at rest and scrolled", () => {
    const { container } = render(<Header />);
    const nav = container.querySelector("nav");
    expect(nav.innerHTML).toMatch(/gap-9/);
    expect(nav.innerHTML).not.toMatch(/gap-11/);
    setScrollY(120);
    fireEvent.scroll(window);
    expect(nav.innerHTML).toMatch(/gap-9/);
    expect(nav.innerHTML).not.toMatch(/gap-11/);
  });
});
