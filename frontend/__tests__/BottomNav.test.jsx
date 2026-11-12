import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BottomNav from "@/components/BottomNav";

const pathnameRef = { current: "/" };
// MEH-729: BottomNav reads usePathname from the next-intl wrapper
// `@/i18n/navigation`, not `next/navigation`. Mocking the wrapper directly
// avoids loading next-intl's createNavigation (which fails to resolve
// `next/navigation` under the vitest ESM resolver).
vi.mock("@/i18n/navigation", () => ({
  // MEH-2578: the chrome now takes Link from here, not next/link.
  Link: ({ children, href, ...props }) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
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
      "nav.events": "אירועים",
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
  CalendarBlank: (props) => <span data-testid="icon-calendar" {...props} />,
  User: (props) => <span data-testid="icon-user" {...props} />,
}));

// MEH-2965: the third slot is «אירועים» → /events while ANY of the four
// date-bound types has supply, and «אודות» otherwise. One ref per hook so a
// case can say WHICH type cleared the gate.
const gates = { events: false, experiences: false, groupBuys: false, rescue: false };
vi.mock("@/lib/use-events-nav-gate", () => ({ useEventsNavGate: () => gates.events }));
vi.mock("@/lib/use-experiences-nav-gate", () => ({
  useExperiencesNavGate: () => gates.experiences,
}));
vi.mock("@/lib/use-hub-nav-gate", () => ({ useHubNavGate: (hub) => gates[hub] ?? false }));

// The account tab toggles AccountSheet — stub it so this suite stays scoped to
// BottomNav's own structure (the sheet has its own focus/close tests).
vi.mock("@/components/AccountSheet", () => ({
  default: ({ open }) => (open ? <div data-testid="account-sheet" /> : null),
}));

describe("BottomNav", () => {
  beforeEach(() => {
    pathnameRef.current = "/";
    userRef.current = null;
    for (const key of Object.keys(gates)) gates[key] = false;
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

  // MEH-2965 (Sapir 12/11) reverses the events half of this case: with no
  // supply the pill still carries no /events link, and it never carries
  // /favorites.
  it("with nothing to show: no events link, and never a favorites link", () => {
    render(<BottomNav />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).not.toContain("/events");
    expect(hrefs).not.toContain("/favorites");
  });

  // MEH-2965: each of the four hooks clears the gate on its own. A single
  // "all on" case would pass with three of them wired to nothing.
  it.each(["events", "experiences", "groupBuys", "rescue"])(
    "%s alone puts «אירועים» → /events in the third slot, in place of «אודות»",
    (hub) => {
      gates[hub] = true;
      render(<BottomNav />);
      const links = screen.getAllByRole("link");
      expect(links.map((a) => a.textContent)).toEqual(["גלו", "מפה", "אירועים"]);
      expect(links.map((a) => a.getAttribute("href"))).toEqual(["/", "/map", "/events"]);
      expect(screen.getByTestId("icon-calendar")).toBeInTheDocument();
      expect(screen.queryByTestId("icon-flower")).toBeNull();
    },
  );

  // The gates start closed and open in an effect, so on a real page the slot
  // swaps AFTER mount. Same pathname, same slot index, different tenant.
  it("swaps the slot when a gate opens after mount, and moves the current tab with it", () => {
    pathnameRef.current = "/about";
    const { rerender } = render(<BottomNav />);
    const current = () =>
      screen.getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page")
        .map((a) => a.getAttribute("href"));
    expect(current()).toEqual(["/about"]);

    gates.groupBuys = true;
    rerender(<BottomNav />);
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual(["גלו", "מפה", "אירועים"]);
    // «אודות» left the pill, so on /about nothing is current any more.
    expect(current()).toEqual([]);

    gates.groupBuys = false;
    rerender(<BottomNav />);
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual(["גלו", "מפה", "אודות"]);
    expect(current()).toEqual(["/about"]);
  });

  // The hub is four routes under one tab row, so the tab is current on all of
  // them — not only on the one its href names.
  it.each(["/events", "/events/12", "/experiences", "/group-buys", "/group-buys/7", "/rescue"])(
    "«אירועים» is the current tab on %s",
    (path) => {
      gates.events = true;
      pathnameRef.current = path;
      render(<BottomNav />);
      const current = screen.getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page");
      expect(current.map((a) => a.getAttribute("href"))).toEqual(["/events"]);
    },
  );

  // Control for the case above: off the hub the tab is not current. (A path
  // that merely shares a prefix, like /eventsx, is a business slug and renders
  // no pill at all, so it cannot be the control here.)
  it.each(["/favorites", "/about"])("no tab is current on %s", (path) => {
    gates.events = true;
    pathnameRef.current = path;
    render(<BottomNav />);
    const current = screen.getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page");
    expect(current).toEqual([]);
  });

  // MEH-1202: on the public producer detail page the StickyContactBar is the
  // single bottom chrome layer — BottomNav gates itself off so mobile shows one
  // bottom bar, not two.
  it("renders null on /producer/[id] (StickyContactBar is the sole bottom bar)", () => {
    pathnameRef.current = "/producer/123";
    const { container } = render(<BottomNav />);
    expect(container).toBeEmptyDOMElement();
  });

  // MEH-2431 (reverses the MEH-1202 carve-out above): the owner dashboard has
  // its own tab nav; the consumer pill floated over its lists at 375.
  it.each(["/producer/dashboard", "/producer/dashboard/edit", "/producer/dashboard/events/new"])(
    "renders null on the owner dashboard subtree (%s)",
    (path) => {
      pathnameRef.current = path;
      const { container } = render(<BottomNav />);
      expect(container).toBeEmptyDOMElement();
    },
  );

  // MEH-2927 (pilot B3c): the registration flow is a form with one primary
  // action at the end of it, and the pill is fixed chrome over that action.
  // Measured at the iPhone VISUAL viewport, not the device height: at 375x667
  // only 1px of the 48px «מתחילים» button was visible and unobstructed, and
  // at 390x664 only 16px. Sapir's call (11/11) is to take the nav off the
  // whole flow rather than lift the button over it.
  it.each([
    "/register",
    "/register/producer",
    "/register/organizer",
  ])("renders null on the registration flow (%s)", (path) => {
    pathnameRef.current = path;
    const { container } = render(<BottomNav />);
    expect(container).toBeEmptyDOMElement();
  });

  // Controls: consumer routes keep the nav, so a gate that hides it
  // everywhere cannot pass.
  // `/producer/dashboardx/foo` only shares the prefix: it is neither the
  // dashboard nor a producer leaf, so a bare startsWith("/producer/dashboard")
  // would hide the nav there by mistake. `/registerx/foo` is the same trap for
  // the MEH-2927 gate above.
  it.each(["/", "/map", "/favorites", "/producer/dashboardx/foo", "/registerx/foo"])("still renders on %s", (path) => {
    pathnameRef.current = path;
    render(<BottomNav />);
    expect(screen.getAllByRole("link")).toHaveLength(3);
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
    // Avatar initial replaces the User glyph.
    expect(screen.getByText("ד")).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAttribute("aria-haspopup", "dialog");
  });

  // MEH-991 (NAV-14): logged-in label is the user's first name, not "חשבון".
  it("shows the user's first name as the account label when logged in", () => {
    userRef.current = { id: "u1", name: "דנה כהן" };
    render(<BottomNav />);
    expect(screen.getByText("דנה")).toBeInTheDocument();
    expect(screen.queryByText("חשבון")).not.toBeInTheDocument();
  });

  it("shows 'חשבון' as the account label when logged out", () => {
    userRef.current = null;
    render(<BottomNav />);
    expect(screen.getByText("חשבון")).toBeInTheDocument();
  });
});

// MEH-2490: on routes with no bottom layer at all the pill's clearance var is
// the safe area alone. Removing it (the old behaviour) let globals.css
// --bottom-inset fall back to the expanded-pill value: ~80px of dead padding.
describe("bottom clearance on routes without a pill (MEH-2490)", () => {
  const clearance = () =>
    document.documentElement.style.getPropertyValue("--bottom-nav-clearance");

  beforeEach(() => {
    userRef.current = null;
    document.documentElement.style.removeProperty("--bottom-nav-clearance");
  });

  it.each([
    "/producer/dashboard",
    "/producer/dashboard/group-buys",
    "/admin",
    "/admin/reviews",
    // MEH-2927: the registration flow joins the no-pill set, so it must also
    // publish the no-pill clearance. A gate that hides the pill without
    // publishing leaves every consumer of --bottom-nav-clearance reserving
    // 72px for a bar that is not there.
    "/register",
    "/register/producer",
  ])(
    "%s publishes the safe area + gutter, not the pill fallback",
    (path) => {
      pathnameRef.current = path;
      const { container } = render(<BottomNav />);
      // The render gate and the publish share one predicate: no pill AND the
      // no-pill clearance, on the same path, so the two cannot drift apart.
      expect(container).toBeEmptyDOMElement();
      expect(clearance()).toBe("calc(env(safe-area-inset-bottom, 0px) + 12px)");
    },
  );

  // The StickyContactBar sits at the bottom of a business page; the fallback is
  // what keeps content clear of it, so that gate must NOT publish anything.
  it("a business page leaves the var unset", () => {
    pathnameRef.current = "/producer/123";
    render(<BottomNav />);
    expect(clearance()).toBe("");
  });

  it("leaving the dashboard drops the override", () => {
    pathnameRef.current = "/producer/dashboard";
    const { unmount } = render(<BottomNav />);
    unmount();
    expect(clearance()).toBe("");
  });
});
