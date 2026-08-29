import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ATTRIBUTE_LABELS } from "@/lib/attribute-labels";
import { CHIPS_CONFIG, PRODUCERS_CHIPS_CONFIG } from "@/lib/producer-filters";
import { TOGGLE_CHIPS } from "@/lib/map-chips";
import { BADGE_CONFIG } from "@/lib/badges";
import { FILTER_AXES } from "@/lib/filter-taxonomy";

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
// MEH-1753 added `editorial` as the 4th value. `recommended` ("בחירת העורכת")
// is neither self-declared (the owner cannot set it) nor admin-verified
// (nothing is checked against an external register) — it is an editor's
// opinion, and ADR-030 bans buying it. Filing it under `admin-verified` would
// have been the MEH-1492 over-claim again: that value reads as an earned
// status.
const EVIDENCE = new Set(["self-declared", "admin-verified", "editorial", "system"]);

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
  // MEH-1753: badges are labels in exactly the contract's sense — a term
  // attached to a business as a claim about it. All four precedents the
  // contract encodes (MEH-986 kosher · MEH-1259 organic · MEH-1439 diet
  // tooltips · MEH-1492 editor's pick) are BADGE incidents, so this was the
  // one label surface still outside the rule its own history wrote.
  BADGE_CONFIG: Object.entries(BADGE_CONFIG),
};

// MEH-1753 — the nine claims that exist on BOTH a badge and a filter axis.
// Eight share a key; `delivery` ↔ `has_delivery` do not, which is why the pair
// is mapped explicitly rather than inferred from key equality.
//
// This is what keeps the two declarations from being hand-copies: each pair
// must AGREE on scope and evidence, so changing one side alone goes red.
//
// The labels are deliberately NOT compared. MEH-2214 changed why: this comment
// used to justify it by pointing at `verified`, which read "מאומת" as a badge
// and "רישוי מאומת" as an axis. That pair now matches, and it was the last
// one that did not — all nine agree character-for-character today. So the
// exemption is an ALLOWANCE, not a description: the contract governs the CLAIM
// (scope) and its SOURCE (evidence), while copy is a separate decision that may
// legitimately diverge again. Asserting equality here would quietly convert a
// copy decision into a test failure.
const SHARED_CLAIMS = [
  ["verified", "verified"],
  ["grass_fed", "grass_fed"],
  ["gluten_free", "gluten_free"],
  ["vegetarian", "vegetarian"],
  ["vegan", "vegan"],
  ["lactose_free", "lactose_free"],
  ["no_added_sugar", "no_added_sugar"],
  ["kosher", "kosher"],
  ["delivery", "has_delivery"],
];

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

  // ── MEH-1753 ─────────────────────────────────────────────────────────────

  it("BADGE_CONFIG carries all eleven badges (guards a shrinking scan)", () => {
    // A COUNT, not a list of names: the loop above is satisfied by an empty
    // BADGE_CONFIG, so without this a deleted entry would leave the contract
    // reporting a clean pass over ten.
    expect(Object.keys(BADGE_CONFIG)).toHaveLength(11);
  });

  it("every badge that is also a filter axis agrees with it on scope + evidence", () => {
    const mismatches = [];
    for (const [badgeKey, axisKey] of SHARED_CLAIMS) {
      const badge = BADGE_CONFIG[badgeKey];
      const axis = FILTER_AXES[axisKey];
      if (!badge) {
        mismatches.push(`BADGE_CONFIG.${badgeKey} is missing`);
        continue;
      }
      if (!axis) {
        mismatches.push(`FILTER_AXES.${axisKey} is missing`);
        continue;
      }
      if (badge.scope !== axis.scope) {
        mismatches.push(
          `${badgeKey}: badge scope "${badge.scope}" vs axis ${axisKey} scope "${axis.scope}"`,
        );
      }
      if (badge.evidence !== axis.evidence) {
        mismatches.push(
          `${badgeKey}: badge evidence "${badge.evidence}" vs axis ${axisKey} evidence "${axis.evidence}"`,
        );
      }
    }
    expect(
      mismatches,
      `A claim rendered on two surfaces must not describe itself two ways:\n  ${mismatches.join("\n  ")}`,
    ).toEqual([]);
  });

  it("the pairing itself is still real (guards a guard that compares nothing)", () => {
    // If a key were renamed on either side, every pair would silently resolve
    // to undefined-vs-undefined and the assertion above would pass while
    // comparing nothing. Both sides must exist for all nine.
    for (const [badgeKey, axisKey] of SHARED_CLAIMS) {
      expect(BADGE_CONFIG[badgeKey], `BADGE_CONFIG.${badgeKey}`).toBeDefined();
      expect(FILTER_AXES[axisKey], `FILTER_AXES.${axisKey}`).toBeDefined();
    }
    expect(SHARED_CLAIMS).toHaveLength(9);
  });

  it("adding scope + evidence changed NO rendered string (the hard gate)", () => {
    // MEH-1753 is metadata-only. These are the exact strings and values every
    // badge surface renders, pinned verbatim: if any future edit to this file
    // moves one, this test names it rather than letting a VRT tolerance
    // swallow it (MEH-1765 — a green VRT is not evidence the frame is
    // unchanged).
    const rendered = Object.fromEntries(
      Object.entries(BADGE_CONFIG).map(([k, v]) => [
        k,
        { key: v.key, label: v.label, tooltip: v.tooltip, color: v.color, aboutHref: v.aboutHref ?? null },
      ]),
    );
    expect(rendered).toEqual({
      verified: {
        key: "verified",
        label: "מאומת",
        tooltip: "בית העסק הציג מסמך רישוי או אישור פטור רשמי שנבדק ידנית.",
        color: "primary",
        aboutHref: null,
      },
      recommended: {
        key: "recommended",
        label: "בחירת העורכת",
        tooltip:
          "בחירה אישית של עורכת מהמקור — על איכות, טריות או סיפור מיוחד. אי אפשר לקנות את התגית הזו.",
        color: "accent",
        aboutHref: "/about#editors-pick",
      },
      new: {
        key: "new",
        label: "חדש",
        tooltip: "העסק הצטרף אלינו בחודש האחרון.",
        color: "muted",
        aboutHref: null,
      },
      grass_fed: {
        key: "grass_fed",
        label: "גראס פד",
        tooltip: "בעלי החיים גדלים על מרעה ולא על תערובת תעשייתית.",
        color: "muted",
        aboutHref: null,
      },
      gluten_free: {
        key: "gluten_free",
        label: "ללא גלוטן",
        tooltip: "לעסק יש מוצרים ללא גלוטן מסומנים בקטלוג.",
        color: "muted",
        aboutHref: null,
      },
      vegetarian: {
        key: "vegetarian",
        label: "צמחוני",
        tooltip: "לעסק יש מוצרים צמחוניים מסומנים בקטלוג.",
        color: "muted",
        aboutHref: null,
      },
      vegan: {
        key: "vegan",
        label: "טבעוני",
        tooltip: "לעסק יש מוצרים טבעוניים מסומנים בקטלוג.",
        color: "muted",
        aboutHref: null,
      },
      lactose_free: {
        key: "lactose_free",
        label: "ללא לקטוז",
        tooltip: "לעסק יש מוצרים ללא לקטוז מסומנים בקטלוג.",
        color: "muted",
        aboutHref: null,
      },
      no_added_sugar: {
        key: "no_added_sugar",
        label: "ללא סוכר מוסף",
        tooltip: "לעסק יש מוצרים ללא סוכר מוסף מסומנים בקטלוג.",
        color: "muted",
        aboutHref: null,
      },
      kosher: {
        key: "kosher",
        label: "כשרות מאומתת",
        tooltip: "המוצרים תחת השגחת כשרות.",
        color: "muted",
        aboutHref: null,
      },
      delivery: {
        key: "delivery",
        label: "משלוח",
        tooltip: "העסק מוסר או שולח לכתובת שלך.",
        color: "muted",
        aboutHref: null,
      },
    });
  });
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
