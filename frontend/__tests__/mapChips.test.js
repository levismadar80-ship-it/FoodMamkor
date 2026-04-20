import { describe, it, expect } from "vitest";
import {
  CATEGORY_CHIPS,
  TOGGLE_CHIPS,
  resolveCategoryId,
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
    const labels = CATEGORY_CHIPS.map((c) => c.label);
    expect(labels).toContain("בשר ועוף");
    expect(labels).toContain("ירקות ופירות");
    expect(labels).toContain("חלב וגבינות");
    expect(labels).toContain("לחם ומאפה");
  });

  it("includes all expected toggle chip keys", () => {
    const keys = TOGGLE_CHIPS.map((c) => c.key);
    expect(keys).toContain("has_delivery");
    expect(keys).toContain("verified");
    expect(keys).toContain("organic");
    expect(keys).toContain("grass_fed");
    expect(keys).toContain("gluten_free");
    expect(keys).toContain("vegan");
    expect(keys).toContain("lactose_free");
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

describe("chipStateToParams", () => {
  it("returns {} for the default 'all' state", () => {
    expect(
      chipStateToParams(
        { categoryKey: "all", organic: false, has_delivery: false },
        dbCategories,
      ),
    ).toEqual({});
  });

  it("maps a category chip to {category: <id>}", () => {
    expect(
      chipStateToParams(
        { categoryKey: "dairy", organic: false, has_delivery: false },
        dbCategories,
      ),
    ).toEqual({ category: 3 });
  });

  it("ignores a category chip whose match isn't in the DB", () => {
    expect(
      chipStateToParams(
        { categoryKey: "meat", organic: false, has_delivery: false },
        [], // empty DB → no match
      ),
    ).toEqual({});
  });

  it("composes category + organic + delivery into one param object", () => {
    expect(
      chipStateToParams(
        { categoryKey: "produce", organic: true, has_delivery: true },
        dbCategories,
      ),
    ).toEqual({ category: 2, organic: true, has_delivery: true });
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
