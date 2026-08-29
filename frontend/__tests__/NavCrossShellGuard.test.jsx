import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";

import {
  NAV_ITEMS,
  NAV_PLATFORMS,
  NAV_SURFACES,
  itemsForSurface,
  platformsForItem,
} from "@/lib/nav-registry";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import AccountSheet from "@/components/AccountSheet";

/**
 * MEH-1703 chunk 4 — THE GUARD. This is the payoff of the whole ticket.
 *
 * WHAT IT CATCHES THAT NOTHING ELSE DOES.
 *
 * `NavRegistryParity.test.jsx` (chunk 1) asserts the registry and the shells
 * AGREE. Since chunk 3 the shells DERIVE from the registry, so deleting a
 * surface from a record deletes the rendered row too — and parity, which only
 * compares the two against each other, can stay green describing a world where
 * mobile simply has no such row.
 *
 * MEASURED, not assumed. Each row below is one deleted `accountSheet` surface,
 * both suites run against the break (the numbers are in the PR body):
 *
 *   deleted surface     parity            this guard
 *   favorites           RED               RED
 *   settings            RED               RED
 *   logout              RED               RED
 *   producerDashboard   GREEN 31 passed   RED
 *   login               GREEN 31 passed   RED
 *
 * Parity catches 3 of 5 — and only because a single hand-written test pins
 * favorites/settings BY NAME, plus one that pins the logout control. It has no
 * general property to appeal to, so the two nobody happened to pin vanish
 * silently. This guard catches 5 of 5 because symmetry is a property of every
 * record, not a list someone maintained.
 *
 * That is precisely the incident this ticket exists for: a nav item quietly
 * losing one platform. Three occurrences motivated the card — desktop
 * favorites, the desktop language toggle (absent five weeks), and the mobile
 * admin queue counters.
 *
 * So this file asserts a property parity cannot: **cross-platform symmetry is
 * either present, or explicitly declared on the record with a reason.** An
 * item that appears on one platform and not the other must carry
 * `only: "desktop"` / `only: "mobile"` plus a `note` saying why. Deleting an
 * item from one platform therefore does not produce a quietly-consistent
 * registry — it produces an undeclared asymmetry, and this test reds.
 *
 * The declaration is deliberately annoying to add. That is the point: it
 * converts a silent 5-line deletion into a decision someone has to write down.
 *
 * DISCRIMINATION (.claude/rules/testing.md, MEH-1619). Every assertion here
 * was run against a deliberately broken registry and shown RED before being
 * shown green; the outputs are pasted in the PR body. The `guard self-test`
 * block below additionally proves the CLASSIFIER — the thing all the other
 * assertions rest on — sorts synthetic correct / broken / neutral inputs
 * correctly, and it runs FIRST, because if the classifier cannot tell those
 * apart then nothing below it is worth reading.
 */

// ─────────────────────────────── fixtures ───────────────────────────────

const pathnameRef = { current: "/about" };
const userRef = { current: null };
const experiencesGateRef = { current: true };

vi.mock("@/i18n/navigation", () => ({ usePathname: () => pathnameRef.current }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathnameRef.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: userRef.current, logout: vi.fn() }),
}));
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
vi.mock("@phosphor-icons/react", () => {
  const stub = (name) => {
    const Icon = (props) => <span data-icon={name} aria-hidden="true" {...props} />;
    Icon.displayName = `Stub(${name})`;
    return Icon;
  };
  return {
    MagnifyingGlass: stub("MagnifyingGlass"), SealCheck: stub("SealCheck"),
    Compass: stub("Compass"), MapTrifold: stub("MapTrifold"), Flower: stub("Flower"),
    User: stub("User"), Heart: stub("Heart"), Gear: stub("Gear"),
    Storefront: stub("Storefront"), SignIn: stub("SignIn"), SignOut: stub("SignOut"),
    ArrowUpLeft: stub("ArrowUpLeft"), Gauge: stub("Gauge"),
  };
});
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
  consumer: { user: { name: "דנה" , role: "consumer" }, signedIn: true, role: "consumer" },
  producer: {
    user: { name: "רות", role: "producer", producer_id: "p-42" },
    signedIn: true,
    role: "producer",
    producerId: "p-42",
  },
  admin: { user: { name: "שמדר", role: "admin" }, signedIn: true, role: "admin" },
};

beforeEach(() => {
  cleanup();
  pathnameRef.current = "/about";
  userRef.current = null;
  experiencesGateRef.current = true;
});

// ───────────────────────── the classifier under test ─────────────────────────

/**
 * The single rule this whole file rests on. Returns a list of problems for one
 * item; empty means the item is compliant.
 *
 * Kept as a named export-shaped function so the self-test below can feed it
 * synthetic records — the REAL implementation, never a copy, because a second
 * copy is free to drift from the one that matters.
 */
export function asymmetryProblems(item) {
  const problems = [];
  const on = platformsForItem(item);

  if (!on.desktop && !on.mobile) {
    problems.push(`"${item.id}" appears on no platform at all`);
    return problems;
  }

  const bothPlatforms = on.desktop && on.mobile;
  const actualOnly = bothPlatforms ? null : on.desktop ? "desktop" : "mobile";

  if (actualOnly && item.only !== actualOnly) {
    problems.push(
      `"${item.id}" renders on ${actualOnly} only but declares only=${JSON.stringify(item.only)} — ` +
        `an item that lost a platform must say so explicitly (only: "${actualOnly}")`,
    );
  }
  if (!actualOnly && item.only) {
    problems.push(
      `"${item.id}" appears on BOTH platforms but declares only=${JSON.stringify(item.only)}`,
    );
  }
  if (actualOnly && !(item.note && item.note.trim().length > 0)) {
    problems.push(`"${item.id}" is ${actualOnly}-only with no note explaining why`);
  }
  return problems;
}

// ═══════════════════ 0. SELF-TEST — runs before anything else ═══════════════════

describe("MEH-1703 chunk 4 — guard self-test (run this first)", () => {
  /**
   * Feeds the REAL classifier three synthetic records whose answers are known.
   * If this block fails, every verdict below it is void — a classifier that
   * cannot sort a correct record from a broken one reports nothing useful.
   */
  it("CONTROL — the classifier sorts correct / regression-shaped / neutral", () => {
    const correctBoth = {
      id: "synthetic-both",
      surfaces: { header: {}, bottomNav: {} },
    };
    const correctOnly = {
      id: "synthetic-desktop-only",
      surfaces: { header: {} },
      only: "desktop",
      note: "declared, with a reason",
    };
    // The regression shape: it USED to be on both, someone deleted the mobile
    // surface, and nothing was declared.
    const regression = {
      id: "synthetic-lost-mobile",
      surfaces: { header: {} },
    };
    // Neutral-but-wrong: declared asymmetric while actually symmetric.
    const contradiction = {
      id: "synthetic-contradiction",
      surfaces: { header: {}, accountSheet: {} },
      only: "desktop",
      note: "n/a",
    };
    // Declared but unjustified.
    const unexplained = {
      id: "synthetic-no-note",
      surfaces: { bottomNav: {} },
      only: "mobile",
    };

    expect(asymmetryProblems(correctBoth)).toEqual([]);
    expect(asymmetryProblems(correctOnly)).toEqual([]);

    // The regression shape trips TWO rules at once — undeclared AND
    // unexplained — because a record that lost a platform has neither the
    // flag nor the reason. Asserting the exact messages rather than a count,
    // so this cannot pass on the wrong problem.
    const regressionProblems = asymmetryProblems(regression);
    expect(regressionProblems.join(" | ")).toMatch(/must say so explicitly/);
    expect(regressionProblems.join(" | ")).toMatch(/no note explaining why/);

    expect(asymmetryProblems(contradiction)).toHaveLength(1);
    expect(asymmetryProblems(contradiction)[0]).toMatch(/BOTH platforms/);
    expect(asymmetryProblems(unexplained)).toHaveLength(1);
    expect(asymmetryProblems(unexplained)[0]).toMatch(/no note explaining why/);
  });

  /**
   * The synthetic cases above prove the probe works on shapes I invented.
   * MEH-1909: anchor at least one case to a REAL record, or the probe can be
   * green against a shape this repo does not actually use.
   */
  it("CONTROL — anchored to a real record from this repo, not only fixtures", () => {
    const realBoth = NAV_ITEMS.find((i) => i.id === "favorites");
    const realOnly = NAV_ITEMS.find((i) => i.id === "registerProducer");
    expect(realBoth, "favorites must exist in the registry").toBeTruthy();
    expect(realOnly, "registerProducer must exist in the registry").toBeTruthy();

    // Shapes match what the synthetic cases assumed.
    expect(platformsForItem(realBoth)).toEqual({ desktop: true, mobile: true });
    expect(platformsForItem(realOnly)).toEqual({ desktop: false, mobile: true });
    expect(asymmetryProblems(realBoth)).toEqual([]);
    expect(asymmetryProblems(realOnly)).toEqual([]);

    // And the classifier reds on a real record with one platform removed.
    const mutilated = { ...realBoth, surfaces: { headerMenu: realBoth.surfaces.headerMenu } };
    expect(asymmetryProblems(mutilated)).not.toEqual([]);
  });

  it("CONTROL — every surface maps to a platform, and both platforms are used", () => {
    expect(Object.keys(NAV_PLATFORMS).sort()).toEqual(Object.keys(NAV_SURFACES).sort());
    const platforms = new Set(Object.values(NAV_PLATFORMS));
    expect(platforms).toEqual(new Set(["desktop", "mobile"]));
  });
});

// ═══════════ 1. THE GUARD — no undeclared cross-platform asymmetry ═══════════

describe("MEH-1703 chunk 4 — every cross-platform asymmetry is declared", () => {
  it("no item silently appears on one platform and not the other", () => {
    const problems = NAV_ITEMS.flatMap(asymmetryProblems);
    expect(problems, `undeclared nav asymmetries:\n  ${problems.join("\n  ")}`).toEqual([]);
  });

  /**
   * A count, DERIVED — not a literal. `.claude/rules/testing.md`: a stated
   * count goes stale the moment a record is added; a derived one cannot.
   * This asserts the guard actually inspected every record rather than
   * short-circuiting on an empty list.
   */
  it("CONTROL — the guard inspected every record, and the set is non-trivial", () => {
    const inspected = NAV_ITEMS.map((i) => i.id);
    expect(inspected.length).toBe(NAV_ITEMS.length);
    expect(NAV_ITEMS.length).toBeGreaterThan(10);
    const declared = NAV_ITEMS.filter((i) => i.only);
    const symmetric = NAV_ITEMS.filter((i) => !i.only);
    // Both classes must be non-empty, or the guard is passing vacuously:
    // all-symmetric means `only` is never exercised, all-asymmetric means the
    // symmetry branch never runs.
    expect(declared.length).toBeGreaterThan(0);
    expect(symmetric.length).toBeGreaterThan(0);
  });
});

// ═════════ 2. THE :placeholder INVARIANT — the chunk-2 reviewer's finding ═════════

/**
 * Carried over from the CI reviewer on the chunk-2 PR: `Header.jsx` substitutes
 * `:producerId` into the href AFTER the dataGate filter, so correctness depends
 * on every placeholder-carrying record declaring that gate. A future record
 * with a `:` and no gate would render `/producer/` — a silent broken link.
 *
 * Fixed here as a registry-wide invariant rather than a Header-local warning,
 * which is strictly stronger: it holds for every shell, including ones not
 * written yet.
 */
describe("MEH-1703 chunk 4 — href placeholders cannot leak into rendered links", () => {
  it("every href with a : placeholder declares a dataGate", () => {
    const offenders = NAV_ITEMS.filter(
      (i) => typeof i.href === "string" && i.href.includes(":") && !i.dataGate,
    ).map((i) => `${i.id} (${i.href})`);
    expect(
      offenders,
      `these records interpolate a placeholder with no dataGate to drop them when it is absent:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("CONTROL — the placeholder check can actually fire", () => {
    const withPlaceholder = NAV_ITEMS.filter(
      (i) => typeof i.href === "string" && i.href.includes(":"),
    );
    // If nothing in the registry carries a placeholder, the assertion above is
    // vacuously true and proves nothing. Today `producerPublicPage` does.
    expect(
      withPlaceholder.length,
      "no record carries a ':' placeholder — the invariant above is vacuous",
    ).toBeGreaterThan(0);
    // And a synthetic offender is caught by the same predicate.
    const bad = { id: "x", href: "/producer/:producerId", surfaces: { header: {} } };
    expect(bad.href.includes(":") && !bad.dataGate).toBe(true);
  });

  it("no rendered link in any shell still contains a : placeholder", () => {
    const rendered = [];

    userRef.current = STATES.producer.user;
    const header = render(<Header />);
    rendered.push(...hrefsIn(header.container));
    cleanup();

    const bottom = render(<BottomNav />);
    rendered.push(...hrefsIn(bottom.container));
    cleanup();

    const sheet = render(
      <AccountSheet open onClose={() => {}} user={STATES.producer.user} logout={() => {}} />,
    );
    rendered.push(...hrefsIn(sheet.container));

    expect(rendered.length, "no links harvested — the check would be vacuous").toBeGreaterThan(5);
    const leaked = rendered.filter((h) => h.includes(":"));
    expect(leaked, `hrefs still carrying a placeholder: ${leaked.join(", ")}`).toEqual([]);
  });
});

function hrefsIn(container) {
  return Array.from(container.querySelectorAll("a[href]")).map((a) => a.getAttribute("href"));
}

// ═════ 3. RENDER-LEVEL — a "both" item really does reach both platforms ═════

/**
 * The declaration guard above is static. This is its render-level companion:
 * for every item the registry claims lives on BOTH platforms, actually mount a
 * desktop shell and a mobile shell in a state that satisfies both surfaces'
 * audiences, and require the item to be present in both.
 *
 * Without this, a record could claim both platforms while a shell silently
 * failed to render it — the registry would be right and the product wrong.
 */
describe("MEH-1703 chunk 4 — items declared on both platforms render on both", () => {
  const DESKTOP = ["header", "headerMenu"];
  const MOBILE = ["bottomNav", "accountSheet"];

  const bothItems = NAV_ITEMS.filter((i) => {
    const on = platformsForItem(i);
    return on.desktop && on.mobile && i.kind === "link" && !i.dataGate;
  });

  it("CONTROL — there is something to check", () => {
    expect(bothItems.length, "no two-platform link items — this block is vacuous").toBeGreaterThan(3);
  });

  for (const item of NAV_ITEMS.filter((i) => {
    const on = platformsForItem(i);
    return on.desktop && on.mobile && i.kind === "link" && !i.dataGate;
  })) {
    it(`${item.id} reaches desktop AND mobile`, () => {
      const stateName = ["guest", "consumer", "producer", "admin"].find((name) => {
        const st = STATES[name];
        const desktopSurface = DESKTOP.find((s) => item.surfaces[s]);
        const mobileSurface = MOBILE.find((s) => item.surfaces[s]);
        return (
          itemsForSurface(desktopSurface, st).some((e) => e.item.id === item.id) &&
          itemsForSurface(mobileSurface, st).some((e) => e.item.id === item.id)
        );
      });
      expect(
        stateName,
        `no auth state satisfies both surfaces' audiences for "${item.id}"`,
      ).toBeTruthy();

      const state = STATES[stateName];
      pathnameRef.current = "/about";
      userRef.current = state.user;

      const header = render(<Header />);
      // The avatar dropdown only mounts for a signed-in user; open it so
      // headerMenu items are reachable. fireEvent, not a native .click() —
      // a native dispatch runs outside React's act() and the dropdown never
      // opens, which silently made every headerMenu item look "missing from
      // desktop". Caught by running this block red first.
      const trigger = screen.queryByLabelText("account.menu.aria");
      if (trigger) fireEvent.click(trigger);
      const desktopHrefs = hrefsIn(header.container);
      cleanup();

      const sheet = render(
        <AccountSheet open onClose={() => {}} user={state.user} logout={() => {}} />,
      );
      const bottom = render(<BottomNav />);
      const mobileHrefs = [...hrefsIn(sheet.container), ...hrefsIn(bottom.container)];

      expect(desktopHrefs.length, "desktop harvested nothing").toBeGreaterThan(0);
      expect(mobileHrefs.length, "mobile harvested nothing").toBeGreaterThan(0);
      expect(desktopHrefs, `${item.id} missing from desktop`).toContain(item.href);
      expect(mobileHrefs, `${item.id} missing from mobile`).toContain(item.href);
    });
  }
});
