/**
 * MEH-2199 chunk 6 — the Header account dropdown declares aria-haspopup="menu",
 * aria-expanded and role="menu"/role="menuitem", and until this ticket the only
 * keydown handler in the whole file was the "/" search shortcut. No Escape, no
 * arrows, no focus management: a widget announcing itself as a menu button and
 * behaving like a div full of links.
 *
 * Per the APG Menu Button pattern: ArrowDown on the closed trigger opens the
 * menu and focuses its first item, ArrowUp opens and focuses the last, arrows
 * move between items, Escape closes AND returns focus to the trigger, and the
 * menu is a single tab stop.
 *
 * ONE DELIBERATE DEPARTURE FROM THE MODAL IN CHUNK 5
 * (asserted by "closing by clicking OUTSIDE does not yank focus back")
 * A menu is not a modal. Escape returns focus to the trigger, but closing by
 * clicking outside must NOT yank focus — the user is already on their way
 * somewhere else, and stealing focus back would fight them. Chunk 5's dialog
 * restores focus on every close path; this one restores only on the keyboard
 * paths, and that difference is intentional rather than an omission.
 *
 * Scaffolding mirrors __tests__/Header.test.jsx.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import Header from "@/components/Header";

const mockLogout = vi.fn();
const userRef = { current: null };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: userRef.current, logout: mockLogout }),
}));

const pathnameRef = { current: "/about" };
vi.mock("next/navigation", () => ({
  usePathname: () => "/about",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/lib/language-context", () => ({ useLanguage: () => ({ lang: "he" }) }));
vi.mock("next-intl", () => {
  const DICT = {
    "nav.explore": "גלו",
    "nav.map": "מפה",
    "nav.about": "אודות",
    "nav.login": "כניסה",
    "nav.register": "הרשמה",
    "nav.main_label": "ניווט ראשי",
    "nav.search_label": "חיפוש",
    "nav.trust_strip": "שיחה אישית עם כל בית עסק",
    "nav.lang_switch_to_en": "Switch to English",
    "nav.add_business": "הוסיפו את העסק שלך",
    "nav.favorites": "מועדפים",
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
      if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
      return out;
    },
  };
});
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt, ...props }) => <img src={src} alt={alt} {...props} />,
}));
vi.mock("@phosphor-icons/react", () => ({
  MagnifyingGlass: (props) => <span data-testid="icon-search" {...props} />,
  SealCheck: (props) => <span data-testid="icon-seal" {...props} />,
  Globe: (props) => <span data-testid="icon-globe" {...props} />,
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => pathnameRef.current,
}));

const trigger = () => screen.getByRole("button", { name: "תפריט — דנה" });
const menu = () => screen.getByRole("menu");
const items = () => within(menu()).getAllByRole("menuitem");
const tabIndexes = () => items().map((el) => el.getAttribute("tabindex"));

const openWith = (key) => {
  const t = trigger();
  t.focus();
  fireEvent.keyDown(t, { key });
  return t;
};

beforeEach(() => {
  userRef.current = { id: 1, name: "דנה", role: "producer", producer_id: "p1" };
  pathnameRef.current = "/about";
  mockLogout.mockClear();
});
afterEach(cleanup);

describe("Header account menu — keyboard (MEH-2199)", () => {
  it("ArrowDown on the CLOSED trigger opens the menu and focuses the first item", () => {
    render(<Header />);
    expect(screen.queryByRole("menu")).toBeNull();
    openWith("ArrowDown");

    expect(menu()).toBeInTheDocument();
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(document.activeElement).toBe(items()[0]);
  });

  it("ArrowUp on the CLOSED trigger opens it and focuses the LAST item", () => {
    render(<Header />);
    openWith("ArrowUp");
    expect(document.activeElement).toBe(items().at(-1));
  });

  it("is a single tab stop, and the stop follows focus", () => {
    render(<Header />);
    openWith("ArrowDown");
    expect(tabIndexes().filter((v) => v === "0")).toHaveLength(1);
    expect(tabIndexes()[0]).toBe("0");

    fireEvent.keyDown(items()[0], { key: "ArrowDown" });
    expect(tabIndexes().filter((v) => v === "0")).toHaveLength(1);
    expect(tabIndexes()[1]).toBe("0");
  });

  it("ArrowDown/ArrowUp move between items and wrap", () => {
    render(<Header />);
    openWith("ArrowDown");
    const all = items();
    expect(all.length).toBeGreaterThan(1);

    fireEvent.keyDown(all[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(all[1]);

    fireEvent.keyDown(all[1], { key: "ArrowUp" });
    expect(document.activeElement).toBe(all[0]);

    // Wrapping backwards off the first lands on the last.
    fireEvent.keyDown(all[0], { key: "ArrowUp" });
    expect(document.activeElement).toBe(all.at(-1));
  });

  it("Home and End jump to the ends", () => {
    render(<Header />);
    openWith("ArrowDown");
    const all = items();
    fireEvent.keyDown(all[0], { key: "End" });
    expect(document.activeElement).toBe(all.at(-1));
    fireEvent.keyDown(all.at(-1), { key: "Home" });
    expect(document.activeElement).toBe(all[0]);
  });

  it("Escape closes the menu AND returns focus to the trigger", () => {
    render(<Header />);
    const t = openWith("ArrowDown");
    expect(document.activeElement).not.toBe(t);

    fireEvent.keyDown(items()[0], { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
    expect(t).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(t);
    // Escape is a dismissal, never an action.
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it("leaves an unhandled key alone while the menu is open", () => {
    render(<Header />);
    openWith("ArrowDown");
    // fireEvent returns false when preventDefault was called. A handler that
    // swallowed every key would pass every other case in this file.
    expect(fireEvent.keyDown(items()[0], { key: "q" })).toBe(true);
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("Escape closes from the TRIGGER too — the state a mouse-opened menu leaves you in", () => {
    render(<Header />);
    // Open by CLICK, which leaves focus on the trigger. The panel's handler
    // never sees a key in this state, so without a trigger-level Escape the
    // menu is un-dismissable by keyboard from the one state a mouse user
    // actually lands in. Adversarial review found this; this case pins it.
    const t = trigger();
    fireEvent.click(t);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    t.focus();

    fireEvent.keyDown(t, { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
    expect(t).toHaveAttribute("aria-expanded", "false");
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it("does not hijack Escape on the trigger while the menu is CLOSED", () => {
    render(<Header />);
    const t = trigger();
    t.focus();
    // Scoped to the open state: an unconditional preventDefault here would
    // swallow Escape for anything else on the page that wants it.
    expect(fireEvent.keyDown(t, { key: "Escape" })).toBe(true);
  });

  it("closing by clicking OUTSIDE does not yank focus back to the trigger", () => {
    render(<Header />);
    const t = trigger();
    fireEvent.click(t);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    // Put focus somewhere inside the menu, then dismiss by pointer.
    const first = items()[0];
    first.focus();
    expect(document.activeElement).toBe(first);
    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole("menu")).toBeNull();
    // THE POINT: a menu is not a modal. Escape returns focus to the trigger
    // because the user asked to come back; an outside click means they are
    // already on their way somewhere else, and grabbing focus would fight them.
    // Chunk 5's dialog restores on every close path — this one must not.
    expect(document.activeElement).not.toBe(t);
  });

  it("does not hijack ArrowDown when the trigger is not focused and the menu is closed", () => {
    render(<Header />);
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("still opens and closes by click — the pointer path is untouched", () => {
    render(<Header />);
    fireEvent.click(trigger());
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.click(trigger());
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
