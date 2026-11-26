// MEH-3738 — «בישול לפי הזמנה» (cooked to order: platters, salads, small
// catering) is created from the admin, not seeded; its slug is the English
// "cooked-to-order" since MEH-3911 (see
// revision b3d5f7a9c1e2). Until the row exists every line
// below is inert; this pins that the frontend is ready the moment it does.
// Same shape as CoffeeCategoryReady.test.js.
import { describe, it, expect } from "vitest";
import { CATEGORY_CHIPS, resolveCategoryIds } from "@/lib/map-chips";
import { resolveCategoryGlyph } from "@/lib/category-registry";
import he from "../messages/he.json";
import en from "../messages/en.json";

const COOKED = { id: 98, name: "בישול לפי הזמנה", slug: "cooked-to-order" };

describe("MEH-3738 cooked-to-order category", () => {
  it("resolves its own glyph by slug and by name, not the fallback", () => {
    expect(resolveCategoryGlyph({ slug: COOKED.slug }).isFallback).toBe(false);
    expect(resolveCategoryGlyph(COOKED.name).isFallback).toBe(false);
  });

  it("lands in exactly one /map group, the pantry", () => {
    const hits = CATEGORY_CHIPS.filter((g) => g.matches)
      .filter((g) => resolveCategoryIds(g, [COOKED]).includes(COOKED.id))
      .map((g) => g.key);
    expect(hits).toEqual(["pantry"]);
  });

  it("has a name and a selector example line in both locales", () => {
    expect(he.category_names[COOKED.slug]).toBe(COOKED.name);
    expect(en.category_names[COOKED.slug]).toBe("Cooked to order");
    expect(he.forms.category_selector.rest_descs[COOKED.slug]).toBeTruthy();
    expect(en.forms.category_selector.rest_descs[COOKED.slug]).toBeTruthy();
  });
});
