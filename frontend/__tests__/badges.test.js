import { describe, it, expect } from "vitest";
import {
  BADGE_PRIORITY,
  allBadges,
  topBadges,
  badgeCount,
} from "@/lib/badges";

describe("BADGE_PRIORITY", () => {
  it("matches the spec order: verified > recommended > new > delivery > products", () => {
    expect(BADGE_PRIORITY).toEqual([
      "verified",
      "recommended",
      "new",
      "delivery",
      "products",
    ]);
  });
});

describe("allBadges", () => {
  it("returns [] for a producer with nothing earned", () => {
    expect(
      allBadges({
        is_verified: false,
        is_recommended: false,
        days_since_created: 365,
        delivery_count: 0,
        has_delivery: false,
        products_count: 0,
      }),
    ).toEqual([]);
  });

  it("returns [] for null / undefined producer", () => {
    expect(allBadges(null)).toEqual([]);
    expect(allBadges(undefined)).toEqual([]);
  });

  it("verified — when is_verified is true", () => {
    const badges = allBadges({ is_verified: true });
    expect(badges.map((b) => b.key)).toEqual(["verified"]);
  });

  it("recommended — when is_recommended is true", () => {
    const badges = allBadges({ is_recommended: true });
    expect(badges.map((b) => b.key)).toEqual(["recommended"]);
  });

  it("new — when days_since_created is <= 30", () => {
    expect(allBadges({ days_since_created: 0 }).map((b) => b.key)).toEqual(["new"]);
    expect(allBadges({ days_since_created: 30 }).map((b) => b.key)).toEqual(["new"]);
    expect(allBadges({ days_since_created: 31 }).map((b) => b.key)).toEqual([]);
  });

  it("delivery — via delivery_count > 0", () => {
    expect(allBadges({ delivery_count: 3 }).map((b) => b.key)).toEqual(["delivery"]);
  });

  it("delivery — via has_delivery flag when delivery_count is 0", () => {
    expect(allBadges({ delivery_count: 0, has_delivery: true }).map((b) => b.key)).toEqual(
      ["delivery"],
    );
  });

  it("products — when products_count >= 3", () => {
    expect(allBadges({ products_count: 3 }).map((b) => b.key)).toEqual(["products"]);
    expect(allBadges({ products_count: 10 }).map((b) => b.key)).toEqual(["products"]);
    expect(allBadges({ products_count: 2 }).map((b) => b.key)).toEqual([]);
  });

  it("returns badges in priority order regardless of field order", () => {
    const badges = allBadges({
      // Earned in a reverse-priority order to make sure we sort, not follow input.
      products_count: 10,
      has_delivery: true,
      days_since_created: 5,
      is_recommended: true,
      is_verified: true,
    });
    expect(badges.map((b) => b.key)).toEqual([
      "verified",
      "recommended",
      "new",
      "delivery",
      "products",
    ]);
  });

  it("each returned badge carries label + tooltip", () => {
    const [badge] = allBadges({ is_verified: true });
    expect(badge.label).toBe("מאומת");
    expect(badge.tooltip).toMatch(/אימות/);
  });
});

describe("topBadges", () => {
  const producer = {
    is_verified: true,
    is_recommended: true,
    days_since_created: 10,
    has_delivery: true,
    products_count: 5,
  };

  it("truncates to the priority-top N", () => {
    expect(topBadges(producer, 2).map((b) => b.key)).toEqual([
      "verified",
      "recommended",
    ]);
  });

  it("defaults limit to 2", () => {
    expect(topBadges(producer).map((b) => b.key)).toEqual([
      "verified",
      "recommended",
    ]);
  });

  it("returns all when limit exceeds earned count", () => {
    expect(topBadges({ is_verified: true }, 5).map((b) => b.key)).toEqual([
      "verified",
    ]);
  });

  it("returns [] when limit is 0 or negative", () => {
    expect(topBadges(producer, 0)).toEqual([]);
    expect(topBadges(producer, -3)).toEqual([]);
  });
});

describe("badgeCount", () => {
  it("counts all earned badges", () => {
    expect(
      badgeCount({
        is_verified: true,
        is_recommended: true,
        days_since_created: 5,
        has_delivery: true,
        products_count: 7,
      }),
    ).toBe(5);
  });
});
