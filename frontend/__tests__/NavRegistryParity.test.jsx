import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import {
  NAV_ITEMS,
  NAV_SURFACES,
  NAV_AUDIENCES,
  NAV_KINDS,
  itemsForSurface,
} from "@/lib/nav-registry";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import AccountSheet from "@/components/AccountSheet";

/**
 * MEH-1703 chunk 1 — the equivalence proof for lib/nav-registry.js.
 *
 * The registry has ZERO consumers. Nothing imports it but this file, so it
 * cannot change what any shell renders. What it CAN do is be wrong, and a
 * registry that quietly disagrees with the shells is worse than no registry —
 * chunks 2-4 would wire the shells to a false description. This file is the
 * only thing standing between those two states.
 *
 * HOW IT DISCRIMINATES (.claude/rules/testing.md, MEH-1619). The expected set
 * is DERIVED from the registry and compared against links harvested from the
 * REAL components — not against a literal list written next to it. So the
 * assertion is falsifiable from both directions: change a record and the
 * comparison fails; delete a link from a shell and it fails too. There is no
 * world in which it passes because nothing ran — a shell that renders no links
 * yields an empty array against a non-empty expectation.
 *
 * Both halves were run and are quoted in the PR body: mutating one record
 * (`nav.explore` -> `nav.discover` on the home item's header surface) turns it
 * RED; restoring turns it GREEN.
 *
 * WHAT IS DELIBERATELY NOT ASSERTED:
 *   - ORDER. The Header renders home/map/experiences/about while the BottomNav
 *     renders home/map/about — the sequences genuinely differ, so no single
 *     declaration order can describe both. Comparisons are sorted multisets.
 *     Order stays shell-local, which is exactly the chunk 0 finding.
 *   - The brand logo. Header.jsx:366 links "/" from an <img> anchor; it is a
 *     brand affordance rather than a nav item and is out of the registry. It
 *     is filtered out by the `<img>` test below so its duplicate "/" cannot
 *     mask a deleted home link.
 *   - Styling, icons, icon sizes, wrapper classes. Shell-local by design.
 */

// ─────────────────────────────── fixtures ───────────────────────────────

const pathnameRef = { current: "/about" };
const userRef = { current: null };
const experiencesGateRef = { current: false };

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => pathnameRef.current,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameRef.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: userRef.current, logout: vi.fn() }),
}));

// The translation mock ECHOES the key, so a link's rendered text IS its i18n
// key. That is what lets the label assertion below compare against
// `labelKey` directly — and it is why a fused `nav.explore`/`nav.discover`
// cannot hide here the way it hides in he.json, where both render "גלו".
vi.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
  useLocale: () => "he",
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  default: ({ alt, ...props }) => <img alt={alt} {...props} />,
}));

// The factory is hoisted above the module body, so the stub helper has to be
// declared INSIDE it — a top-level `stubIcon` is not yet initialised when this
// runs (vitest hoisting rule).
vi.mock("@phosphor-icons/react", () => {
  const stub = (name) => {
    const Icon = (props) => <span data-icon={name} aria-hidden="true" {...props} />;
    // react/display-name is an ERROR in this repo's config, not a warning.
    Icon.displayName = `Stub(${name})`;
    return Icon;
  };
  return {
    // Header
    MagnifyingGlass: stub("MagnifyingGlass"),
    SealCheck: stub("SealCheck"),
    // BottomNav
    Compass: stub("Compass"),
    MapTrifold: stub("MapTrifold"),
    Flower: stub("Flower"),
    User: stub("User"),
    // AccountSheet
    Heart: stub("Heart"),
    Gear: stub("Gear"),
    Storefront: stub("Storefront"),
    SignIn: stub("SignIn"),
    SignOut: stub("SignOut"),
    ArrowUpLeft: stub("ArrowUpLeft"),
    Gauge: stub("Gauge"),
  };
});

// Must not render an anchor — the language row is a CONTROL, and a stray <a>
// here would pollute the link harvest.
vi.mock("@/components/LanguageToggle", () => ({
  default: ({ variant, children }) => (
    <button type="button" data-testid="language-toggle" data-variant={variant}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/OnboardingTip", () => ({ default: () => null }));
vi.mock("@/lib/use-onboarding", () => ({
  useOnboarding: () => ({ step: -1, advance: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock("@/lib/use-experiences-nav-gate", () => ({
  useExperiencesNavGate: () => experiencesGateRef.current,
}));

const STATES = {
  guest: { user: null, signedIn: false, role: null },
  consumer: {
    user: { name: "דנה כהן", role: "consumer" },
    signedIn: true,
    role: "consumer",
  },
  producer: {
    user: { name: "רות לוי", role: "producer", producer_id: "p-42" },
    signedIn: true,
    role: "producer",
    producerId: "p-42",
  },
  producerNoId: {
    user: { name: "רות לוי", role: "producer" },
    signedIn: true,
    role: "producer",
  },
  admin: {
    user: { name: "שמדר", role: "admin" },
    signedIn: true,
    role: "admin",
  },
};

// ─────────────────────────────── helpers ───────────────────────────────

/**
 * Expected links for one surface, DERIVED from the registry.
 *
 * `gates` answers the two runtime questions the registry deliberately does not
 * hold an opinion on (supply of experiences; whether a producer has a linked
 * public page).
 */
function expectedLinks(surfaceName, state, gates = {}) {
  return itemsForSurface(surfaceName, state)
    .filter(({ item }) => item.kind === "link")
    .filter(({ item }) => !item.dataGate || gates[item.dataGate])
    .filter(({ surface }) => {
      const suppress = surface.suppressOnRoute;
      if (!suppress) return true; // no route gate on this surface → keep
      const path = pathnameRef.current || "";
      return !suppress.some((p) => (p.endsWith("/") ? path.startsWith(p) : path === p));
    })
    .map(({ item, surface }) => ({
      href: item.href.replace(":producerId", state.producerId ?? ""),
      label: surface.labelKey,
    }));
}

/**
 * Links actually rendered, harvested from the DOM.
 *
 * The `<img>` filter drops the brand logo (Header.jsx:366-382) — the only
 * anchor wrapping an image. Everything else is a nav link.
 */
function renderedLinks(container) {
  return Array.from(container.querySelectorAll("a[href]"))
    .filter((a) => !a.querySelector("img"))
    .map((a) => ({
      href: a.getAttribute("href"),
      label: (a.getAttribute("aria-label") || a.textContent || "").trim(),
    }));
}

const sortLinks = (links) =>
  [...links].sort((a, b) =>
    `${a.href}|${a.label}`.localeCompare(`${b.href}|${b.label}`),
  );

/** Open the desktop avatar dropdown. Only mounts for a signed-in user. */
function openUserMenu() {
  fireEvent.click(screen.getByLabelText("account.menu.aria"));
}

beforeEach(() => {
  cleanup();
  pathnameRef.current = "/about";
  userRef.current = null;
  experiencesGateRef.current = false;
});

// ──────────────────────────── the control ────────────────────────────

describe("MEH-1703 — the harness itself", () => {
  /**
   * Run first, and read it first. Every assertion below compares a derived
   * expectation against a harvested one; if the harvest silently returned
   * nothing, an empty-vs-empty comparison would pass and report parity across
   * four surfaces that were never rendered. This case fails loudly instead.
   */
  it("CONTROL — the link harvester finds links, and drops the logo", () => {
    userRef.current = null;
    const { container } = render(<Header />);
    const anchors = container.querySelectorAll("a[href]");
    const harvested = renderedLinks(container);

    expect(
      anchors.length,
      "Header rendered no anchors at all — every null result below is void",
    ).toBeGreaterThan(0);
    expect(
      harvested.length,
      "the harvester dropped every anchor — the <img> filter is over-matching",
    ).toBeGreaterThan(0);
    // The logo is an anchor and is NOT harvested: exactly one anchor difference.
    expect(anchors.length - harvested.length).toBe(1);
  });

  /**
   * Data integrity, derived from the registry's own vocabulary rather than
   * from a literal list here — a second copy of the surface names would be a
   * second owner of one fact, and would go stale silently.
   *
   * The audience check earns its place: `itemsForSurface` THROWS on an
   * unknown audience, so a typo would otherwise surface as an exception from
   * whichever consumer happened to hit that surface first, in chunk 2.
   */
  it("CONTROL — every item declares a known surface, kind and audience", () => {
    expect(NAV_ITEMS.length).toBeGreaterThan(0);
    const surfaces = new Set(Object.keys(NAV_SURFACES));
    for (const item of NAV_ITEMS) {
      expect(NAV_KINDS, `${item.id}: kind`).toContain(item.kind);
      const keys = Object.keys(item.surfaces);
      expect(keys.length, `${item.id} declares no surface`).toBeGreaterThan(0);
      for (const key of keys) {
        expect(surfaces.has(key), `${item.id}: unknown surface ${key}`).toBe(true);
        expect(NAV_AUDIENCES, `${item.id}.${key}: audience`).toContain(
          item.surfaces[key].audience,
        );
      }
      // A link needs somewhere to go; a control must not pretend to.
      expect(typeof item.href === "string", `${item.id}: href`).toBe(
        item.kind === "link",
      );
    }
  });
});

// ──────────────────────────── Header (desktop pill) ────────────────────────────

describe("MEH-1703 — Header link row matches the registry", () => {
  for (const name of ["guest", "consumer", "producer", "admin"]) {
    it(`header surface, ${name}`, () => {
      const state = STATES[name];
      userRef.current = state.user;
      const { container } = render(<Header />);
      expect(sortLinks(renderedLinks(container))).toEqual(
        sortLinks(expectedLinks("header", state)),
      );
    });
  }

  it("header surface picks up the experiences link when supply clears the gate", () => {
    experiencesGateRef.current = true;
    userRef.current = null;
    const { container } = render(<Header />);
    const rendered = sortLinks(renderedLinks(container));

    expect(rendered).toEqual(
      sortLinks(
        expectedLinks("header", STATES.guest, { "experiences-supply": true }),
      ),
    );
    // Belt and braces: the gate really did add a link, so the case above is
    // not passing because both sides are missing it.
    expect(rendered.map((l) => l.href)).toContain("/experiences");
  });

  it("suppresses the login link on /login, per suppressOnRoute", () => {
    pathnameRef.current = "/login";
    userRef.current = null;
    const { container } = render(<Header />);
    const rendered = sortLinks(renderedLinks(container));
    expect(rendered).toEqual(sortLinks(expectedLinks("header", STATES.guest)));
    expect(rendered.map((l) => l.href)).not.toContain("/login");
  });

  it("suppresses the register link on /register/producer, per suppressOnRoute", () => {
    pathnameRef.current = "/register/producer";
    userRef.current = null;
    const { container } = render(<Header />);
    const rendered = sortLinks(renderedLinks(container));
    expect(rendered).toEqual(sortLinks(expectedLinks("header", STATES.guest)));
    expect(rendered.map((l) => l.href)).not.toContain("/register");
  });

  it("renders the header controls the registry declares", () => {
    userRef.current = null;
    render(<Header />);
    const search = NAV_ITEMS.find((i) => i.id === "search");
    expect(screen.getAllByLabelText(search.surfaces.header.labelKey)).toHaveLength(
      search.surfaces.header.mounts,
    );
    expect(screen.getAllByTestId("language-toggle")).toHaveLength(1);
  });
});

// ──────────────────────── Header dropdown (headerMenu) ────────────────────────

describe("MEH-1703 — Header avatar dropdown matches the registry", () => {
  for (const name of ["consumer", "producer", "producerNoId", "admin"]) {
    it(`headerMenu surface, ${name}`, () => {
      const state = STATES[name];
      userRef.current = state.user;
      const { container } = render(<Header />);
      openUserMenu();

      const expected = [
        ...expectedLinks("header", state),
        ...expectedLinks("headerMenu", state, {
          "producer-id-present": Boolean(state.producerId),
        }),
      ];
      expect(sortLinks(renderedLinks(container))).toEqual(sortLinks(expected));
    });
  }

  it("the dropdown does not exist for a guest", () => {
    userRef.current = null;
    render(<Header />);
    expect(screen.queryByLabelText("account.menu.aria")).toBeNull();
  });

  it("renders the logout control for a signed-in user", () => {
    userRef.current = STATES.consumer.user;
    render(<Header />);
    openUserMenu();
    expect(screen.getByText("account.menu.logout")).toBeInTheDocument();
  });
});

// ──────────────────────────── BottomNav (mobile pill) ────────────────────────────

describe("MEH-1703 — BottomNav matches the registry", () => {
  for (const name of ["guest", "consumer", "producer", "admin"]) {
    it(`bottomNav surface, ${name}`, () => {
      const state = STATES[name];
      userRef.current = state.user;
      const { container } = render(<BottomNav />);
      expect(sortLinks(renderedLinks(container))).toEqual(
        sortLinks(expectedLinks("bottomNav", state)),
      );
    });
  }

  it("renders the account control the registry declares", () => {
    userRef.current = null;
    render(<BottomNav />);
    const account = NAV_ITEMS.find((i) => i.id === "account");
    expect(
      screen.getByLabelText(account.surfaces.bottomNav.labelKey),
    ).toBeInTheDocument();
  });
});

// ──────────────────────────── AccountSheet (mobile sheet) ────────────────────────────

describe("MEH-1703 — AccountSheet matches the registry", () => {
  for (const name of ["guest", "consumer", "producer", "admin"]) {
    it(`accountSheet surface, ${name}`, () => {
      const state = STATES[name];
      // BottomNav.jsx:133 — showBiz is the MEH-669 consumer gate, and the
      // registry spells the same predicate as audience "consumer".
      const showBiz = state.role !== "producer" && state.role !== "admin";
      const { container } = render(
        <AccountSheet
          open
          onClose={() => {}}
          user={state.user}
          logout={() => {}}
          showBiz={showBiz}
        />,
      );
      expect(sortLinks(renderedLinks(container))).toEqual(
        sortLinks(expectedLinks("accountSheet", state)),
      );
    });
  }

  it("renders the sheet controls the registry declares", () => {
    render(
      <AccountSheet
        open
        onClose={() => {}}
        user={STATES.consumer.user}
        logout={() => {}}
        showBiz
      />,
    );
    expect(screen.getAllByTestId("language-toggle")).toHaveLength(1);
    expect(screen.getByText("account.menu.logout")).toBeInTheDocument();
  });

  it("a signed-out sheet shows no logout control", () => {
    render(
      <AccountSheet
        open
        onClose={() => {}}
        user={null}
        logout={() => {}}
        showBiz
      />,
    );
    expect(screen.queryByText("account.menu.logout")).toBeNull();
  });
});

// ──────────────────────── the asymmetries, pinned as facts ────────────────────────

describe("MEH-1703 — recorded asymmetries hold as described", () => {
  /**
   * These pin the three shapes the registry's `note` fields describe. They are
   * NOT approval of the behaviour — MEH-1703 chunk 1 changes nothing. They
   * exist so that if a later chunk closes one of these gaps, the registry and
   * this file must be updated together rather than drifting apart.
   */
  it("favorites/settings are ungated in the sheet but auth-gated in the dropdown", () => {
    const { container } = render(
      <AccountSheet open onClose={() => {}} user={null} logout={() => {}} showBiz />,
    );
    const guestSheetHrefs = renderedLinks(container).map((l) => l.href);
    expect(guestSheetHrefs).toContain("/favorites");
    expect(guestSheetHrefs).toContain("/settings");

    cleanup();
    userRef.current = null;
    const header = render(<Header />);
    expect(renderedLinks(header.container).map((l) => l.href)).not.toContain(
      "/favorites",
    );
  });

  it("/admin has a desktop entry and no mobile one (the MEH-1701 shape)", () => {
    userRef.current = STATES.admin.user;
    const header = render(<Header />);
    openUserMenu();
    expect(renderedLinks(header.container).map((l) => l.href)).toContain("/admin");

    cleanup();
    const sheet = render(
      <AccountSheet
        open
        onClose={() => {}}
        user={STATES.admin.user}
        logout={() => {}}
        showBiz={false}
      />,
    );
    expect(renderedLinks(sheet.container).map((l) => l.href)).not.toContain("/admin");
  });

  it("the home item renders a different i18n key on each shell", () => {
    const home = NAV_ITEMS.find((i) => i.id === "home");
    expect(home.surfaces.header.labelKey).not.toBe(
      home.surfaces.bottomNav.labelKey,
    );

    userRef.current = null;
    const header = render(<Header />);
    const headerHome = renderedLinks(header.container).find((l) => l.href === "/");
    expect(headerHome.label).toBe(home.surfaces.header.labelKey);

    cleanup();
    const bottom = render(<BottomNav />);
    const bottomHome = renderedLinks(bottom.container).find((l) => l.href === "/");
    expect(bottomHome.label).toBe(home.surfaces.bottomNav.labelKey);
  });
});
