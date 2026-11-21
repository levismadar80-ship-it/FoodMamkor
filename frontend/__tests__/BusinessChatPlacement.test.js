import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Where «שאלו על {name}» sits on the business page (Sapir 20/11: «האם עדיף
 * לשים את העוזרת כאן או במיקום אחר»). Decided: right after «מוצרים», before
 * recipes, activities, reviews and the delivery block — where most questions
 * come up, and where big sites put their «ask» entry (high, near the core
 * facts), not at the bottom under the delivery FAQ.
 */
const src = readFileSync(
  join(__dirname, "../app/[locale]/producer/[id]/components/ProducerSections.jsx"),
  "utf8",
);
const at = (needle) => {
  const i = src.indexOf(needle);
  expect(i, `${needle} not found`).toBeGreaterThan(-1);
  return i;
};

describe("business chat card placement", () => {
  it("renders once", () => {
    expect(src.match(/<BusinessChatPrompt\b/g)).toHaveLength(1);
  });
  it("comes after the products section and before recipes", () => {
    const chat = at("<BusinessChatPrompt");
    expect(chat).toBeGreaterThan(at('id="section-products"'));
    expect(chat).toBeLessThan(at('id="recipes"'));
  });
  it("comes before reviews and the delivery block", () => {
    const chat = at("<BusinessChatPrompt");
    expect(chat).toBeLessThan(at('id="reviews"'));
    expect(chat).toBeLessThan(at('id="section-delivery"'));
  });
});
