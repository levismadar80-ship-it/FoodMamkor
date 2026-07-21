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
      expect(chip.label).toBe(ATTRIBUTE_LABELS[key]);
    }
  });

  it("/map TOGGLE_CHIPS uses the shared label for every shared key", () => {
    for (const key of SHARED) {
      const chip = TOGGLE_CHIPS.find((c) => c.key === key);
      expect(chip, `TOGGLE_CHIPS missing ${key}`).toBeDefined();
      expect(chip.label).toBe(ATTRIBUTE_LABELS[key]);
    }
  });

  it("the two surfaces render identical labels for every shared attribute", () => {
    for (const key of SHARED) {
      const producersLabel = CHIPS_CONFIG.find((c) => c.key === key).label;
      const mapLabel = TOGGLE_CHIPS.find((c) => c.key === key).label;
      expect(producersLabel, `parity mismatch for ${key}`).toBe(mapLabel);
    }
  });

  it("MEH-1418: verified label names WHAT was verified (was the vague 'מאומתים')", () => {
    expect(ATTRIBUTE_LABELS.verified).toBe("רישוי מאומת");
    expect(CHIPS_CONFIG.find((c) => c.key === "verified")?.label).toBe("רישוי מאומת");
    expect(TOGGLE_CHIPS.find((c) => c.key === "verified")?.label).toBe("רישוי מאומת");
  });

  it("MEH-1418: kosher label unified across surfaces (Sapir-LOCKED, MEH-1087)", () => {
    // kosher joined the shared map — /producers + /map now read identically.
    expect(ATTRIBUTE_LABELS.kosher).toBe("כשרות מאומתת");
    expect(CHIPS_CONFIG.find((c) => c.key === "kosher")?.label).toBe("כשרות מאומתת");
    expect(TOGGLE_CHIPS.find((c) => c.key === "kosher")?.label).toBe("כשרות מאומתת");
  });

  it("grass_fed stays /map-local (not in the shared map)", () => {
    expect(ATTRIBUTE_LABELS.grass_fed).toBeUndefined();
    expect(TOGGLE_CHIPS.find((c) => c.key === "grass_fed")?.label).toBe("גראס פד");
  });

  it("the unified attribute labels carry no emoji/glyph (MEH-657)", () => {
    // Text-only invariant: no chars outside the Hebrew block + spaces.
    for (const label of Object.values(ATTRIBUTE_LABELS)) {
      expect(label).toMatch(/^[֐-׿ ]+$/);
    }
  });
});
