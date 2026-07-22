import { describe, it, expect } from "vitest";
import {
  CATEGORY_CHIPS,
  TOGGLE_CHIPS,
  QUICK_CHIP_KEYS,
  countActiveSheetOnlyFilters,
  resolveCategoryId,
  resolveCategoryIds,
  chipStateToParams,
  boundsToCenterRadius,
} from "@/lib/map-chips";

const dbCategories = [
  { id: 1, name: "בשר ועוף", emoji: "🥩" },
  { id: 2, name: "ירקות ופירות", emoji: "🥬" },
  { id: 3, name: "חלב וגבינות", emoji: "🥛" },
  { id: 4, name: "לחם ומאפה", emoji: "🍞" },
];

describe("CATEGORY_CHIPS + TOGGLE_CHIPS", () => {
  it("includes 'all' as the first chip with null matches", () => {
    expect(CATEGORY_CHIPS[0]).toEqual({ key: "all", label: "כל", matches: null });
  });

  it("includes the four spec category chips with Hebrew labels", () => {
    // MEH-1082: labels unified with the app taxonomy (matches arrays keep the
    // legacy DB names — see the dbCategories fixture + resolveCategoryId tests).
    const labels = CATEGORY_CHIPS.map((c) => c.label);
    expect(labels).toContain("בשר ודגים");
    expect(labels).toContain("ירקות ופירות");
    expect(labels).toContain("חלב וגבינות");
    expect(labels).toContain("לחמים ואפייה");
  });

  it("MEH-1441: each category chip declares a CATEGORY_ICONS glyph key; 'all' stays iconless", () => {
    const byKey = Object.fromEntries(CATEGORY_CHIPS.map((c) => [c.key, c]));
    // Reset chip is the differentiator — never gets a leading glyph.
    expect(byKey.all.iconName).toBeUndefined();
    // Aggregate chips point at a canonical CATEGORY_ICONS key (built into a 16px
    // element at the render site, keeping this module React-free).
    expect(byKey.meat.iconName).toBe("בשר");
    expect(byKey.produce.iconName).toBe("ירקות");
    expect(byKey.dairy.iconName).toBe("חלב וגבינות");
    expect(byKey.bread.iconName).toBe("לחמים ואפייה");
  });

  it("category-tint: each category chip declares an iconColor from CATEGORY_STYLES; 'all' has none", () => {
    const byKey = Object.fromEntries(CATEGORY_CHIPS.map((c) => [c.key, c]));
    // Reset chip is never tinted.
    expect(byKey.all.iconColor).toBeUndefined();
    // Aggregate chips carry the category colour (mirrors map-categories.js —
    // dairy uses the WCAG-safe textColor #3b72ad, produce = produce-green).
    expect(byKey.meat.iconColor).toBe("#c04040");
    expect(byKey.produce.iconColor).toBe("#2e6853");
    expect(byKey.dairy.iconColor).toBe("#3b72ad");
    expect(byKey.bread.iconColor).toBe("#896714");
  });

  it("includes all expected toggle chip keys", () => {
    const keys = TOGGLE_CHIPS.map((c) => c.key);
    expect(keys).toContain("has_delivery");
    expect(keys).toContain("verified");
    expect(keys).toContain("grass_fed");
    expect(keys).toContain("gluten_free");
    expect(keys).toContain("vegan");
    // MEH-1438: vegetarian diet toggle.
    expect(keys).toContain("vegetarian");
    expect(keys).toContain("lactose_free");
    // MEH-1087: verified-only kosher toggle restored to /map.
    expect(keys).toContain("kosher");
    // MEH-1259: organic toggle removed from the /map FilterSheet.
    expect(keys).not.toContain("organic");
  });

  it("MEH-1087: kosher is a sheet-only quality chip with the locked label", () => {
    const kosher = TOGGLE_CHIPS.find((c) => c.key === "kosher");
    expect(kosher).toMatchObject({ label: "כשרות מאומתת", group: "quality" });
    // Sheet-only: must not sit in the inline quick-chip row.
    expect(QUICK_CHIP_KEYS).not.toContain("kosher");
    // Counts toward the "סינון" badge (sheet-only active).
    expect(countActiveSheetOnlyFilters({ kosher: true })).toBe(1);
  });

  // MEH-1461: Sapir-LOCK — the /map quick-chip row is capped at exactly 2 chips
  // ([מאומתים] [משלוח אליי]); no pickup chip, ever. Any new filter is born
  // inside FilterSheet, never on the row.
  it("MEH-1461: quick-chip row is exactly [verified, has_delivery] — no pickup chip", () => {
    expect(QUICK_CHIP_KEYS).toEqual(["verified", "has_delivery"]);
    expect(QUICK_CHIP_KEYS).toHaveLength(2);
    expect(QUICK_CHIP_KEYS).not.toContain("pickup");
    expect(QUICK_CHIP_KEYS).not.toContain("pickup_points");
    // Pickup is not a producer toggle filter at all (it's a map-layer toggle).
    expect(TOGGLE_CHIPS.some((c) => /pickup/.test(c.key))).toBe(false);
  });
});

describe("resolveCategoryId", () => {
  it("returns null for 'all' (no matches array)", () => {
    const all = CATEGORY_CHIPS.find((c) => c.key === "all");
    expect(resolveCategoryId(all, dbCategories)).toBe(null);
  });

  it("matches the primary Hebrew name", () => {
    const meat = CATEGORY_CHIPS.find((c) => c.key === "meat");
    expect(resolveCategoryId(meat, dbCategories)).toBe(1);
  });

  it("falls through to the alt match when primary is missing", () => {
    const meat = CATEGORY_CHIPS.find((c) => c.key === "meat");
    const alt = [{ id: 99, name: "בשר", emoji: "🥩" }];
    expect(resolveCategoryId(meat, alt)).toBe(99);
  });

  it("returns null when no candidate matches", () => {
    const meat = CATEGORY_CHIPS.find((c) => c.key === "meat");
    expect(resolveCategoryId(meat, [])).toBe(null);
  });

  it("returns null for null/undefined chip", () => {
    expect(resolveCategoryId(null, dbCategories)).toBe(null);
    expect(resolveCategoryId(undefined, dbCategories)).toBe(null);
  });
});

// MEH-1465 Chunk A: an aggregate chip maps to ALL its matched DB ids, not just
// the first. This is the OR-across-matches fix — resolveCategoryId (first-match)
// stays for the "does this chip match anything?" visibility check in useMapFilters.
describe("resolveCategoryIds", () => {
  it("returns [] for 'all' (no matches array)", () => {
    const all = CATEGORY_CHIPS.find((c) => c.key === "all");
    expect(resolveCategoryIds(all, dbCategories)).toEqual([]);
  });

  it("returns EVERY matched id when the DB carries several of the chip's names", () => {
    const meat = CATEGORY_CHIPS.find((c) => c.key === "meat");
    // meat.matches = [בשר ועוף, בשר, דגים, בשר ודגים, בשר, עוף ודגים].
    const db = [
      { id: 1, name: "בשר ועוף", emoji: "🥩" },
      { id: 5, name: "דגים", emoji: "🐟" },
      { id: 9, name: "חלב וגבינות", emoji: "🥛" }, // unrelated — excluded
    ];
    expect(resolveCategoryIds(meat, db)).toEqual([1, 5]);
  });

  it("returns the single id when only one name matches", () => {
    const dairy = CATEGORY_CHIPS.find((c) => c.key === "dairy");
    expect(resolveCategoryIds(dairy, dbCategories)).toEqual([3]);
  });

  it("returns [] when no candidate matches / chip is nullish", () => {
    const meat = CATEGORY_CHIPS.find((c) => c.key === "meat");
    expect(resolveCategoryIds(meat, [])).toEqual([]);
    expect(resolveCategoryIds(null, dbCategories)).toEqual([]);
    expect(resolveCategoryIds(undefined, dbCategories)).toEqual([]);
  });
});

describe("chipStateToParams", () => {
  it("returns {} for the default 'all' state", () => {
    expect(
      chipStateToParams(
        { categoryKeys: [], organic: false, has_delivery: false },
        dbCategories,
      ),
    ).toEqual({});
  });

  it("maps a category chip to {category: [<ids>]} — always a list (MEH-1465)", () => {
    expect(
      chipStateToParams(
        { categoryKeys: ["dairy"], organic: false, has_delivery: false },
        dbCategories,
      ),
    ).toEqual({ category: [3] });
  });

  it("MEH-1465: an aggregate chip emits ALL its matched ids (OR-across-matches)", () => {
    const db = [
      { id: 1, name: "בשר ועוף", emoji: "🥩" },
      { id: 5, name: "דגים", emoji: "🐟" },
      { id: 2, name: "ירקות ופירות", emoji: "🥬" },
    ];
    expect(
      chipStateToParams(
        { categoryKeys: ["meat"], organic: false, has_delivery: false },
        db,
      ),
    ).toEqual({ category: [1, 5] });
  });

  it("ignores a category chip whose match isn't in the DB", () => {
    expect(
      chipStateToParams(
        { categoryKeys: ["meat"], organic: false, has_delivery: false },
        [], // empty DB → no match
      ),
    ).toEqual({});
  });

  it("MEH-1465: multi-select unions the ids of ALL selected chips", () => {
    // dairy → [3], bread → [4]; the OR union is [3, 4] (chip-array order).
    expect(
      chipStateToParams(
        { categoryKeys: ["dairy", "bread"], organic: false, has_delivery: false },
        dbCategories,
      ),
    ).toEqual({ category: [3, 4] });
  });

  it("MEH-1465: unions an aggregate chip's ids with a single-id chip", () => {
    const db = [
      { id: 1, name: "בשר ועוף", emoji: "🥩" },
      { id: 5, name: "דגים", emoji: "🐟" },
      { id: 3, name: "חלב וגבינות", emoji: "🥛" },
    ];
    // meat → [1, 5], dairy → [3]; union preserves insertion order → [1, 5, 3].
    expect(
      chipStateToParams({ categoryKeys: ["meat", "dairy"] }, db),
    ).toEqual({ category: [1, 5, 3] });
  });

  it("MEH-1465: dedups ids across the selection (Set union — defensive)", () => {
    // A duplicated key must not double-emit its id.
    expect(
      chipStateToParams({ categoryKeys: ["dairy", "dairy"] }, dbCategories),
    ).toEqual({ category: [3] });
  });

  it("composes category + grass_fed + delivery into one param object", () => {
    // MEH-1259: organic removed — grass_fed stands in as the quality toggle.
    expect(
      chipStateToParams(
        { categoryKeys: ["produce"], grass_fed: true, has_delivery: true },
        dbCategories,
      ),
    ).toEqual({ category: [2], grass_fed: true, has_delivery: true });
  });

  it("MEH-1087: kosher state maps to the verified-only ?kosher param", () => {
    expect(
      chipStateToParams({ categoryKeys: [], kosher: true }, dbCategories),
    ).toEqual({ kosher: true });
  });

  it("MEH-1438: vegetarian state maps to the ?vegetarian param", () => {
    expect(
      chipStateToParams({ categoryKeys: [], vegetarian: true }, dbCategories),
    ).toEqual({ vegetarian: true });
  });

  it("ignores a lingering organic state key (filter removed — MEH-1259)", () => {
    expect(
      chipStateToParams(
        { categoryKeys: [], organic: true, has_delivery: false },
        dbCategories,
      ),
    ).toEqual({});
  });
});

describe("boundsToCenterRadius", () => {
  it("returns null for falsy or malformed input", () => {
    expect(boundsToCenterRadius(null)).toBe(null);
    expect(boundsToCenterRadius({})).toBe(null);
    expect(
      boundsToCenterRadius({ north: 32, south: 31, east: "bad", west: 34 }),
    ).toBe(null);
  });

  it("computes the center latitude/longitude", () => {
    const result = boundsToCenterRadius({
      north: 32.1,
      south: 31.7,
      east: 35.3,
      west: 34.7,
    });
    expect(result.lat).toBeCloseTo(31.9, 5);
    expect(result.lng).toBeCloseTo(35.0, 5);
  });

  it("returns a positive integer radius (km, ceiled)", () => {
    const result = boundsToCenterRadius({
      north: 32.1,
      south: 31.7,
      east: 35.3,
      west: 34.7,
    });
    expect(result.radius_km).toBeGreaterThan(0);
    expect(Number.isInteger(result.radius_km)).toBe(true);
  });

  it("zero-area bounds → 0 radius", () => {
    const result = boundsToCenterRadius({
      north: 32,
      south: 32,
      east: 34,
      west: 34,
    });
    expect(result.radius_km).toBe(0);
  });
});

// MEH-1461: the /map pickup-layer toggle uses consumer language "איסוף עצמי",
// never the data-model jargon "נקודות איסוף" / "נק' איסוף".
describe("MEH-1461 — /map pickup-layer consumer copy", () => {
  it('he: pickup_layer label is "איסוף עצמי", not the jargon "נקודות איסוף"', async () => {
    const he = (await import("@/messages/he.json")).default;
    const pl = he.map.pane.pickup_layer;
    expect(pl.label).toBe("איסוף עצמי");
    expect(pl.label).not.toContain("נקודות איסוף");
    expect(pl.aria).not.toContain("נקודות איסוף");
  });

  it("en: pickup_layer label is the consumer term, not \"Pickup points\"", async () => {
    const en = (await import("@/messages/en.json")).default;
    const pl = en.map.pane.pickup_layer;
    expect(pl.label).toBe("Self-pickup");
    expect(pl.label).not.toContain("Pickup points");
  });
});
