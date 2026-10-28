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
    expect(body).toContain("ואם יש לעסק רישיון");
    expect(en.about.consumer.verification.body).not.toContain("we check a valid business license and");
  });

  it("business FAQ: saving to favourites alone sends no update", () => {
    const a = he.about_business.faq.repeat_customers.a;
    expect(a).not.toContain("מקבלת עדכון אוטומטי");
    expect(a).toContain("יכולות להפעיל התראות");
  });

  it("business FAQ + showcase: no claim of a registry cross-check", () => {
    expect(he.about_business.faq.license.a).not.toContain("הצלבה מול המאגר הרשמי");
    expect(he.about_business.showcase.items.verified.desc).not.toContain("רישיון בתוקף שנבדק");
    expect(en.about_business.faq.license.a).not.toContain("cross-check");
  });

  it("dashboard FAQ: cities come only from signed-in visitors", () => {
    expect(he.about_business.faq.analytics.a).toContain("המבקרות שמחוברות לאתר");
  });

  it("grass-fed tooltip states it is the business's own declaration", () => {
    expect(BADGE_CONFIG.grass_fed.tooltip).toContain("לפי הצהרת בית העסק");
  });

  it("about explains the automatic «מובילת קהילה» badge in both locales", () => {
    expect(he.about.consumer.community_leader.heading).toBe(he.trust.tier_4.label);
    expect(he.about.consumer.community_leader.body).toContain("10 ביקורות");
    expect(he.about.consumer.community_leader.body).toContain("4.5");
    expect(en.about.consumer.community_leader.body).toContain("10 reviews");
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
