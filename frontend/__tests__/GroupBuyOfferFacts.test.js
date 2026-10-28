/**
 * MEH-2478 review #3726 — the group-buy Offer states facts a crawler can trust:
 *   - priceValidUntil is the deadline's ISRAEL date (the stored deadline is a
 *     naive UTC timestamp — 22:30 UTC on 1 Nov is already 2 Nov in Israel);
 *   - a full group buy (commits at max_participants) is SoldOut, never
 *     InStock — joining it is refused (group_buys.py «קבוצת הרכש מלאה»);
 *   - a naive deadline is read as UTC whatever the runtime's time zone.
 */
import { describe, it, expect } from "vitest";
import { buildGroupBuyJsonLd, isGroupBuyLive } from "@/lib/seo";

const NOW = new Date("2026-10-28T12:00:00Z");
const BASE = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "רכש משותף",
  product_name: "שמן זית",
  price_per_unit_group: 60,
  status: "open",
  deadline: "2026-11-01T22:30:00",
  max_participants: 10,
  commits_count: 3,
};
const offerOf = (gb) =>
  buildGroupBuyJsonLd(gb, "he", NOW)["@graph"].find((n) => n["@type"] === "Product").offers;

describe("group-buy Offer facts", () => {
  it("priceValidUntil is the Israel calendar date of a naive-UTC deadline", () => {
    expect(offerOf(BASE).priceValidUntil).toBe("2026-11-02");
  });

  it("a full group buy is SoldOut", () => {
    expect(offerOf({ ...BASE, commits_count: 10 }).availability).toBe("https://schema.org/SoldOut");
  });

  it("control: room left and before the deadline → InStock", () => {
    expect(offerOf(BASE).availability).toBe("https://schema.org/InStock");
  });

  it("a naive deadline is UTC: 11:30 UTC is already past at 12:00 UTC", () => {
    expect(isGroupBuyLive({ ...BASE, deadline: "2026-10-28T11:30:00" }, NOW)).toBe(false);
    expect(isGroupBuyLive({ ...BASE, deadline: "2026-10-28T12:30:00" }, NOW)).toBe(true);
  });
});
