// MEH-2602: the verify-email success page draws a CheckCircle icon above the
// title, and the title itself ended in «✓» — two checkmarks stacked. The icon
// carries the meaning; the title stays text.
import { describe, it, expect } from "vitest";
import he from "../messages/he.json";
import en from "../messages/en.json";

describe("verify-email success title (MEH-2602)", () => {
  it.each([["he", he], ["en", en]])("%s title carries no checkmark glyph", (_, m) => {
    expect(m.auth.verifyEmail.success_title).not.toMatch(/[✓✔]/);
  });
});
