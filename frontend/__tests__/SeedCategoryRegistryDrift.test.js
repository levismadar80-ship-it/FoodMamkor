import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  CATEGORY_ICONS,
  CATEGORY_GLYPH_FALLBACK,
  DEFAULT_CATEGORY_STYLE,
  categoryGlyphKey,
  resolveCategoryGlyph,
} from "../lib/category-registry";

// MEH-1482: the backend taxonomy (backend/seed_data.py CATEGORIES) and the
// frontend glyph map (CATEGORY_ICONS, surfaced through lib/category-registry.js)
// are two hand-maintained lists that must stay aligned — a seeded category with
// no glyph key silently falls through to the DEFAULT Leaf on chips / the
// register selector / home cards (the exact class of drift MEH-927/MEH-743/
// MEH-1268 kept re-introducing when categories were split or renamed).
//
// This is the guard: it re-derives the seed category names from seed_data.py
// (read as TEXT — never import/execute Python) and asserts every one has a key
// in CATEGORY_ICONS. Direction is one-way — seed ⊆ glyph keys ONLY. Registry-only
// keys are allowed (the CATEGORY_STYLES map deliberately carries 2 stale
// combined legend keys that match no live DB category — MEH-1453 shape note;
// those live in CATEGORY_STYLES, not CATEGORY_ICONS, and are out of scope for
// this seed⊆glyph check anyway). The Phase B reverse direction (flag orphan
// registry keys) is MEH-1456, not this test.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEED_PATH = path.join(HERE, "..", "..", "backend", "seed_data.py");
// MEH-2163: the SECOND committed backend source of the same 18-row taxonomy —
// `NAME_TO_SLUG` in the slug service. It exists independently of seed_data.py
// (the migration/backfill needed a table it could carry without importing app
// code), which is exactly what makes it usable as a cross-check: if either
// parser below silently truncates, the two counts stop agreeing. That is the
// count assertion this file used to lack — `length > 0` passes on a regex that
// found 1 of 18.
const SLUG_TABLE_PATH = path.join(
  HERE, "..", "..", "backend", "app", "services", "category_slug.py",
);

/**
 * Extract the Hebrew category names from the CATEGORIES list in seed_data.py.
 * seed_data.py is read as text; each entry is a `("name", "emoji"),` tuple.
 * We scope to the `CATEGORIES = [ … ]` block (non-greedy to its first `]`) so
 * unrelated later arrays (`category_ids: [1]`, …) and quoted Hebrew inside the
 * block's `#` comments (e.g. `"בשר ודגים"`, joined with ` + `, never the
 * `("x", "y")` tuple shape) can't leak in.
 */
function seedCategoryNames() {
  const seedText = readFileSync(SEED_PATH, "utf8");
  const block = seedText.match(/CATEGORIES\s*=\s*\[([\s\S]*?)\]/);
  if (!block) return [];
  const tupleRe = /\(\s*"([^"]+)"\s*,\s*"[^"]*"\s*\)/g;
  const names = [];
  let m;
  while ((m = tupleRe.exec(block[1])) !== null) {
    names.push(m[1]);
  }
  return names;
}

/**
 * MEH-2163: the category names of `NAME_TO_SLUG` in category_slug.py, read as
 * TEXT for the same reason as the seed above (never import/execute Python).
 * Scoped to the `NAME_TO_SLUG = { … }` block so `_HEBREW_TO_LATIN` below it —
 * same `"x": "y",` shape, 27 rows — cannot leak in.
 */
function slugTableNames() {
  const src = readFileSync(SLUG_TABLE_PATH, "utf8");
  const block = src.match(/NAME_TO_SLUG\s*=\s*\{([\s\S]*?)\n\}/);
  if (!block) return [];
  const rowRe = /"([^"]+)"\s*:\s*"[^"]*"/g;
  const names = [];
  let m;
  while ((m = rowRe.exec(block[1])) !== null) {
    names.push(m[1]);
  }
  return names;
}

describe("MEH-1482 seed ↔ category-registry glyph drift gate", () => {
  const seedNames = seedCategoryNames();
  const glyphKeys = new Set(Object.keys(CATEGORY_ICONS));

  it("parsed a non-empty seed category list (guards a regex/format no-op)", () => {
    expect(seedNames.length).toBeGreaterThan(0);
    expect(glyphKeys.size).toBeGreaterThan(0);
  });

  it("every seed_data.py category name has a glyph key in category-registry.js", () => {
    const missing = seedNames.filter((name) => !glyphKeys.has(name));
    expect(
      missing,
      missing.length
        ? `Seed categories with no glyph — add entry in category-registry.js: ${missing.join(", ")}`
        : undefined,
    ).toEqual([]);
  });
});

/**
 * MEH-2163 — the registry contract itself: every backend category RESOLVES to a
 * glyph, and the lookup is TOTAL (an unknown key gets the fallback, never
 * `undefined` and never a prototype member).
 *
 * Deliberately absent: the reverse direction (a registry key matching no
 * backend category). That is MEH-1456, and asserting it here would close that
 * ticket's scope by accident — CATEGORY_STYLES already carries two stale
 * legend-only keys on purpose, so "no orphans" is a decision, not a lemma.
 */
describe("MEH-2163 category-glyph registry: total lookup + backend coverage", () => {
  const seedNames = seedCategoryNames();
  const slugNames = slugTableNames();

  // The control, and it runs first: two independently-maintained backend files
  // describe the same taxonomy, so if either regex stops matching (a reformat,
  // a switch to single quotes, a rename of the constant) the counts diverge and
  // this fails BEFORE any coverage assertion below can report a reassuring
  // green over a list of 1. `length > 0` alone cannot do that.
  it("both backend sources parse, and agree on how many categories exist", () => {
    expect(seedNames.length).toBeGreaterThan(0);
    expect(slugNames.length).toBeGreaterThan(0);
    expect(
      seedNames.length,
      `seed_data.py CATEGORIES parsed ${seedNames.length} rows but ` +
        `category_slug.py NAME_TO_SLUG parsed ${slugNames.length} — one of the ` +
        `two parsers is truncating, or the taxonomy genuinely drifted apart.`,
    ).toBe(slugNames.length);

    const notInSlugTable = seedNames.filter((n) => !slugNames.includes(n));
    expect(
      notInSlugTable,
      `seed categories absent from NAME_TO_SLUG: ${notInSlugTable.join(", ")}`,
    ).toEqual([]);
  });

  it("every backend category resolves to its OWN glyph, not the fallback", () => {
    const fellBack = seedNames.filter((name) => resolveCategoryGlyph(name).isFallback);
    expect(
      fellBack,
      fellBack.length
        ? `Backend categories with no glyph of their own (they render the ` +
          `fallback): ${fellBack.join(", ")} — add a row to CATEGORY_ICONS in ` +
          `frontend/components/CategoryIcons.jsx.`
        : undefined,
    ).toEqual([]);
  });

  it("an unknown key returns the fallback rather than undefined", () => {
    for (const unknown of ["קטגוריה שאין", "", "definitely-not-a-category"]) {
      const { glyph, isFallback } = resolveCategoryGlyph(unknown);
      expect(isFallback).toBe(true);
      expect(glyph).toBe(CATEGORY_GLYPH_FALLBACK);
    }
  });

  // The consolidation MEH-2163 performed: three call sites each decided their
  // own fallback (two inline `<Leaf>`s plus this default pin style). They are
  // one constant now, and this is what stops them drifting apart again.
  // (Not a `typeof … === "function"` check: a Phosphor icon is a forwardRef
  // OBJECT, so that assertion fails on a perfectly valid component — measured,
  // it is why this line reads the way it does.)
  it("the default map-pin style uses that same one fallback component", () => {
    expect(DEFAULT_CATEGORY_STYLE.icon).toBe(CATEGORY_GLYPH_FALLBACK);
  });

  it("null / undefined / an object with no name are total too", () => {
    for (const nothing of [null, undefined, {}, { slug: "meat" }]) {
      expect(resolveCategoryGlyph(nothing).glyph).toBe(CATEGORY_GLYPH_FALLBACK);
      expect(resolveCategoryGlyph(nothing).isFallback).toBe(true);
    }
  });

  // The discriminating case. Any OTHER unknown key is answered identically by
  // `CATEGORY_ICONS[key] || FALLBACK` and by `Object.hasOwn` — the two forms
  // are indistinguishable except on names that exist on Object.prototype, where
  // the `||` form hands back a builtin as a "glyph component" and the fallback
  // never fires. The first expectation is the control that proves these four
  // keys really are the separating case, so a future reader cannot mistake this
  // for an ordinary unknown-key test.
  it("a prototype-member name falls back (|| would return a builtin here)", () => {
    for (const key of ["constructor", "toString", "valueOf", "__proto__"]) {
      expect(CATEGORY_ICONS[key], `${key} must be truthy via the prototype`).toBeTruthy();
      const { glyph, isFallback } = resolveCategoryGlyph(key);
      expect(isFallback, `${key} must not resolve through the prototype`).toBe(true);
      expect(glyph).toBe(CATEGORY_GLYPH_FALLBACK);
    }
  });

  // The key indirection MEH-1456 will swap. Pinned so that swap is a visible,
  // reviewed change rather than a silent one.
  it("categoryGlyphKey reads `name` today (MEH-1456 swaps it to `slug`)", () => {
    expect(categoryGlyphKey("בשר")).toBe("בשר");
    expect(categoryGlyphKey({ name: "בשר", slug: "meat" })).toBe("בשר");
    expect(categoryGlyphKey(null)).toBe("");
  });
});
