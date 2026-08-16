import { describe, it, expect } from "vitest";
import he from "@/messages/he.json";
import en from "@/messages/en.json";

/**
 * MEH-1814 — the post-submit success copy is LOCKED (Sapir, 31/07). Nothing
 * else pins it: RegisterProducerClient.test.jsx mocks next-intl so `t()` returns
 * the key path, and the Playwright spec locates by data-testid per
 * docs/E2E-LOCATORS.md. Both are deliberate — and both mean a silent edit to
 * either locale file would ship unnoticed. This file is the only assertion that
 * reads the rendered VALUES.
 *
 * If a string here genuinely needs to change, it needs Sapir's approval first
 * (workflow rule 22 — copy approval gate); update the ticket, then this file.
 */

const S_HE = he.auth.register.producer.success;
const S_EN = en.auth.register.producer.success;

describe("MEH-1814 — locked post-submit success copy", () => {
  it("Hebrew matches the locked strings verbatim", () => {
    expect(S_HE.title).toBe("הבקשה נשלחה — העסק שלך בבדיקה");
    expect(S_HE.body).toBe(
      "קיבלנו את הפרטים. הצוות שלנו בודק ומאשר את העסק שלך בדרך כלל עד 3 ימי עסקים.",
    );
    expect(S_HE.next).toBe(
      "שני צעדים קצרים בלוח הבקרה מזרזים את האישור: אימות מספר הוואטסאפ בקוד קצר, והעלאת תמונה ראשונה של העסק.",
    );
    expect(S_HE.cta).toBe("ללוח הבקרה");
  });

  it("English matches the locked strings verbatim", () => {
    expect(S_EN.title).toBe("Request sent — your business is in review");
    expect(S_EN.body).toBe(
      "We received your details. Our team reviews and approves new businesses, usually within 3 business days.",
    );
    expect(S_EN.next).toBe(
      "Two quick steps in your dashboard speed up approval: verifying your WhatsApp number with a short code, and uploading a first photo.",
    );
    expect(S_EN.cta).toBe("To my dashboard");
  });

  // MEH-1347 unified the approval-time promise to this exact phrase across every
  // surface. Asserted separately from the full-string check above so a future
  // rewording of the sentence still fails loudly on the phrase itself, naming
  // the cross-ticket constraint rather than looking like an unrelated typo.
  it("keeps the MEH-1347 approval-time phrase verbatim", () => {
    expect(S_HE.body).toContain("עד 3 ימי עסקים");
    expect(S_EN.body).toContain("3 business days");
  });

  // The four keys must exist in BOTH locales — a he-only addition renders the
  // raw key path to an English-locale reader.
  it("all four keys are present in both locales", () => {
    for (const key of ["title", "body", "next", "cta"]) {
      expect(typeof S_HE[key], `he.${key}`).toBe("string");
      expect(typeof S_EN[key], `en.${key}`).toBe("string");
      expect(S_HE[key].length, `he.${key} non-empty`).toBeGreaterThan(0);
      expect(S_EN[key].length, `en.${key} non-empty`).toBeGreaterThan(0);
    }
  });
});
