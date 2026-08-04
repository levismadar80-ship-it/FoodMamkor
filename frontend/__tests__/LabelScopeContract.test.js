import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ATTRIBUTE_LABELS } from "@/lib/attribute-labels";
import { CHIPS_CONFIG, PRODUCERS_CHIPS_CONFIG } from "@/lib/producer-filters";
import { TOGGLE_CHIPS } from "@/lib/map-chips";

// MEH-1507 — Label Scope Contract guard.
//
// Pattern source: the MEH-1472 emoji guard (NoEmojiInComponents.test.js) — a
// vitest test that enforces an invariant on the REAL modules and runs inside the
// existing suite (Frontend unit tests → the required "CI gate"). Implemented as a
// vitest test, NOT a new .github/workflows step, because .github/workflows/** is
// CC-deny (MEH-671) and vitest already gates every PR — the emoji guard it cites
// as its pattern is itself a vitest test, so this matches the precedent exactly.
//
// The contract: every consumer-facing label states its SCOPE (what it applies to)
// and its EVIDENCE (who established it). A new label added to ATTRIBUTE_LABELS /
// CHIPS_CONFIG / TOGGLE_CHIPS without both fields fails this gate — closing the
// class fixed four times point-wise (MEH-986 · MEH-1259 · MEH-1439 · MEH-1492).
// Full contract + precedents: .claude/rules/labels.md.

const SCOPES = new Set(["business", "any-product", "facility"]);
const EVIDENCE = new Set(["self-declared", "admin-verified", "system"]);

// Returns [] when the entry satisfies the contract, else a list of problems.
function contractProblems(name, entry) {
  const problems = [];
  if (!entry || typeof entry !== "object") {
    problems.push(`${name}: not an object`);
    return problems;
  }
  if (!SCOPES.has(entry.scope)) {
    problems.push(`${name}: scope ${JSON.stringify(entry.scope)} not one of ${[...SCOPES].join(" | ")}`);
  }
  if (!EVIDENCE.has(entry.evidence)) {
    problems.push(`${name}: evidence ${JSON.stringify(entry.evidence)} not one of ${[...EVIDENCE].join(" | ")}`);
  }
  return problems;
}

// The three consumer-facing label surfaces the contract governs, flattened to
// [key, entry] pairs. CHIPS_CONFIG / TOGGLE_CHIPS spread their ATTRIBUTE_LABELS
// object (or the /map-local grass_fed object), so every entry carries scope +
// evidence directly on the chip.
const SURFACES = {
  ATTRIBUTE_LABELS: Object.entries(ATTRIBUTE_LABELS),
  CHIPS_CONFIG: CHIPS_CONFIG.map((c) => [c.key, c]),
  // MEH-1881: /producers renders a superset of CHIPS_CONFIG — its extra
  // chip is defined in producer-filters.js, not in ATTRIBUTE_LABELS, so
  // without this line the newest consumer-facing chip on the site would be
  // the one surface the scope contract does not check. Listing the whole
  // array (not just the delta) keeps that true for whatever is added next.
  PRODUCERS_CHIPS_CONFIG: PRODUCERS_CHIPS_CONFIG.map((c) => [c.key, c]),
  TOGGLE_CHIPS: TOGGLE_CHIPS.map((c) => [c.key, c]),
};

describe("MEH-1507 Label Scope Contract — every label declares scope + evidence", () => {
  it("scans a non-trivial set of labels (guards a no-op)", () => {
    const total = Object.values(SURFACES).reduce((n, arr) => n + arr.length, 0);
    expect(total).toBeGreaterThan(15);
  });

  it("the validator rejects a missing/invalid field (guards a broken guard)", () => {
    expect(contractProblems("ok", { label: "x", scope: "business", evidence: "self-declared" })).toEqual([]);
    // missing evidence, missing scope, invalid value, non-object → all flagged
    expect(contractProblems("x", { label: "x", scope: "business" }).length).toBeGreaterThan(0);
    expect(contractProblems("x", { label: "x", evidence: "self-declared" }).length).toBeGreaterThan(0);
    expect(contractProblems("x", { label: "x", scope: "whole-planet", evidence: "self-declared" }).length).toBeGreaterThan(0);
    expect(contractProblems("x", null).length).toBeGreaterThan(0);
  });

  for (const [surface, entries] of Object.entries(SURFACES)) {
    it(`${surface}: every entry declares a valid scope + evidence`, () => {
      const problems = entries.flatMap(([key, entry]) =>
        contractProblems(`${surface}.${key}`, entry),
      );
      expect(
        problems,
        `Label Scope Contract violation — add scope (business | any-product | facility) ` +
          `and evidence (self-declared | admin-verified | system) to each entry ` +
          `(see .claude/rules/labels.md):\n  ${problems.join("\n  ")}`,
      ).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// MEH-1549 — Indicators & counters.
//
// Sibling rule to the scope contract above, same file for the same reason
// (.github/workflows/** is CC-deny, vitest already gates every PR). Scope
// answers "what does this label apply to"; disclosure answers "what is behind
// this indicator". The +N badge-overflow counter was the second question's
// failing case — a dead <span> on an otherwise fully tappable badge row, which
// QA hit directly ("אני לא מבינה מה זה"). MEH-1547 made it a Popover trigger;
// this guard stops a future refactor from silently flattening it back.
//
// Fail→pass proof: against the pre-MEH-1547 markup —
//   <span data-testid="badge-overflow" dir="ltr">+{n}</span>
// — all three assertions below fail (tagName SPAN, no aria-haspopup, and the
// role-based query finds nothing). Against the shipped component they pass.
// ---------------------------------------------------------------------------

// ProducerCard pulls in the app's client-side world; mock only what jsdom
// cannot provide, mirroring ProducerCard.test.jsx.
vi.mock("next-intl", () => ({
  useTranslations: () => (key, values = {}) =>
    key === "producer.card.badges.overflow_aria"
      ? `הצגת עוד ${values.count} תגיות`
      : key,
  useLocale: () => "he",
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...p }) => <a href={href} {...p}>{children}</a>,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...p }) => <a href={href} {...p}>{children}</a>,
}));
vi.mock("next/image", () => ({ default: ({ src, alt }) => <img src={src} alt={alt} /> }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/api", () => ({ default: { post: vi.fn(), delete: vi.fn() } }));
vi.mock("@/lib/toast", () => ({
  showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/post-login-action", () => ({ enqueueFavoriteOnLogin: vi.fn() }));
vi.mock("@/lib/favorites-cache", () => ({
  ensureFavoritesLoaded: () => Promise.resolve(new Set()),
  isFavorited: () => false,
  setFavoritedLocal: vi.fn(),
  subscribeFavorites: () => () => {},
}));

describe("MEH-1549 Indicators & counters — overflow counters are interactive", () => {
  it("ProducerCard +N badge-overflow offers disclosure, not a dead glyph", async () => {
    const { default: ProducerCard } = await import("@/components/ProducerCard");
    // 5 earned badges (verified · grass_fed · gluten_free · kosher · delivery)
    // → 2 rendered, 3 collapsed into "+3".
    render(
      <ProducerCard
        producer={{
          id: "p-1",
          name: "עסק לדוגמה",
          city: "תל אביב-יפו",
          images: [],
          categories: [],
          verification_tier: "verified",
          verified_at: "2026-01-01",
          grass_fed: true,
          has_gluten_free_products: true,
          kashrut_verified_at: "2026-01-01T00:00:00Z",
          has_delivery: true,
          reviews_count: 0,
          avg_rating: null,
        }}
      />,
    );

    const chip = screen.getByTestId("badge-overflow");
    expect(
      chip.tagName,
      "badge-overflow must be a real control, not a static span — " +
        "see .claude/rules/labels.md § Indicators & counters (MEH-1549)",
    ).toBe("BUTTON");
    expect(
      chip.getAttribute("aria-haspopup"),
      "badge-overflow must announce that it opens a disclosure (aria-haspopup)",
    ).toBeTruthy();
    // Reachable by role, i.e. actually exposed to assistive tech as a control.
    expect(screen.getAllByRole("button").includes(chip)).toBe(true);
  });
});
