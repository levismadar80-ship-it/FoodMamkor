// MEH-3401 — «קפה» (coffee roasteries) is created from the admin, not seeded:
// category_slug.NAME_TO_SLUG is frozen to the MEH-2139 backfill revision, so a
// new category gets the transliterated slug "kph" (pinned on the backend side by
// tests/test_meh3401_coffee_slug.py). Until the row exists every line below is
// inert; this pins that the frontend is ready for it the moment it does.
import { describe, it, expect } from "vitest";
import { CATEGORY_CHIPS, resolveCategoryIds } from "@/lib/map-chips";
import { resolveCategoryGlyph } from "@/lib/category-registry";
import he from "../messages/he.json";
import en from "../messages/en.json";

const COFFEE = { id: 99, name: "קפה", slug: "kph" };

describe("MEH-3401 coffee category", () => {
  it("resolves its own glyph, not the fallback", () => {
    expect(resolveCategoryGlyph(COFFEE.name).isFallback).toBe(false);
  });

  it("lands in exactly one /map group, the pantry", () => {
    const hits = CATEGORY_CHIPS.filter((g) => g.matches)
      .filter((g) => resolveCategoryIds(g, [COFFEE]).includes(COFFEE.id))
      .map((g) => g.key);
    expect(hits).toEqual(["pantry"]);
  });

  it("has a selector example line in both locales", () => {
    expect(he.forms.category_selector.rest_descs.kph).toBeTruthy();
    expect(en.forms.category_selector.rest_descs.kph).toBeTruthy();
  });
});
