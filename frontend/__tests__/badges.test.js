import { describe, it, expect } from "vitest";
import {
  BADGE_CONFIG,
  BADGE_PRIORITY,
  allBadges,
  topBadges,
  badgeCount,
} from "@/lib/badges";

describe("BADGE_PRIORITY", () => {
  it("matches the Phase B fold order", () => {
    // MEH-1259: "organic" removed from the priority list (badge hidden).
    // MEH-1492: recommended drops below license (fact before opinion).
    expect(BADGE_PRIORITY).toEqual([
      "verified",
      "license",
      "recommended",
      "new",
      "grass_fed",
      "gluten_free",
      "vegetarian",
      "vegan",
      "lactose_free",
      // MEH-1934: the new diet badge joins the diet run, after lactose_free —
      // where every other diet badge already sits relative to kosher/delivery.
      // Only the top 2 reach a card, so position is load-bearing and is pinned
      // deliberately. (MEH-2047 withdrew its low_carb sibling from this run.)
      "no_added_sugar",
      "kosher",
      "delivery",
    ]);
  });

  // MEH-1846: absence assertion. The array check above would still pass if
  // "products" were reintroduced at a position this test happens not to pin,
  // and it says nothing about BADGE_CONFIG. These two do, and they are the
  // pair that fails if the key comes back through either door.
  it("carries no products key, in either structure (MEH-1846)", () => {
    expect(BADGE_PRIORITY).not.toContain("products");
    expect(Object.keys(BADGE_CONFIG)).not.toContain("products");
    // MEH-1934: 11 → 13 (no_added_sugar + low_carb); MEH-2047: 13 → 12, low_carb
    // withdrawn as an undefined nutrition claim. Both numbers move together
    // on purpose — allBadges() iterates BADGE_PRIORITY while the tooltips live
    // in BADGE_CONFIG, so a badge present in one and absent from the other is
    // either never rendered or rendered undefined. This pin caught exactly that
    // during MEH-1934, when BADGE_PRIORITY was left un-updated.
    expect(BADGE_PRIORITY).toHaveLength(12);
    expect(Object.keys(BADGE_CONFIG)).toHaveLength(12);
    // MEH-2047: absence in BOTH structures, the same pair-check the products
    // removal above uses — a count alone would pass if something else were
    // added in the same commit that removed this.
    expect(BADGE_PRIORITY).not.toContain("low_carb");
    expect(Object.keys(BADGE_CONFIG)).not.toContain("low_carb");
    // Stronger than either count: the two arrays must describe the SAME set.
    expect([...BADGE_PRIORITY].sort()).toEqual(Object.keys(BADGE_CONFIG).sort());
  });
});

describe("allBadges", () => {
  it("returns [] for a producer with nothing earned", () => {
    expect(
      allBadges({
        verification_tier: null,
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

  it("verified — when verification_tier is 'verified'", () => {
    const badges = allBadges({ verification_tier: "verified" });
    expect(badges.map((b) => b.key)).toEqual(["verified"]);
  });

  it("recommended — when is_recommended is true", () => {
    const badges = allBadges({ is_recommended: true });
    expect(badges.map((b) => b.key)).toEqual(["recommended"]);
  });

  // MEH-531: license badge — Ministry of Health producer license trust signal.
  // Field source: ProducerListOut.has_producer_license (schemas.py:547).
  // MEH-1162 (audit F10): the license number is SELF-DECLARED at registration,
  // so the chip additionally requires verification_tier === "verified" (an
  // admin actually checked the document). declared/null tiers → no chip.
  it("license — verified tier + has_producer_license → earned", () => {
    expect(
      allBadges({
        verification_tier: "verified",
        has_producer_license: true,
      }).map((b) => b.key),
    ).toEqual(["verified", "license"]);
  });

  it("license — declared tier with self-declared license → NOT earned", () => {
    expect(
      allBadges({
        verification_tier: "declared",
        has_producer_license: true,
      }).map((b) => b.key),
    ).toEqual([]);
  });

  it("license — null tier (pending review) with license number → NOT earned", () => {
    expect(
      allBadges({
        verification_tier: null,
        has_producer_license: true,
      }).map((b) => b.key),
    ).toEqual([]);
    expect(allBadges({ has_producer_license: true }).map((b) => b.key)).toEqual([]);
  });

  it("license — when has_producer_license is false → not earned even when verified", () => {
    expect(
      allBadges({
        verification_tier: "verified",
        has_producer_license: false,
      }).map((b) => b.key),
    ).toEqual(["verified"]);
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

  // MEH-1259 (P0 legal — חוק תוצרת אורגנית 2005): the self-declared organic
  // badge is removed from all public surfaces; organic_certified drives NO badge.
  it("organic — never earns a badge even when organic_certified is true", () => {
    expect(allBadges({ organic_certified: true }).map((b) => b.key)).toEqual([]);
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

  // MEH-1438: vegetarian badge — driven by the aggregated has_vegetarian_products
  // (is_vegetarian OR is_vegan). Priority sits after gluten_free, before vegan.
  it("vegetarian — when has_vegetarian_products is true", () => {
    expect(allBadges({ has_vegetarian_products: true }).map((b) => b.key)).toEqual(["vegetarian"]);
  });

  it("vegetarian priority — sits between gluten_free and vegan", () => {
    expect(
      allBadges({
        has_gluten_free_products: true,
        has_vegetarian_products: true,
        has_vegan_products: true,
      }).map((b) => b.key),
    ).toEqual(["gluten_free", "vegetarian", "vegan"]);
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

  // MEH-986 ch2: kosher badge is verified-gated (kashrut_verified_at), NOT the
  // free-text producer.kosher field (חוק איסור הונאה בכשרות — no unverified
  // kosher claim). Free-text kosher with no verification → NO badge.
  it("kosher — only when kashrut_verified_at is present (verified)", () => {
    expect(allBadges({ kashrut_verified_at: "2026-01-01T00:00:00Z" }).map((b) => b.key)).toEqual(["kosher"]);
    expect(allBadges({ kashrut_verified_at: null }).map((b) => b.key)).toEqual([]);
    // free-text kosher without verification must NOT earn the badge anymore
    expect(allBadges({ kosher: "חלבי" }).map((b) => b.key)).toEqual([]);
    expect(allBadges({ kosher: "כשר למהדרין" }).map((b) => b.key)).toEqual([]);
    expect(allBadges({ kosher: "" }).map((b) => b.key)).toEqual([]);
  });

  // MEH-1260: expiry enforcement — an expired certificate earns no badge;
  // legacy pre-expiry-era rows (NULL expires_at) stay valid.
  it("kosher — expiry enforced: valid / expired / legacy-null (MEH-1260)", () => {
    // valid: expires in the future → badge earned.
    expect(
      allBadges({
        kashrut_verified_at: "2026-01-01T00:00:00Z",
        kashrut_expires_at: "2099-01-01T00:00:00Z",
      }).map((b) => b.key),
    ).toEqual(["kosher"]);
    // expired: verified but past expires_at → NO badge.
    expect(
      allBadges({
        kashrut_verified_at: "2024-01-01T00:00:00Z",
        kashrut_expires_at: "2024-06-01T00:00:00Z",
      }).map((b) => b.key),
    ).toEqual([]);
    // legacy: verified with NULL expires_at → unchanged, badge earned.
    expect(
      allBadges({
        kashrut_verified_at: "2026-01-01T00:00:00Z",
        kashrut_expires_at: null,
      }).map((b) => b.key),
    ).toEqual(["kosher"]);
  });

  it("delivery — via delivery_count > 0", () => {
    expect(allBadges({ delivery_count: 3 }).map((b) => b.key)).toEqual(["delivery"]);
  });

  it("delivery — via has_delivery flag when delivery_count is 0", () => {
    expect(allBadges({ delivery_count: 0, has_delivery: true }).map((b) => b.key)).toEqual(
      ["delivery"],
    );
  });

  // MEH-1841 — specific supersedes generic. ProducerCard renders its own
  // "משלוחים בלבד" pill for a delivery-only business; the generic "משלוח"
  // badge alongside it was a second chip for the same fact. Suppression lives
  // in lib/badges.js so every consumer (card top-2, `+N` overflow popover,
  // badgeCount) agrees.
  describe("delivery — delivery-only suppression (MEH-1841)", () => {
    const deliveryOnly = {
      has_physical_location: false,
      offers_delivery: true,
      has_delivery: true,
      delivery_count: 4,
    };

    it("delivery-only producer earns NO generic delivery badge", () => {
      expect(allBadges(deliveryOnly).map((b) => b.key)).not.toContain("delivery");
      expect(allBadges(deliveryOnly)).toEqual([]);
    });

    it("suppression holds when only delivery_count drives the badge", () => {
      expect(
        allBadges({
          has_physical_location: false,
          offers_delivery: true,
          delivery_count: 4,
        }).map((b) => b.key),
      ).toEqual([]);
    });

    it("physical + delivery business KEEPS the generic delivery badge", () => {
      expect(
        allBadges({
          has_physical_location: true,
          offers_delivery: true,
          has_delivery: true,
        }).map((b) => b.key),
      ).toContain("delivery");
    });

    it("a payload without has_physical_location keeps the badge", () => {
      // Backend defaults has_physical_location to True (schemas/schemas.py:1772);
      // only an explicit `false` suppresses. A partial payload must not silently
      // lose its delivery indication.
      expect(allBadges({ has_delivery: true }).map((b) => b.key)).toContain(
        "delivery",
      );
      expect(
        allBadges({ has_physical_location: null, has_delivery: true }).map(
          (b) => b.key,
        ),
      ).toContain("delivery");
    });

    it("keeps the badge when the pill would NOT render (no offers_delivery)", () => {
      // ProducerCard's pill needs BOTH fields. This combination is rejected by
      // the owner form and the backend model, but a legacy row in this state
      // must not end up with zero delivery indication.
      expect(
        allBadges({
          has_physical_location: false,
          offers_delivery: false,
          has_delivery: true,
        }).map((b) => b.key),
      ).toContain("delivery");
    });

    it("badgeCount and topBadges agree with the suppression", () => {
      // The `+N` overflow indicator on ProducerCard is driven by badgeCount,
      // so a stale count would re-surface the badge in the popover.
      // MEH-1846: the second earned badge was "products" until it was removed;
      // "new" replaces it so this still asserts a MULTI-badge producer (a
      // single-badge fixture could not detect a stale count at all).
      const p = {
        ...deliveryOnly,
        verification_tier: "verified",
        days_since_created: 3,
      };
      expect(badgeCount(p)).toBe(2);
      expect(topBadges(p, 5).map((b) => b.key)).toEqual(["verified", "new"]);
    });
  });

  // MEH-1846: replaces the old "products — when products_count >= 3" case.
  // Asserting the BEHAVIOUR (no badge at any count) rather than the absence of
  // a line of code: a reintroduced badge fails this whatever it is keyed on.
  it("products_count earns NO badge at any value (MEH-1846)", () => {
    for (const products_count of [0, 2, 3, 10, 999]) {
      expect(allBadges({ products_count }).map((b) => b.key)).toEqual([]);
    }
  });

  it("returns badges in priority order regardless of field order", () => {
    const badges = allBadges({
      products_count: 10,
      has_delivery: true,
      kashrut_verified_at: "2026-01-01T00:00:00Z",
      grass_fed: true,
      has_gluten_free_products: true,
      has_vegan_products: true,
      has_lactose_free_products: true,
      organic_certified: true,
      days_since_created: 5,
      has_producer_license: true,
      is_recommended: true,
      verification_tier: "verified",
    });
    // MEH-1259: organic_certified is set but earns no badge — absent from order.
    // MEH-1492: license now precedes recommended.
    expect(badges.map((b) => b.key)).toEqual([
      "verified",
      "license",
      "recommended",
      "new",
      "grass_fed",
      "gluten_free",
      "vegan",
      "lactose_free",
      "kosher",
      "delivery",
    ]);
  });

  it("each returned badge carries label + tooltip", () => {
    const [badge] = allBadges({ verification_tier: "verified" });
    expect(badge.label).toBe("מאומת");
    expect(badge.tooltip).toMatch(/נבדק/);
  });
});

describe("topBadges", () => {
  const producer = {
    verification_tier: "verified",
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
    expect(topBadges({ verification_tier: "verified" }, 5).map((b) => b.key)).toEqual([
      "verified",
    ]);
  });

  it("returns [] when limit is 0 or negative", () => {
    expect(topBadges(producer, 0)).toEqual([]);
    expect(topBadges(producer, -3)).toEqual([]);
  });

  it("picks grass_fed over delivery when both earned and limit=2 with verified", () => {
    // MEH-1259: was organic (now removed) — grass_fed is the next quality badge.
    // verified (priority 0) + grass_fed win over delivery (lower priority).
    const p = {
      verification_tier: "verified",
      grass_fed: true,
      has_delivery: true,
    };
    expect(topBadges(p, 2).map((b) => b.key)).toEqual(["verified", "grass_fed"]);
  });

  // MEH-1492: license now sits between verified and recommended (fact > opinion).
  // MEH-1162: fixture must be verified-tier — an unverified license no longer
  // earns the chip, so the verified badge (priority 0) leads the expectation.
  it("license priority — sits between verified and recommended", () => {
    const p = {
      verification_tier: "verified",
      is_recommended: true,
      has_producer_license: true,
      days_since_created: 5,
    };
    expect(topBadges(p, 4).map((b) => b.key)).toEqual([
      "verified",
      "license",
      "recommended",
      "new",
    ]);
    // limit=3 → verified + license + recommended, new gets truncated
    expect(topBadges(p, 3).map((b) => b.key)).toEqual([
      "verified",
      "license",
      "recommended",
    ]);
  });
});

// MEH-1439: dietary badges light on has_X_products (ANY marked product, MEH-479),
// so the tooltip must not claim the WHOLE catalog. The old copy over-claimed
// ("כל המוצרים טבעוניים", "המוצרים מתאימים...") — same over-claim risk family as
// MEH-1259 organic. New copy = "לעסק יש מוצרים ... מסומנים בקטלוג".
describe("dietary badge tooltips — any-product semantics (MEH-1439)", () => {
  it("vegan tooltip states any-product semantics, not 'all products'", () => {
    expect(BADGE_CONFIG.vegan.tooltip).toBe(
      "לעסק יש מוצרים טבעוניים מסומנים בקטלוג.",
    );
    expect(BADGE_CONFIG.vegan.tooltip).not.toMatch(/כל המוצרים/);
  });

  it("gluten_free tooltip states any-product semantics", () => {
    expect(BADGE_CONFIG.gluten_free.tooltip).toBe(
      "לעסק יש מוצרים ללא גלוטן מסומנים בקטלוג.",
    );
    expect(BADGE_CONFIG.gluten_free.tooltip).not.toMatch(/צליאק/);
  });

  it("lactose_free tooltip states any-product semantics", () => {
    expect(BADGE_CONFIG.lactose_free.tooltip).toBe(
      "לעסק יש מוצרים ללא לקטוז מסומנים בקטלוג.",
    );
  });

  // MEH-1438: vegetarian tooltip mirrors the same any-product wording.
  it("vegetarian tooltip states any-product semantics", () => {
    expect(BADGE_CONFIG.vegetarian.tooltip).toBe(
      "לעסק יש מוצרים צמחוניים מסומנים בקטלוג.",
    );
  });
});

describe("badgeCount", () => {
  it("counts all earned badges", () => {
    // MEH-1846: was 5 with the products badge; products_count is left on the
    // fixture on purpose, so this also asserts it contributes nothing.
    expect(
      badgeCount({
        verification_tier: "verified",
        is_recommended: true,
        days_since_created: 5,
        has_delivery: true,
        products_count: 7,
      }),
    ).toBe(4);
  });

  it("counts the new Phase B badges (organic no longer counts — MEH-1259)", () => {
    // organic_certified is set but earns no badge post-MEH-1259, so only
    // grass_fed + kosher count.
    expect(
      badgeCount({
        organic_certified: true,
        grass_fed: true,
        kashrut_verified_at: "2026-01-01T00:00:00Z",
      }),
    ).toBe(2);
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
