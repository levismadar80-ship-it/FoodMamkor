import { describe, it, expect } from "vitest";
import { resolveDeliveryFee, slimCardList } from "@/lib/delivery-fee";

// MEH-3891 — the home and /producers first paint carried every card's full
// delivery_areas (Farmerim: 191 rows, 62 KB) and went over the Lighthouse
// byte budget. A card reads those rows only through resolveDeliveryFee, so the
// server page keeps one row per distinct fee and the card shows the same fee.

const row = (city, delivery_fee) => ({ city, delivery_fee, delivery_day: null, delivery_days: [], zone_name: "z", min_order: 100 });

describe("slimCardList", () => {
  it("191 cities at one fee → one row, the same card fee", () => {
    const farmerim = { id: 1, delivery_fee: 30, delivery_count: 191, delivery_areas: Array.from({ length: 191 }, (_, i) => row(`c${i}`, null)) };
    const [slim] = slimCardList([farmerim]);
    expect(slim.delivery_areas).toHaveLength(1);
    expect(slim.delivery_count).toBe(191);
    expect(resolveDeliveryFee(slim.delivery_fee, slim.delivery_areas)).toEqual(
      resolveDeliveryFee(farmerim.delivery_fee, farmerim.delivery_areas),
    );
    expect(JSON.stringify(slim).length).toBeLessThan(JSON.stringify(farmerim).length / 50);
  });

  it("the card fee is unchanged for every mix of fees (incl. 0, null, missing)", () => {
    const values = [null, undefined, 0, 15, 20, 25];
    let seed = 7;
    const rand = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n);
    let checked = 0;
    for (let i = 0; i < 300; i++) {
      const areas = Array.from({ length: rand(12) }, (_, j) => (rand(10) === 0 ? null : row(`c${j}`, values[rand(values.length)])));
      const producerFee = [null, 0, 25][rand(3)];
      const [slim] = slimCardList([{ delivery_fee: producerFee, delivery_areas: areas }]);
      expect(resolveDeliveryFee(slim.delivery_fee, slim.delivery_areas)).toEqual(resolveDeliveryFee(producerFee, areas));
      checked++;
    }
    expect(checked).toBe(300);
  });

  it("does not touch the input, and passes non-lists and rows without areas through", () => {
    const p = { id: 2, delivery_areas: [row("a", 10), row("b", 10)] };
    slimCardList([p]);
    expect(p.delivery_areas).toHaveLength(2);
    expect(slimCardList(null)).toBeNull();
    expect(slimCardList([{ id: 3 }])).toEqual([{ id: 3 }]);
  });
});
