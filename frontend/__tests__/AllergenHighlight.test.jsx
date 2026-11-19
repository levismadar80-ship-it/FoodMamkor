import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import he from "../messages/he.json";
import { highlightAllergens, ALLERGEN_WORDS } from "@/lib/allergens";

/**
 * MEH-3443 — allergen words inside the ingredients list are emphasised, for
 * the codes the owner ticked in «מכיל» only. Cells: 0 / 1 / many matches; a
 * word that is not an allergen; an allergen word whose code was not ticked;
 * Hebrew one-letter prefixes; look-alike words («חלבון», «חלב קוקוס»,
 * «קמח אורז») that must not match; the owner's own detail («פריכית»).
 */
const hits = (segments) => segments.filter((s) => s.hit).map((s) => s.text);
const joined = (segments) => segments.map((s) => s.text).join("");

describe("highlightAllergens", () => {
  it("0 matches: no ticked code → one plain segment, text unchanged", () => {
    const text = "קמח, חמאה, סוכר";
    const out = highlightAllergens(text, []);
    expect(out).toEqual([{ text, hit: false }]);
  });

  it("0 matches: ticked code whose words are absent", () => {
    const out = highlightAllergens("סוכר, מים, מלח", ["milk"]);
    expect(hits(out)).toEqual([]);
    expect(joined(out)).toBe("סוכר, מים, מלח");
  });

  it("1 match: «קמח» is emphasised when gluten is ticked", () => {
    const out = highlightAllergens("קמח, סוכר, מים", ["gluten"]);
    expect(hits(out)).toEqual(["קמח"]);
    expect(joined(out)).toBe("קמח, סוכר, מים");
  });

  it("many matches across codes, text is preserved byte for byte", () => {
    const text = "קמח חיטה, חמאה, ביצים, שומשום\nמלח";
    const out = highlightAllergens(text, ["gluten", "milk", "eggs", "sesame"]);
    expect(hits(out)).toEqual(["קמח חיטה", "חמאה", "ביצים", "שומשום"]);
    expect(joined(out)).toBe(text);
  });

  it("a word that is not an allergen is never emphasised", () => {
    const out = highlightAllergens("סוכר, שמן זית, מלח", ALL);
    expect(hits(out)).toEqual([]);
  });

  it("an allergen word whose code was NOT ticked is not emphasised", () => {
    const out = highlightAllergens("קמח, חמאה, ביצים", ["eggs"]);
    expect(hits(out)).toEqual(["ביצים"]);
  });

  it("Hebrew prefixes ו/ב/מ/ה are part of the match", () => {
    const out = highlightAllergens("סוכר וחמאה, מוקפץ בשמן ובחלב", ["milk"]);
    expect(hits(out)).toEqual(["וחמאה", "ובחלב"]);
  });

  it("look-alikes do not match: «חלבון», «חלבה», «חלב קוקוס», «קמח אורז»", () => {
    expect(hits(highlightAllergens("חלבון, חלבה", ["milk"]))).toEqual([]);
    expect(hits(highlightAllergens("חלב קוקוס, חלב שקדים", ["milk"]))).toEqual([]);
    expect(hits(highlightAllergens("קמח אורז, קמח תירס", ["gluten"]))).toEqual([]);
  });

  it("the owner's detail adds words the dictionary lacks", () => {
    // «פריכית» and «ברזילאי» are in no dictionary list: only the detail can match them.
    const out = highlightAllergens("פריכית, ברזילאי קלוי, מלח", ["gluten", "tree_nuts"], {
      gluten: "פריכית (מלאה)",
      tree_nuts: "ברזילאי",
    });
    expect(hits(out)).toEqual(["פריכית", "ברזילאי"]);
    expect(hits(highlightAllergens("פריכית", ["gluten"]))).toEqual([]);
  });

  it("detail words under 3 letters are ignored", () => {
    expect(hits(highlightAllergens("אב, סוכר", ["gluten"], { gluten: "אב" }))).toEqual([]);
  });

  it("look-alikes joined by hyphen, maqaf or a bracket do not match", () => {
    expect(hits(highlightAllergens("קמח-אורז, חלב־שקדים, חלב (שקדים)", ["gluten", "milk"]))).toEqual([]);
  });

  it("prefixes ש/כ attach to longer terms, not to «פול» («כפול»)", () => {
    expect(hits(highlightAllergens("שלחלב, כחמאה", ["milk"]))).toEqual(["שלחלב", "כחמאה"]);
    expect(hits(highlightAllergens("שוקולד כפול", ["fava_beans"]))).toEqual([]);
  });

  it("English plant milks and butters do not count as milk", () => {
    const out = highlightAllergens("Milk chocolate, almond milk, cocoa butter, peanut butter", ["milk"]);
    expect(hits(out)).toEqual(["Milk"]);
  });

  it("every allergen code has dictionary words", () => {
    for (const code of ALL) expect(ALLERGEN_WORDS[code]?.length, code).toBeGreaterThan(0);
  });

  it("English ingredient text, case-insensitive", () => {
    const out = highlightAllergens("Wheat flour, Butter, sugar", ["gluten", "milk"]);
    expect(hits(out)).toEqual(["Wheat flour", "Butter"]);
  });

  it("unknown codes are ignored", () => {
    expect(hits(highlightAllergens("קמח", ["nope"]))).toEqual([]);
  });
});

const ALL = [
  "gluten", "milk", "eggs", "tree_nuts", "peanuts", "sesame", "soy", "fish",
  "crustaceans", "molluscs", "celery", "mustard", "sulphites", "lupin", "fava_beans",
];

// --- render: the emphasis reaches the product sheet --------------------------
const lookup = (full) => full.split(".").reduce((o, k) => (o == null ? undefined : o[k]), he);
vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key, vals) => {
    const full = ns ? `${ns}.${key}` : key;
    const v = lookup(full);
    if (typeof v !== "string") return full;
    return v.replace(/\{(\w+)\}/g, (m, k) => (vals && k in vals ? String(vals[k]) : m));
  },
}));
vi.mock("@phosphor-icons/react", () => ({ CaretDown: () => <span /> }));

describe("ProductFacts ingredients emphasis", async () => {
  const { default: ProductFacts } = await import("@/components/public/ProductFacts");

  it("ticked allergen words render inside <strong>, the rest stays plain", () => {
    render(<ProductFacts product={{ ingredients: "קמח, חמאה, סוכר", allergens: ["gluten"] }} />);
    const p = screen.getByTestId("product-sheet-ingredients");
    expect(p.textContent).toBe("קמח, חמאה, סוכר");
    const strong = [...p.querySelectorAll("strong")].map((s) => s.textContent);
    expect(strong).toEqual(["קמח"]);
  });

  it("nothing ticked → no <strong> in the ingredients", () => {
    render(<ProductFacts product={{ ingredients: "קמח, חמאה", allergens: [], may_contain: ["milk"] }} />);
    expect(screen.getByTestId("product-sheet-ingredients").querySelectorAll("strong")).toHaveLength(0);
  });
});
