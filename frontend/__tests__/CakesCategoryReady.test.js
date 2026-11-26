// MEH-3911 — «עוגות וקינוחים» (cakes, cookies, tarts, desserts) is created
// from the admin, not seeded, so its slug is the transliteration
// "avgvt-vkynvchym" (pinned on the backend side by
// tests/test_meh3911_cakes_slug.py). Until the row exists every line below is
// inert; this pins that the frontend is ready the moment it does. Same shape
// as CookedFoodCategoryReady.test.js.
import { describe, it, expect } from "vitest";
import { CATEGORY_CHIPS, resolveCategoryIds } from "@/lib/map-chips";
import { resolveCategoryGlyph } from "@/lib/category-registry";
import he from "../messages/he.json";
import en from "../messages/en.json";

const CAKES = { id: 97, name: "עוגות וקינוחים", slug: "avgvt-vkynvchym" };

describe("MEH-3911 cakes and desserts category", () => {
  it("resolves its own glyph by slug and by name, not the fallback", () => {
    expect(resolveCategoryGlyph({ slug: CAKES.slug }).isFallback).toBe(false);
    expect(resolveCategoryGlyph(CAKES.name).isFallback).toBe(false);
  });

  it("lands in exactly one /map group, the bread group", () => {
    const hits = CATEGORY_CHIPS.filter((g) => g.matches)
      .filter((g) => resolveCategoryIds(g, [CAKES]).includes(CAKES.id))
      .map((g) => g.key);
    expect(hits).toEqual(["bread"]);
  });

  it("has a name and a selector example line in both locales", () => {
    expect(he.category_names[CAKES.slug]).toBe(CAKES.name);
    expect(en.category_names[CAKES.slug]).toBe("Cakes & desserts");
    expect(he.forms.category_selector.rest_descs[CAKES.slug]).toBeTruthy();
    expect(en.forms.category_selector.rest_descs[CAKES.slug]).toBeTruthy();
  });
});
