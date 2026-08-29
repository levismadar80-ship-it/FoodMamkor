import { describe, it, expect } from "vitest";
import { ATTRIBUTE_LABELS } from "@/lib/attribute-labels";
import { CHIPS_CONFIG } from "@/lib/producer-filters";
import { TOGGLE_CHIPS } from "@/lib/map-chips";

// MEH-1082 [T-C]: the /producers filter row and the /map filter chips share one
// label source (ATTRIBUTE_LABELS) so the taxonomy reads identically on both
// surfaces. These tests pin that parity + the two surface-specific exceptions.

const SHARED = Object.keys(ATTRIBUTE_LABELS);

describe("unified attribute labels (MEH-1082)", () => {
  it("/producers CHIPS_CONFIG uses the shared label for every shared key", () => {
    for (const key of SHARED) {
      const chip = CHIPS_CONFIG.find((c) => c.key === key);
      expect(chip, `CHIPS_CONFIG missing ${key}`).toBeDefined();
      expect(chip.label).toBe(ATTRIBUTE_LABELS[key].label);
    }
  });

  it("/map TOGGLE_CHIPS uses the shared label for every shared key", () => {
    for (const key of SHARED) {
      const chip = TOGGLE_CHIPS.find((c) => c.key === key);
      expect(chip, `TOGGLE_CHIPS missing ${key}`).toBeDefined();
      expect(chip.label).toBe(ATTRIBUTE_LABELS[key].label);
    }
  });

  it("the two surfaces render identical labels for every shared attribute", () => {
    for (const key of SHARED) {
      const producersLabel = CHIPS_CONFIG.find((c) => c.key === key).label;
      const mapLabel = TOGGLE_CHIPS.find((c) => c.key === key).label;
      expect(producersLabel, `parity mismatch for ${key}`).toBe(mapLabel);
    }
  });

  // MEH-1418 set this to "רישוי מאומת" so the label named WHAT was verified,
  // replacing a vague "מאומתים". MEH-2214 shortens it to "מאומת" so the filter,
  // the badge and the seal say one word for one axis.
  //
  // That trade is deliberate and it is NOT free: the label alone no longer
  // names the document. What carries MEH-1418's intent now is the FilterSheet
  // row's explanation, which falls back to BADGE_CONFIG.verified.tooltip
  // ("בית העסק הציג מסמך רישוי או אישור פטור רשמי שנבדק ידנית") because the
  // axis declares subtext: null. The assertion below is renamed to describe
  // what it actually checks -- a name claiming "names WHAT was verified" while
  // asserting a word that does not would be the coverage-claim failure
  // .claude/rules/testing.md names.
  it("MEH-2214: verified label is one word, identical on every surface", () => {
    expect(ATTRIBUTE_LABELS.verified.label).toBe("מאומת");
    expect(CHIPS_CONFIG.find((c) => c.key === "verified")?.label).toBe("מאומת");
    expect(TOGGLE_CHIPS.find((c) => c.key === "verified")?.label).toBe("מאומת");
  });

  it("MEH-1418: kosher label unified across surfaces (Sapir-LOCKED, MEH-1087)", () => {
    // kosher joined the shared map — /producers + /map now read identically.
    expect(ATTRIBUTE_LABELS.kosher.label).toBe("כשרות מאומתת");
    expect(CHIPS_CONFIG.find((c) => c.key === "kosher")?.label).toBe("כשרות מאומתת");
    expect(TOGGLE_CHIPS.find((c) => c.key === "kosher")?.label).toBe("כשרות מאומתת");
  });

  it("grass_fed stays /map-local (not in the shared map)", () => {
    expect(ATTRIBUTE_LABELS.grass_fed).toBeUndefined();
    expect(TOGGLE_CHIPS.find((c) => c.key === "grass_fed")?.label).toBe("גראס פד");
  });

  it("the unified attribute labels carry no emoji/glyph (MEH-657)", () => {
    // Text-only invariant: no chars outside the Hebrew block + spaces.
    // MEH-1507: entries are objects now — assert on the `label` field.
    for (const entry of Object.values(ATTRIBUTE_LABELS)) {
      expect(entry.label).toMatch(/^[֐-׿ ]+$/);
    }
  });
});
