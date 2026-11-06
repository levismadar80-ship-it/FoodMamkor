// MEH-2703 follow-up: an order row said «1 סלים». The dashboard mock of
// next-intl does a bare {k} replace, so the plural is checked here against
// the real messages with the real ICU formatter.
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import he from "../messages/he.json";
import en from "../messages/en.json";

const heT = createTranslator({ locale: "he", messages: he, namespace: "rescue.dashboard" });
const enT = createTranslator({ locale: "en", messages: en, namespace: "rescue.dashboard" });

describe("bag count on an order row", () => {
  it.each([
    [1, "סל אחד"],
    [2, "שני סלים"],
    [3, "3 סלים"],
  ])("Hebrew, %i bag(s) → «%s»", (qty, text) => {
    expect(heT("qty", { qty })).toBe(text);
  });

  it("English says «one bag», not «1 bags»", () => {
    expect(enT("qty", { qty: 1 })).toBe("one bag");
    expect(enT("qty", { qty: 4 })).toBe("4 bags");
  });
});
