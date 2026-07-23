import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { CATEGORY_ICONS } from "../lib/category-registry";

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
