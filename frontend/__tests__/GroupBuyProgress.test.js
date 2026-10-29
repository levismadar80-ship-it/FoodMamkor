// MEH-2540: the label reads «{commits} מתוך {min} משתתפות» but the bar was
// measured against max || min — «2 מתוך 2» next to a 10% bar (staging).
import { describe, it, expect } from "vitest";
import { groupBuyProgressPct, groupBuyDiscountPct } from "@/lib/group-buy-progress";

describe("groupBuyProgressPct", () => {
  it("measures against the minimum the label names, even when a max is set", () => {
    expect(groupBuyProgressPct(2, 2)).toBe(100);
    expect(groupBuyProgressPct(1, 4)).toBe(25);
  });
  it("caps at 100 past the minimum", () => {
    expect(groupBuyProgressPct(7, 5)).toBe(100);
  });
  it("is 0 with no commits or a bad minimum", () => {
    expect(groupBuyProgressPct(0, 5)).toBe(0);
    expect(groupBuyProgressPct(3, 0)).toBe(0);
  });
});

// MEH-2544: the «-N%» badge shows only for a real saving.
describe("groupBuyDiscountPct", () => {
  it("rounds the saving off the regular price", () => {
    expect(groupBuyDiscountPct(18, 13)).toBe(28);
    expect(groupBuyDiscountPct("95", "75")).toBe(21);
  });
  it("is 0 when there is no saving", () => {
    expect(groupBuyDiscountPct(10, 10)).toBe(0);
    expect(groupBuyDiscountPct(10, 12)).toBe(0);
  });
  it("is 0 for a missing price on either side", () => {
    expect(groupBuyDiscountPct(0, 5)).toBe(0);
    expect(groupBuyDiscountPct(null, 5)).toBe(0);
    expect(groupBuyDiscountPct(10, null)).toBe(0);
    expect(groupBuyDiscountPct(10, "")).toBe(0);
  });
});
