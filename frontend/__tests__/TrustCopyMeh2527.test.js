/**
 * MEH-2527 — trust copy says only what the code does (site sweep 28/10).
 *
 * Each case names the promise that was false and pins its absence, so a
 * later copy edit that re-introduces it goes red. Wording itself is
 * Sapir-approved (28/10); these assert the claims, not the prose.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import he from "@/messages/he.json";
import en from "@/messages/en.json";
import { BADGE_CONFIG } from "@/lib/badges";

describe("MEH-2527 trust copy", () => {
  it("about: does not promise a licence check for every business", () => {
    const body = he.about.consumer.verification.body;
    expect(body).not.toContain("בודקות רישיון עסק בתוקף");
    // MEH-2636: the pinned substring was "ואם יש לעסק רישיון". The claim this
    // case exists to protect is the CONDITIONAL — not a licence check on every
    // business — and that is unchanged; only the noun moved, to
    // "מסמך רישוי או אישור פטור", which is what verification_doc_type actually
    // records (license | exemption | cosmetics). So the conditional opener is
    // pinned on its own, and the time scope is pinned beside it.
    expect(body).toContain("ואם יש לעסק");
    expect(body).toContain("במועד ההצטרפות");
    expect(en.about.consumer.verification.body).not.toContain("we check a valid business license and");
    expect(en.about.consumer.verification.body).toContain("at the time it joins");
  });

  // MEH-2636: a NEW false promise this file now pins the absence of, in the
  // same shape as its siblings. The proposed wording for this ticket would have
  // told the reader to "see the expiry date on the business page" — but
  // `license_expires_at` is admin-only and explicitly OFF the public contract
  // (models.py:353 "ProducerAdminOut only, never the public
  // ProducerDetailOut/ListOut"), so the page shows the CHECK date and no expiry
  // date at all. The badge-withdrawal sentence in /terms is allowed to exist,
  // but only in its conditional form, because verification_status.py withdraws
  // the badge ONLY when an expiry was captured (NULL means "not captured",
  // never "expired").
  it("terms: never points the reader at an expiry date the page does not show", () => {
    const badge = he.terms.sections.verified.verified_badge_body;
    expect(badge).not.toContain("ראו תאריך תוקף בעמוד העסק");
    expect(badge).not.toContain("תאריך תוקף");
    // If the withdrawal is mentioned at all, its condition must be mentioned too.
    if (badge.includes("התג יורד")) {
      expect(badge).toContain("אם נמסר לנו גם מועד הפקיעה");
      expect(badge).toContain("לא נמסר מועד פקיעה");
    }
  });

  // MEH-2636: §2 denied doing exactly what §5 and /about describe. Pin the
  // absence of the blanket denial, and pin that the three surfaces agree.
  it("terms §2 does not deny the document check that §5 and /about describe", () => {
    const outro = he.terms.sections.licensing.outro;
    expect(outro).not.toContain("אינה בודקת, מאמתת או מאשרת");
    expect(outro).toContain("במועד ההצגה בלבד");
    expect(outro).toContain("אינה מאמתת את המסמך מול הרשויות");
    expect(en.terms.sections.licensing.outro).not.toContain("does not inspect, verify, or approve");
  });

  // MEH-2636: the section-level no-supervision clause covers §5's intro and
  // declared_body too, not just the badge. Deleting it as a "duplicate" would
  // narrow the disclaimer.
  it("terms §5 keeps its section-level no-ongoing-supervision clause", () => {
    expect(he.terms.sections.verified.no_supervision).toContain("חובת פיקוח מתמשכת");
    expect(en.terms.sections.verified.no_supervision).toBeTruthy();
  });

  it("business FAQ: saving to favourites alone sends no update", () => {
    const a = he.about_business.faq.repeat_customers.a;
    expect(a).not.toContain("מקבלת עדכון אוטומטי");
    expect(a).toContain("יכולים להפעיל התראות");
  });

  it("business FAQ + showcase: no claim of a registry cross-check", () => {
    expect(he.about_business.faq.license.a).not.toContain("הצלבה מול המאגר הרשמי");
    expect(he.about_business.showcase.items.verified.desc).not.toContain("רישיון בתוקף שנבדק");
    expect(en.about_business.faq.license.a).not.toContain("cross-check");
  });

  it("dashboard FAQ: cities come only from signed-in visitors", () => {
    expect(he.about_business.faq.analytics.a).toContain("המבקרים שמחוברים לאתר");
  });

  it("grass-fed tooltip states it is the business's own declaration", () => {
    expect(BADGE_CONFIG.grass_fed.tooltip).toContain("לפי הצהרת בית העסק");
  });

  it("about explains the automatic «מובילת קהילה» badge in both locales", () => {
    expect(he.about.consumer.community_leader.heading).toBe(he.trust.tier_4.label);
    expect(he.about.consumer.community_leader.body).toContain("10 ביקורות");
    expect(he.about.consumer.community_leader.body).toContain("4.5");
    expect(en.about.consumer.community_leader.body).toContain("10 reviews");
    expect(en.about.consumer.community_leader.heading).toBe(en.trust.tier_4.label);
  });

  it("the stated 10 / 4.5 thresholds are the ones the backend computes", () => {
    // If services/trust_tier.py moves either number, the About copy is stale.
    const src = readFileSync(
      resolve(__dirname, "../../backend/app/services/trust_tier.py"),
      "utf8",
    );
    expect(src).toMatch(/reviews_count", 0\) or 0\) >= 10 and/);
    expect(src).toMatch(/\) >= 4\.5:/);
  });
});
