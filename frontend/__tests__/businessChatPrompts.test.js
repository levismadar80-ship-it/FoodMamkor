import { describe, it, expect } from "vitest";
import { businessChatPrompts, MAX_BUSINESS_PROMPTS } from "@/lib/business-chat-prompts";
import he from "../messages/he.json";

/** MEH-3505: a question is offered only when the page holds its answer. */
const ids = (producer, sig) => businessChatPrompts(producer, sig).map((p) => p.id);

describe("businessChatPrompts", () => {
  it("0: no data → no questions (and no producer → none)", () => {
    expect(ids({ products: [] })).toEqual([]);
    expect(ids(null)).toEqual([]);
  });

  it("1: delivery areas only → only the delivery question", () => {
    expect(ids({ offers_delivery: true, delivery_nationwide: false, delivery_areas: [{ city: "חיפה" }] }))
      .toEqual(["delivery"]);
  });

  it("delivery switched off with area rows left behind → no delivery question", () => {
    expect(ids({ offers_delivery: false, delivery_nationwide: true, delivery_areas: [{ city: "חיפה" }] }))
      .toEqual([]);
  });

  it("a gluten-free product, no delivery, no hours → only the gluten question", () => {
    expect(ids({ delivery_nationwide: false, delivery_areas: [], products: [{ is_gluten_free: true }] }))
      .toEqual(["diet_gluten_free"]);
  });

  it("a tie between two flags goes to the first in the list (gluten before vegan)", () => {
    expect(ids({ products: [{ is_vegan: true }, { is_gluten_free: true }] })).toEqual(["diet_gluten_free"]);
  });

  it("a featured product with ingredients only still gets its question", () => {
    expect(ids({}, { name: "חלה", ingredients: "קמח" })).toEqual(["signature"]);
  });

  it("many: priority order, capped at 3", () => {
    const sig = { name: " עוגת גבינה ", description: "עוגה אפויה" };
    const out = businessChatPrompts(
      {
        offers_delivery: true,
        delivery_nationwide: true,
        opening_hours: "א׳ 08:00-14:00",
        products: [{ is_vegan: true }, { is_vegan: true }, { is_gluten_free: true }],
      },
      sig,
    );
    expect(out).toEqual([
      { id: "signature", values: { product: "עוגת גבינה" } },
      { id: "diet_vegan" },
      { id: "delivery" },
    ]);
    expect(out.length).toBe(MAX_BUSINESS_PROMPTS);
  });

  it("a featured product with no ingredients or description gets no question", () => {
    expect(ids({}, { name: "חלה", description: "  " })).toEqual([]);
  });

  it("hours come from the primary location first", () => {
    expect(ids({ locations: [{ is_primary: true, opening_hours: "ב׳ 09:00-12:00" }] })).toEqual(["hours"]);
  });

  it("every id it can return has a Hebrew label", () => {
    const all = businessChatPrompts(
      { offers_delivery: true, delivery_nationwide: true, opening_hours: "x", products: [{ is_lactose_free: true }] },
      { name: "a", ingredients: "b" },
    );
    const more = ["diet_gluten_free", "diet_vegan", "diet_no_added_sugar"];
    for (const id of [...all.map((p) => p.id), ...more]) expect(he.chat.business.prompts[id]).toBeTruthy();
  });
});
