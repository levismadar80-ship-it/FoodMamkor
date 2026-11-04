/**
 * PR #3971 (Sapir 31/10, «₪₪» on the signature card): a free-text price label
 * counts as a price only when it has a digit — and a digit-less one alone does
 * not open the «מוצרים» tab.
 */
import { describe, it, expect } from "vitest";
import { isPriceLabel } from "@/lib/utils";
import { getSectionNavItems } from "@/app/[locale]/producer/[id]/lib/section-nav";

describe("isPriceLabel", () => {
  it.each([["מ-₪30"], ["45₪/ק״ג"], ["החל מ-25₪"]])("%s is a price", (s) => {
    expect(isPriceLabel(s)).toBe(true);
  });
  it.each([["₪₪"], ["—"], [""], [null], [undefined], [30]])("%s is not", (s) => {
    expect(isPriceLabel(s)).toBe(false);
  });
});

describe("products tab visibility", () => {
  const t = (k) => k;
  const productsTab = (producer) =>
    getSectionNavItems(producer, t).find((i) => i.id === "section-products").show;

  it("«₪₪» alone, no products, no signature name: no tab", () => {
    expect(productsTab({ price_range: "₪₪", products: [] })).toBe(false);
  });
  it("a real starting price alone still opens the tab", () => {
    expect(productsTab({ price_range: "מ-₪20", products: [] })).toBe(true);
  });
});
