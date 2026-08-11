/**
 * MEH-1934 — the ≥5 data gate on the two new diet chips.
 *
 * Same principle as MEH-1881's open-now gate: below the threshold the chip is
 * ABSENT, not disabled, so nothing hints at a filter that would return an empty
 * list today. Two things make this gate worth its own spec rather than trusting
 * the render-site wiring:
 *
 *  1. `CHIPS_CONFIG` is SHARED with the home grid. Adding a chip there puts it
 *     on two surfaces at once, and gating only one of them leaves the other
 *     deep-linking into an empty listing. That is not hypothetical — it is what
 *     happened while writing MEH-1934, and only the `toHaveLength` pin in
 *     useHomePageDietChipsUrl.test.jsx caught it.
 *  2. The count must come from the UNFILTERED catalog. Counting the filtered
 *     result is circular: switch the chip on and coverage instantly reads
 *     100%, so the gate could never close again (the trap ProducersClient.jsx
 *     documents at the open-now gate).
 *
 * The real config drives these assertions — no stubbed threshold, or the spec
 * would pass against any shipped number at all.
 */
import { describe, it, expect } from "vitest";
import {
  CHIPS_CONFIG,
  DIET_CHIP_MIN,
  GATED_DIET_KEYS,
  visibleGatedDietKeys,
} from "@/lib/producer-filters";

/** n producers carrying the aggregate flag for `key`. */
const withFlag = (key, n) => {
  const field = {
    no_added_sugar: "has_no_added_sugar_products",
    low_carb: "has_low_carb_products",
  }[key];
  return Array.from({ length: n }, (_, i) => ({ id: i, [field]: true }));
};

describe("MEH-1934 — diet chip data gate", () => {
  it("gates exactly the two new axes, and never the four that already have data", () => {
    expect(GATED_DIET_KEYS).toEqual(["no_added_sugar", "low_carb"]);
    // Retro-gating an existing axis would REMOVE a working filter.
    for (const old of ["vegan", "vegetarian", "gluten_free", "lactose_free"]) {
      expect(GATED_DIET_KEYS).not.toContain(old);
    }
  });

  it("both new chips are on the shared row, so both surfaces must gate them", () => {
    const keys = CHIPS_CONFIG.map((c) => c.key);
    for (const k of GATED_DIET_KEYS) expect(keys).toContain(k);
  });

  it("shows a chip at the threshold", () => {
    expect(visibleGatedDietKeys(withFlag("low_carb", DIET_CHIP_MIN), {})).toContain(
      "low_carb",
    );
  });

  /** The discriminating case — one below is the whole point of the gate. */
  it("hides a chip one below the threshold", () => {
    const shown = visibleGatedDietKeys(withFlag("low_carb", DIET_CHIP_MIN - 1), {});
    expect(shown).not.toContain("low_carb");
  });

  it("counts only producers that actually carry the flag", () => {
    // DIET_CHIP_MIN businesses exist, but none declared low-carb.
    const noise = Array.from({ length: DIET_CHIP_MIN * 3 }, (_, i) => ({ id: i }));
    expect(visibleGatedDietKeys(noise, {})).not.toContain("low_carb");
  });

  it("counts each axis independently — one axis's coverage never opens the other", () => {
    const shown = visibleGatedDietKeys(withFlag("no_added_sugar", DIET_CHIP_MIN), {});
    expect(shown).toContain("no_added_sugar");
    expect(shown).not.toContain("low_carb");
  });

  /**
   * An ACTIVE filter keeps its chip even under the gate. Without this, a
   * deep-linked ?low_carb=1 strands the visitor with a filter whose effect she
   * can see and cannot switch off — the same carve-out MEH-1881 makes.
   */
  it("keeps an active chip visible below the threshold", () => {
    const shown = visibleGatedDietKeys([], { low_carb: true });
    expect(shown).toContain("low_carb");
    expect(shown).not.toContain("no_added_sugar");
  });

  it("survives an empty or absent producer list without throwing", () => {
    expect(visibleGatedDietKeys([], {})).toEqual([]);
    expect(visibleGatedDietKeys(undefined, {})).toEqual([]);
    expect(visibleGatedDietKeys([null, undefined], {})).toEqual([]);
  });
});
