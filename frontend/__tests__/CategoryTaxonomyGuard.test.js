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
// MEH-3911: the admin-created rows got English slugs in revision b3d5f7a9c1e2;
// its RENAMES tuple is the backend's list of them (old -> new).
const VERSIONS = path.join(ROOT, "backend/alembic/versions");
const RENAMES_FILE = fs.readdirSync(VERSIONS).find((f) => f.includes("b3d5f7a9c1e2"));
const RENAMES_PY = fs.readFileSync(path.join(VERSIONS, RENAMES_FILE), "utf8");
const RENAMES_BLOCK = RENAMES_PY.slice(RENAMES_PY.indexOf("RENAMES"), RENAMES_PY.indexOf("\n)\n"));
const ADMIN_SLUGS = [...RENAMES_BLOCK.matchAll(/\("[a-z-]+",\s*"([a-z-]+)"\)/g)].map((m) => m[1]);

const slugs = CATEGORY_TAXONOMY.map((c) => c.slug);
const groupKeys = CATEGORY_CHIPS.filter((c) => c.matches).map((c) => c.key);

describe("category taxonomy = the backend's categories (MEH-3076)", () => {
  it("control: both backend files were parsed", () => {
    expect(BACKEND.length).toBe(block.split("\n").filter((l) => /^\s+"/.test(l)).length);
    expect(BACKEND.length).toBe(18);
    expect(ADMIN_SLUGS).toEqual(["coffee", "cooked-to-order", "cakes-desserts"]);
  });

  it("every seeded category is in the list with the same name and slug", () => {
    for (const b of BACKEND) {
      expect(CATEGORY_TAXONOMY.find((c) => c.slug === b.slug), b.slug).toMatchObject(b);
    }
  });

  it("the only other entries are the admin-created ones, under the English slugs of revision b3d5f7a9c1e2", () => {
    const extra = CATEGORY_TAXONOMY.filter((c) => !BACKEND.some((b) => b.slug === c.slug));
    expect(extra.map((c) => c.slug)).toEqual(ADMIN_SLUGS);
    for (const slug of slugs) expect(slug, "English slug").toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
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
