// MEH-3715: the one agorot ↔ shekels owner.
import { describe, it, expect } from "vitest";
import { AGOROT_PER_SHEKEL, agorotToShekels, shekelsToAgorot, formatAgorot } from "@/lib/money";
import { formatPrice } from "@/lib/utils";

describe("lib/money", () => {
  it("converts both ways", () => {
    expect(AGOROT_PER_SHEKEL).toBe(100);
    expect(agorotToShekels(1250)).toBe(12.5);
    expect(shekelsToAgorot(12.5)).toBe(1250);
    expect(shekelsToAgorot(0.105)).toBe(11);
  });
  it("formats agorot the way the two billing copies did", () => {
    expect(formatAgorot(3500)).toBe(formatPrice(35));
    expect(formatAgorot(3549.6)).toBe(formatPrice(35.5));
  });
});
