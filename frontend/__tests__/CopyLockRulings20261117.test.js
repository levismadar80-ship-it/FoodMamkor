// MEH-3381 — copy approved word for word in docs/decisions/rulings-2026-11-17.md
// §א3 (Sapir 17/11 14:39Z «הקופי מאשרת»). A change here needs a new approval.
import { describe, it, expect } from "vitest";
import he from "@/messages/he.json";
import en from "@/messages/en.json";

describe("rulings 17/11 §א3 copy lock (MEH-3381)", () => {
  it("pricing.page.sub_example says when the subscription pays off, in shekels", () => {
    expect(he.pricing.page.sub_example).toBe(
      "המנוי משתלם בכל חודש שבו העמלות בלי מנוי היו מגיעות ל-{breakEvenFees} ₪ או יותר.",
    );
    expect(en.pricing.page.sub_example).toBe(
      "The subscription pays off in any month your commissions without it would reach ₪{breakEvenFees} or more.",
    );
  });

  it("organizers.page.meta_description_fallback names the organizer and what the page holds", () => {
    expect(he.organizers.page.meta_description_fallback).toBe("{name} במהמקור: שווקים ואירועי אוכל.");
    expect(en.organizers.page.meta_description_fallback).toBe("{name} on Mehamakor: food markets and events.");
  });
});
