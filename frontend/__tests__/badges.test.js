import { describe, it, expect } from "vitest";
import {
  BADGE_PRIORITY,
  allBadges,
  topBadges,
  badgeCount,
} from "@/lib/badges";

describe("BADGE_PRIORITY", () => {
  it("matches the Phase B fold order", () => {
    expect(BADGE_PRIORITY).toEqual([
      "verified",
      "recommended",
      "license",
      "new",
      "organic",
      "grass_fed",
      "gluten_free",
      "vegan",
      "lactose_free",
      "kosher",
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
        organic_certified: false,
        grass_fed: false,
        has_gluten_free_products: false,
        has_vegan_products: false,
        has_lactose_free_products: false,
        kosher: null,
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

  // MEH-531: license badge — Ministry of Health producer license trust signal.
  // Field source: ProducerListOut.has_producer_license (schemas.py:547).
  it("license — when has_producer_license is true", () => {
    expect(allBadges({ has_producer_license: true }).map((b) => b.key)).toEqual([
      "license",
    ]);
  });

  it("license — when has_producer_license is false → not earned", () => {
    expect(allBadges({ has_producer_license: false }).map((b) => b.key)).toEqual([]);
  });

  it("license — when has_producer_license is null/undefined → not earned", () => {
    expect(allBadges({ has_producer_license: null }).map((b) => b.key)).toEqual([]);
    expect(allBadges({}).map((b) => b.key)).toEqual([]);
  });

  it("new — when days_since_created is <= 30", () => {
    expect(allBadges({ days_since_created: 0 }).map((b) => b.key)).toEqual(["new"]);
    expect(allBadges({ days_since_created: 30 }).map((b) => b.key)).toEqual(["new"]);
    expect(allBadges({ days_since_created: 31 }).map((b) => b.key)).toEqual([]);
  });

  it("organic — when organic_certified is true", () => {
    expect(allBadges({ organic_certified: true }).map((b) => b.key)).toEqual(["organic"]);
  });

  it("grass_fed — when grass_fed is true", () => {
    expect(allBadges({ grass_fed: true }).map((b) => b.key)).toEqual(["grass_fed"]);
  });

  // MEH-293/MEH-479: aggregated `has_X_products` is the canonical source.
  // Legacy producer.X columns were dropped in MEH-479; the guard tests below
  // confirm that even if a stale fixture sets producer.vegan=true (e.g. from
  // an out-of-date API mock), it does NOT trigger a dietary badge.
  it("gluten_free — when has_gluten_free_products is true", () => {
    expect(allBadges({ has_gluten_free_products: true }).map((b) => b.key)).toEqual(["gluten_free"]);
  });

  it("vegan — when has_vegan_products is true", () => {
    expect(allBadges({ has_vegan_products: true }).map((b) => b.key)).toEqual(["vegan"]);
  });

  it("lactose_free — when has_lactose_free_products is true", () => {
    expect(allBadges({ has_lactose_free_products: true }).map((b) => b.key)).toEqual(["lactose_free"]);
  });

  // MEH-479 guard tests — legacy producer.X keys must NOT earn a dietary
  // badge after the column drop. Pins the regression that motivated MEH-479's
  // single-source-of-truth refactor.
  it("MEH-479 guard — legacy producer.gluten_free alone does NOT trigger badge", () => {
    expect(allBadges({ gluten_free: true }).map((b) => b.key)).not.toContain("gluten_free");
  });

  it("MEH-479 guard — legacy producer.vegan alone does NOT trigger badge", () => {
    expect(allBadges({ vegan: true }).map((b) => b.key)).not.toContain("vegan");
  });

  it("MEH-479 guard — legacy producer.lactose_free alone does NOT trigger badge", () => {
    expect(allBadges({ lactose_free: true }).map((b) => b.key)).not.toContain("lactose_free");
  });

  it("dietary — all has_X_products false yields no dietary badge", () => {
    const keys = allBadges({
      has_vegan_products: false,
      has_gluten_free_products: false,
      has_lactose_free_products: false,
    }).map((b) => b.key);
    expect(keys).not.toContain("vegan");
    expect(keys).not.toContain("gluten_free");
    expect(keys).not.toContain("lactose_free");
  });

  it("kosher — when kosher is a non-empty string", () => {
    expect(allBadges({ kosher: "חלבי" }).map((b) => b.key)).toEqual(["kosher"]);
    expect(allBadges({ kosher: "כשר למהדרין" }).map((b) => b.key)).toEqual(["kosher"]);
    expect(allBadges({ kosher: "" }).map((b) => b.key)).toEqual([]);
    expect(allBadges({ kosher: "   " }).map((b) => b.key)).toEqual([]);
    expect(allBadges({ kosher: null }).map((b) => b.key)).toEqual([]);
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
      products_count: 10,
      has_delivery: true,
      kosher: "חלבי",
      grass_fed: true,
      has_gluten_free_products: true,
      has_vegan_products: true,
      has_lactose_free_products: true,
      organic_certified: true,
      days_since_created: 5,
      has_producer_license: true,
      is_recommended: true,
      is_verified: true,
    });
    expect(badges.map((b) => b.key)).toEqual([
      "verified",
      "recommended",
      "license",
      "new",
      "organic",
      "grass_fed",
      "gluten_free",
      "vegan",
      "lactose_free",
      "kosher",
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

  it("picks organic over delivery when both earned and limit=2 with verified", () => {
    // verified (priority 0) + organic (priority 3) win over delivery (priority 6)
    const p = {
      is_verified: true,
      organic_certified: true,
      has_delivery: true,
    };
    expect(topBadges(p, 2).map((b) => b.key)).toEqual(["verified", "organic"]);
  });

  // MEH-531: license sits between recommended and new.
  it("license priority — sits between recommended and new", () => {
    const p = {
      is_recommended: true,
      has_producer_license: true,
      days_since_created: 5,
    };
    expect(topBadges(p, 3).map((b) => b.key)).toEqual([
      "recommended",
      "license",
      "new",
    ]);
    // limit=2 → recommended + license, new gets truncated
    expect(topBadges(p, 2).map((b) => b.key)).toEqual(["recommended", "license"]);
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

  it("counts the new Phase B badges", () => {
    expect(
      badgeCount({
        organic_certified: true,
        grass_fed: true,
        kosher: "חלבי",
      }),
    ).toBe(3);
  });

  it("counts the dietary label badges", () => {
    expect(
      badgeCount({
        has_gluten_free_products: true,
        has_vegan_products: true,
        has_lactose_free_products: true,
      }),
    ).toBe(3);
  });
});
