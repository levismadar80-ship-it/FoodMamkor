/**
 * MEH-1173 — the MEH-532 seed description counts as MISSING.
 *
 * The default-description "בית עסק מקומי. עוד פרטים בקרוב." (and its en twin)
 * is written at registration and must NOT satisfy the completeness "תיאור קצר"
 * check — otherwise a producer who never wrote a real description reads as
 * complete. Also verifies a real description / tagline still satisfies it.
 */
import { describe, it, expect } from "vitest";
import {
  producerCompleteness,
  isDefaultDescription,
  DEFAULT_PRODUCER_DESCRIPTIONS,
  COMPLETENESS_FIELDS,
} from "@/lib/producer-completeness";

// A producer complete on every OTHER axis, so only the description field can
// flip the "תיאור קצר" missing entry.
const baseComplete = {
  city: "חיפה",
  lat: 32.8,
  lng: 34.9,
  phone: "050-1234567",
  categories: [{ id: 1, name: "מאפים" }],
  images: ["https://x/img.jpg"],
  has_physical_location: true,
};

const descMissing = (p) =>
  producerCompleteness(p).missing.includes(COMPLETENESS_FIELDS.short_desc);

describe("isDefaultDescription", () => {
  it("matches both localized seeds and ignores surrounding whitespace", () => {
    for (const seed of DEFAULT_PRODUCER_DESCRIPTIONS) {
      expect(isDefaultDescription(seed)).toBe(true);
      expect(isDefaultDescription(`  ${seed}  `)).toBe(true);
    }
    expect(isDefaultDescription("ריבות ביתיות מהגליל")).toBe(false);
    expect(isDefaultDescription("")).toBe(false);
    expect(isDefaultDescription(null)).toBe(false);
    expect(isDefaultDescription(undefined)).toBe(false);
  });
});

describe("producerCompleteness — description default exclusion (MEH-1173)", () => {
  it("counts the he default seed as missing", () => {
    expect(descMissing({ ...baseComplete, description: DEFAULT_PRODUCER_DESCRIPTIONS[0] })).toBe(true);
  });

  it("counts the en default seed as missing", () => {
    expect(descMissing({ ...baseComplete, description: DEFAULT_PRODUCER_DESCRIPTIONS[1] })).toBe(true);
  });

  it("a real description satisfies the check", () => {
    expect(descMissing({ ...baseComplete, description: "ריבות בעבודת יד מהגליל" })).toBe(false);
  });

  it("a tagline (short_description) alone satisfies the check even with the default long description", () => {
    expect(
      descMissing({
        ...baseComplete,
        description: DEFAULT_PRODUCER_DESCRIPTIONS[0],
        short_description: "ריבות בוטיק מהגליל",
      }),
    ).toBe(false);
  });

  it("no description at all is missing", () => {
    expect(descMissing({ ...baseComplete })).toBe(true);
  });
});
