import { describe, it, expect } from "vitest";
import { normalizePhone } from "@/lib/utils";

// MEH-1176 F2 — admin outreach used an inline normalization chain
// (`(phone || "").replace(/\D/g, "").replace(/^0/, "972")`) instead of the
// canonical lib/utils normalizePhone. The swap must not change the number
// WhatsApp receives for any valid Israeli mobile input.
const oldInlineChain = (phone) =>
  (phone || "").replace(/\D/g, "").replace(/^0/, "972");

describe("MEH-1176 F2 — outreach phone normalization consolidation", () => {
  it.each([
    "0501234567",
    "052-123-4567",
    "(050) 123-4567",
    "+972501234567",
    "972501234567",
    " 0501234567 ",
    "050.123.4567",
  ])("normalizePhone(%j) matches the old outreach inline chain", (input) => {
    expect(normalizePhone(input)).toBe(oldInlineChain(input));
  });

  it("empty / null input yields empty string on both paths", () => {
    expect(normalizePhone("")).toBe(oldInlineChain(""));
    expect(normalizePhone(null)).toBe(oldInlineChain(null));
  });

  // Documented divergence (improvement, surfaced in the F2 PR body): the
  // canonical helper VALIDATES — non-mobile / malformed numbers return ""
  // instead of a garbage wa.me target. The old chain forwarded them broken.
  it("invalid numbers now return empty string instead of a broken wa.me target", () => {
    expect(normalizePhone("021234567")).toBe(""); // landline — not [5-9]
    expect(oldInlineChain("021234567")).toBe("97221234567"); // the old broken output
    expect(normalizePhone("05012")).toBe(""); // truncated
  });
});
