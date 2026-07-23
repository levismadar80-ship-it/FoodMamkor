import { describe, it, expect } from "vitest";
import { ATTRIBUTE_LABELS } from "@/lib/attribute-labels";
import { CHIPS_CONFIG } from "@/lib/producer-filters";
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
