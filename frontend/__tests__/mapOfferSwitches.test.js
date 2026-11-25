// MEH-3824 — the map's four offer switches in «סינון» (Sapir 25/11, option ב).
// Two behaviours: a switch shows once ONE business on the map has that kind
// (gateMin 1, not the diet axes' 5), and a pin carries the mark of the first
// switched-on kind it has, only while that switch is on.
import { describe, it, expect } from "vitest";

import { DIET_CHIP_MIN } from "@/lib/producer-filters";
import { TOGGLE_CHIPS, visibleMapToggleChips } from "@/lib/map-chips";
import { OFFER_MARK_KEYS, activeOfferMarks, offerMarkFor } from "@/lib/map-offer-marks";

const OFFERS = ["rescue_today", "group_buy", "event", "experience"];
const FIELD = {
  rescue_today: { rescue_today: { offer_id: "b1", price_agorot: 2500, pickup_start: "x", pickup_end: "y" } },
  group_buy: { has_open_group_buy: true },
  event: { has_upcoming_event: true },
  experience: { has_listed_experience: true },
};
const biz = (id, ...kinds) => Object.assign({ id }, ...kinds.map((k) => FIELD[k]));
const shown = (catalog, chipState = {}) =>
  visibleMapToggleChips({ catalogSnapshot: catalog, chipState })
    .map((c) => c.key)
    .filter((k) => OFFERS.includes(k));

describe("MEH-3824 — offer switches are gated at one business", () => {
  it("the four switches are map toggle chips, in sheet order", () => {
    expect(OFFER_MARK_KEYS).toEqual(OFFERS);
    for (const k of OFFERS) expect(TOGGLE_CHIPS.map((c) => c.key)).toContain(k);
  });

  it("0 businesses with a kind → its switch is hidden", () => {
    expect(shown([biz(1), biz(2)])).toEqual([]);
  });

  // The discriminating case: the diet threshold is 5, so a gate that ignored
  // gateMin would hide all four here.
  it("1 business with a kind → its switch shows, and only that one", () => {
    expect(DIET_CHIP_MIN).toBeGreaterThan(1);
    for (const k of OFFERS) expect(shown([biz(1, k), biz(2)])).toEqual([k]);
  });

  it("many businesses, several kinds → each kind present shows", () => {
    expect(shown([biz(1, "group_buy"), biz(2, "event", "experience"), biz(3, "group_buy")])).toEqual([
      "group_buy",
      "event",
      "experience",
    ]);
  });

  it("a switch that is ON stays, even with nothing to match, so it can be turned off", () => {
    expect(shown([biz(1)], { event: true })).toEqual(["event"]);
  });

  it("the snapshot failed to load → every switch shows (unknown is not zero)", () => {
    expect(shown(null)).toEqual(OFFERS);
  });
});

describe("MEH-3824 — the pin mark", () => {
  it("no switch on → no mark, whatever the business has", () => {
    expect(activeOfferMarks({})).toEqual([]);
    expect(activeOfferMarks(null)).toEqual([]);
    expect(offerMarkFor(biz(1, ...OFFERS), [])).toBeNull();
  });

  it("a switch on → the businesses that have that kind are marked, the rest are not", () => {
    const on = activeOfferMarks({ group_buy: true, vegan: true });
    expect(on).toEqual(["group_buy"]);
    expect(offerMarkFor(biz(1, "group_buy"), on)).toBe("group_buy");
    expect(offerMarkFor(biz(2, "event"), on)).toBeNull();
  });

  it("two switches on → one mark per pin, the first in sheet order the business has", () => {
    const on = activeOfferMarks({ experience: true, rescue_today: true });
    expect(on).toEqual(["rescue_today", "experience"]);
    expect(offerMarkFor(biz(1, "experience", "rescue_today"), on)).toBe("rescue_today");
    expect(offerMarkFor(biz(2, "experience"), on)).toBe("experience");
  });
});
