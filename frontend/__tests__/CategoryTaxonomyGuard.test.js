// MEH-3076 (Sapir 21/11) — one list of categories, complete everywhere.
//
// lib/category-taxonomy.js is the frontend's one category list. This guard
// holds it equal to the backend's own tables and fails when a category is
// missing a glyph, a /map group, or a name in either language, or when a
// registry carries a slug the list does not know. Both backend files are read
// as text: nothing in JS runs them (same pattern as categoryGroupCoverage).
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CATEGORY_TAXONOMY, slugsInGroup, taxonomyEntry } from "@/lib/category-taxonomy";
import { CATEGORY_GLYPHS, resolveCategoryGlyph } from "@/lib/category-registry";
import { CATEGORY_CHIPS } from "@/lib/map-chips";
import en from "@/messages/en.json";
import he from "@/messages/he.json";

const ROOT = path.resolve(__dirname, "../..");
const SLUG_PY = fs.readFileSync(path.join(ROOT, "backend/app/services/category_slug.py"), "utf8");
const start = SLUG_PY.indexOf("NAME_TO_SLUG = {");
const block = SLUG_PY.slice(start, SLUG_PY.indexOf("}", start));
const BACKEND = [...block.matchAll(/"([^"]+)":\s*"([a-z_]+)"/g)].map((m) => ({ name: m[1], slug: m[2] }));
const COFFEE_PY = fs.readFileSync(path.join(ROOT, "tests/test_meh3401_coffee_slug.py"), "utf8");
const COFFEE_SLUG = COFFEE_PY.match(/slug_for_name\("קפה"\)\s*==\s*"([a-z]+)"/)?.[1];
const COOKED_PY = fs.readFileSync(path.join(ROOT, "tests/test_meh3738_cooked_food_slug.py"), "utf8");
const COOKED_SLUG = COOKED_PY.match(/slug_for_name\("בישול לפי הזמנה"\)\s*==\s*"([a-z-]+)"/)?.[1];
const CAKES_PY = fs.readFileSync(path.join(ROOT, "tests/test_meh3911_cakes_slug.py"), "utf8");
const CAKES_SLUG = CAKES_PY.match(/slug_for_name\("עוגות וקינוחים"\)\s*==\s*"([a-z-]+)"/)?.[1];

const slugs = CATEGORY_TAXONOMY.map((c) => c.slug);
const groupKeys = CATEGORY_CHIPS.filter((c) => c.matches).map((c) => c.key);

describe("category taxonomy = the backend's categories (MEH-3076)", () => {
  it("control: both backend files were parsed", () => {
    expect(BACKEND.length).toBe(block.split("\n").filter((l) => /^\s+"/.test(l)).length);
    expect(BACKEND.length).toBe(18);
    expect(COFFEE_SLUG).toBe("kph");
    expect(COOKED_SLUG).toBe("byshvl-lpy-hzmnh");
    expect(CAKES_SLUG).toBe("avgvt-vkynvchym");
  });

  it("every seeded category is in the list with the same name and slug", () => {
    for (const b of BACKEND) {
      expect(CATEGORY_TAXONOMY.find((c) => c.slug === b.slug), b.slug).toMatchObject(b);
    }
  });

  it("the only other entries are the admin-created ones, under the backend's transliterated slugs", () => {
    const extra = CATEGORY_TAXONOMY.filter((c) => !BACKEND.some((b) => b.slug === c.slug));
    expect(extra).toEqual([
      { slug: COFFEE_SLUG, name: "קפה", group: "pantry" },
      // MEH-3738
      { slug: COOKED_SLUG, name: "בישול לפי הזמנה", group: "pantry" },
      // MEH-3911
      { slug: CAKES_SLUG, name: "עוגות וקינוחים", group: "bread" },
    ]);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("every category is complete in every registry (MEH-3076)", () => {
  it.each(slugs)("%s has a glyph, a /map group and a name in he + en", (slug) => {
    const entry = taxonomyEntry(slug);
    expect(resolveCategoryGlyph({ slug }).isFallback, "glyph").toBe(false);
    expect(groupKeys, "group").toContain(entry.group);
    expect(slugsInGroup(entry.group)).toContain(slug);
    expect(he.category_names[slug], "he name").toBe(entry.name);
    expect(en.category_names[slug], "en name").toBeTruthy();
    expect(en.category_names[slug], "en name is English").not.toMatch(/[֐-׿]/);
  });

  it("no registry carries a slug the list does not know", () => {
    expect(Object.keys(CATEGORY_GLYPHS).sort()).toEqual([...slugs].sort());
    expect(Object.keys(he.category_names).sort()).toEqual([...slugs].sort());
    expect(Object.keys(en.category_names).sort()).toEqual([...slugs].sort());
  });

  it("every /map group holds at least one category", () => {
    for (const g of groupKeys) expect(slugsInGroup(g).length, g).toBeGreaterThan(0);
  });

  it("a renamed or slug-less row still finds its entry", () => {
    expect(taxonomyEntry({ name: "שם חדש", slug: "honey" })?.slug).toBe("honey");
    expect(taxonomyEntry({ name: "דבש" })?.slug).toBe("honey");
    expect(taxonomyEntry({ name: "לא קיימת", slug: "nope" })).toBeUndefined();
  });
});
