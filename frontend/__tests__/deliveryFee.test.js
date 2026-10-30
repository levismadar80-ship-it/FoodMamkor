import { describe, it, expect } from "vitest";
import { resolveDeliveryFee } from "@/lib/deliveryFee";

// MEH-2602 — card and business page read ONE fee. The staging sweep found the
// card «25₪» beside the page «מ-20₪» for the same business.
describe("resolveDeliveryFee", () => {
  it("varying effective fees → the cheapest, as a 'from' price", () => {
    // The staging case: one area overrides to 20, the others inherit 25.
    const areas = [{ delivery_fee: 20 }, { delivery_fee: null }, {}];
    expect(resolveDeliveryFee(25, areas)).toEqual({ fee: 20, from: true });
  });

  it("every area agrees → that value, not the producer rate", () => {
    expect(resolveDeliveryFee(25, [{ delivery_fee: 20 }, { delivery_fee: 20 }])).toEqual({
      fee: 20,
      from: false,
    });
  });

  it("no areas → the producer rate", () => {
    expect(resolveDeliveryFee(25, [])).toEqual({ fee: 25, from: false });
  });

  it("a free area is a fee of 0, not an absence", () => {
    expect(resolveDeliveryFee(25, [{ delivery_fee: 0 }, {}])).toEqual({ fee: 0, from: true });
  });

  it("nothing stated anywhere → null", () => {
    expect(resolveDeliveryFee(null, [{}, { delivery_fee: null }])).toEqual({
      fee: null,
      from: false,
    });
  });
});
