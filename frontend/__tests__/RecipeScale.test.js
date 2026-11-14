// MEH-3121: scaling the amount an ingredient line starts with.
import { describe, expect, it } from "vitest";
import { clampServings, formatAmount, scaleRecipeLine } from "@/lib/recipe-scale";

// The amount is wrapped in a left-to-right isolate when it has a fraction
// glyph; the cases below compare the visible text.
const visible = (s) => s.replace(/[\u2066\u2069]/g, "");

describe("scaleRecipeLine", () => {
  it.each([
    ["2 ביצים", 2, "4 ביצים"],
    ["200 גרם קמח", 1.5, "300 גרם קמח"],
    ["250 גרם חמאה", 4 / 3, "333 גרם חמאה"],
    ["1/2 כוס סוכר", 2, "1 כוס סוכר"],
    ["1/2 כוס סוכר", 3, "1½ כוס סוכר"],
    ["1 1/2 כוסות מים", 2, "3 כוסות מים"],
    ["½ כפית מלח", 0.5, "¼ כפית מלח"],
    ["1½ כפות שמן", 2, "3 כפות שמן"],
    ["1.5 ליטר חלב", 2, "3 ליטר חלב"],
    ["1,5 ליטר חלב", 2, "3 ליטר חלב"],
    ["2-3 כפות דבש", 2, "4-6 כפות דבש"],
    ["2 – 3 שיני שום", 0.5, "1 – 1½ שיני שום"],
    ["3 עגבניות", 1 / 3, "1 עגבניות"],
    ["1 בצל", 0.75, "¾ בצל"],
    ["5 תפוחים", 0.28, "1.4 תפוחים"],
  ])("%s × %s → %s", (line, factor, expected) => {
    expect(visible(scaleRecipeLine(line, factor))).toBe(expected);
  });

  it.each([
    "מלח לפי הטעם",
    "קמצוץ פלפל",
    "שמנת 3% שומן",
    "3% שומן שמנת",
    "180° בתנור",
    "1:1 מים וסוכר",
    "2x קמח",
    "חבילת שמרים (50 גרם)",
    "0 סוכר",
    "1/0 כוס",
    "1 / 2 כוס סוכר",
    "1 1 גרם",
    "1,000 גרם קמח",
    "2-1,500 גרם",
    "0.001 גרם זעפרן",
    "",
  ])("a line with no readable leading amount stays as written: «%s»", (line) => {
    expect(scaleRecipeLine(line, 2)).toBe(line);
  });

  it("factor 1, or a factor that is not a positive number, changes nothing", () => {
    for (const f of [1, 0, -2, NaN, Infinity]) expect(scaleRecipeLine("2 ביצים", f)).toBe("2 ביצים");
  });

  it("an amount with a fraction glyph is isolated left-to-right; plain digits are not wrapped", () => {
    expect(scaleRecipeLine("3 עגבניות", 1.5)).toBe("\u20664½\u2069 עגבניות");
    expect(scaleRecipeLine("2 – 3 שיני שום", 0.5)).toBe("\u20661 – 1½\u2069 שיני שום");
    expect(scaleRecipeLine("2 ביצים", 2)).toBe("4 ביצים");
  });

  it("only the leading amount moves; a number later in the line does not", () => {
    expect(scaleRecipeLine("2 חבילות של 200 גרם", 2)).toBe("4 חבילות של 200 גרם");
  });
});

describe("formatAmount", () => {
  it.each([
    [0.5, "½"], [0.333, "⅓"], [0.667, "⅔"], [1.25, "1¼"], [2.75, "2¾"],
    [2.98, "3"], [3.02, "3"], [2.4, "2.4"], [0.1, "0.1"], [19.6, "19.6"], [20.4, "20"], [333.3, "333"],
  ])("%s → %s", (value, expected) => expect(formatAmount(value)).toBe(expected));
});

describe("clampServings", () => {
  it("stays inside 1–100", () => {
    expect(clampServings(0)).toBe(1);
    expect(clampServings(101)).toBe(100);
    expect(clampServings(4)).toBe(4);
    expect(clampServings("x")).toBe(1);
  });
});
