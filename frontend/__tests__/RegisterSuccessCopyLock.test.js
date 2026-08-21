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
    // MEH-2100, Sapir 16/08. The screen used to read «הבקשה נשלחה — העסק שלך
    // בבדיקה», which asserted two things registration no longer does: that a
    // request was sent, and that it is in review.
    //
    // A celebratory «ברוכים הבאים» was drafted and REJECTED for the same class
    // of reason, which is why this comment exists rather than just the string:
    // a welcome headline is the industry pattern for a COMPLETED onboarding,
    // and ours is not complete — the owner lands here at ~20% with photo,
    // product and phone verification still outstanding. A congratulation
    // followed immediately by three required tasks is the system claiming a
    // state it is not in, which is the exact defect this batch removes. The
    // first real success moment is SUBMISSION, not registration.
    //
    // So the headline is progress framing, and it has to stay that way.
    //
    // MEH-2136, Sapir 20/08. Progress framing is UNCHANGED — what changed is
    // the COUNT. The screen shipped three contradictory numbers for the same
    // journey: the title said one step, `next` said two, and the real submit
    // gate (MEH-2100, ProfileCompletenessCard.jsx:187-236) requires five items,
    // of which three are still outstanding for someone who has just registered
    // (photo, first product, WhatsApp verification — location, category and
    // contact are collected during registration). The title now states no
    // number at all rather than a wrong one, and `next` enumerates the actual
    // three. Deleting the count is the fix; a celebration is still rejected for
    // every reason the paragraphs above give.
    expect(S_HE.title).toBe("נרשמתם! נשארו כמה השלמות קצרות");
    // Same correction, one line down: registration no longer puts the
    // business in review, so the old "we approve within 3 business days"
    // promise was false the moment it was shown.
    expect(S_HE.body).toBe(
      "השלב הבא: השלמת הפרופיל בלוח הבקרה ושליחה לבדיקה.",
    );
    // MEH-2136: was "שני צעדים קצרים … מזרזים את האישור" — wrong on both
    // halves. It is three items, not two, and they do not "speed up" approval;
    // they are the GATE that unlocks sending for review at all.
    expect(S_HE.next).toBe(
      "ההשלמות בלוח הבקרה פותחות את השליחה לבדיקה: תמונה של העסק, מוצר ראשון בקטלוג, ואימות מספר הוואטסאפ.",
    );
    expect(S_HE.cta).toBe("ללוח הבקרה");
  });

  it("English matches the locked strings verbatim", () => {
    expect(S_EN.title).toBe("You're signed up — a few short steps left");
    expect(S_EN.body).toBe(
      "Next step: complete your profile in the dashboard and send it for review.",
    );
    expect(S_EN.next).toBe(
      "The steps in your dashboard unlock sending for review: a photo of your business, a first product in your catalogue, and verifying your WhatsApp number.",
    );
    expect(S_EN.cta).toBe("To my dashboard");
  });

  // MEH-1347 unified the approval-time promise to this exact phrase across every
  // surface. Asserted separately from the full-string check above so a future
  // rewording still fails loudly on the phrase itself, naming the cross-ticket
  // constraint rather than looking like an unrelated typo.
  //
  // MEH-2100 MOVED the promise; it did not retire it. The 3-business-day clock
  // now starts at SUBMISSION, not registration, so the phrase left the success
  // screen and belongs to the two surfaces that make the promise honestly: the
  // draft banner (before sending) and the post-submit toast (after). Asserting
  // it THERE keeps MEH-1347's constraint alive — deleting this test instead
  // would have retired a cross-ticket guarantee as a side effect of moving one
  // sentence, which is exactly the silent loss it was written to prevent.
  it("keeps the MEH-1347 approval-time phrase verbatim, on its new surfaces", () => {
    const D_HE = he.dashboard.producer.draft;
    const D_EN = en.dashboard.producer.draft;
    expect(D_HE.body).toContain("עד 3 ימי עסקים");
    expect(D_HE.toast_submitted).toContain("עד 3 ימי עסקים");
    expect(D_EN.body).toContain("3 business days");
    expect(D_EN.toast_submitted).toContain("3 business days");
  });

  // And it must be GONE from the registration success screen, which is the
  // half that makes the move real rather than additive.
  it("no longer promises approval at registration time (MEH-2100)", () => {
    expect(S_HE.body).not.toContain("עד 3 ימי עסקים");
    expect(S_EN.body).not.toContain("3 business days");
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
