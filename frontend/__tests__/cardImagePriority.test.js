import { describe, it, expect } from "vitest";
import {
  cardImagePriority,
  EAGER_CARD_IMAGES,
  HIGH_PRIORITY_CARD_IMAGES,
} from "@/lib/card-image-priority";

// MEH-2233: the first screen of a card grid is never lazy, and at most two
// photos ask for high priority (Chrome «Optimize image priority»: 1–2 images).
describe("cardImagePriority (MEH-2233)", () => {
  it("maps grid positions 0..5 to high, high, eager, eager, lazy, lazy", () => {
    expect([0, 1, 2, 3, 4, 5].map(cardImagePriority)).toEqual([
      "high", "high", "eager", "eager", undefined, undefined,
    ]);
  });

  it("never gives high priority to more than two cards", () => {
    expect(HIGH_PRIORITY_CARD_IMAGES).toBeLessThanOrEqual(2);
    expect(EAGER_CARD_IMAGES).toBeGreaterThanOrEqual(HIGH_PRIORITY_CARD_IMAGES);
  });
});
