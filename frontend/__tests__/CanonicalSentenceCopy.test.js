/**
 * MEH-2313 — the canonical brand sentence says «מקומיים שבחרנו», not
 * «קטנים שבדקנו». Not every business on the site is small, and «בדקנו»
 * reads as a promise that the food itself was checked, which collides with
 * the «מאומת» badge (a licence check only).
 *
 * organization-jsonld.test.js already pins the constant to llms.txt and to
 * the JSON-LD, but it compares them to each other, so it passes on the old
 * wording too. This file pins the approved strings themselves (workflow
 * rule 22: approved verbatim), plus the two lines that must NOT change.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import he from "../messages/he.json";
import en from "../messages/en.json";
import { CANONICAL_SENTENCE } from "@/lib/constants";

const APPROVED_HE = "אוכל מבתי עסק מקומיים שבחרנו אישית — קרוב אלייך, בלי לחפש שעות.";
const APPROVED_EN =
  "Food from local businesses we've personally chosen — close to you, without searching for hours.";
const APPROVED_LOGIN_OG =
  "התחברו כדי לגלות בתי עסק מקומיים, לשמור מועדפים ולתמוך בעסקים מהסביבה שלך.";

describe("canonical sentence copy (MEH-2313)", () => {
  it("the constant is the approved sentence", () => {
    expect(CANONICAL_SENTENCE).toBe(APPROVED_HE);
  });

  it("llms.txt line 3 is the approved sentence", () => {
    const lines = readFileSync(join(__dirname, "../public/llms.txt"), "utf-8").split("\n");
    expect(lines[2]).toBe(APPROVED_HE);
  });

  it("the consumer hero subheading carries it in he and en", () => {
    expect(he.about.consumer.hero.subheading).toBe(APPROVED_HE);
    expect(en.about.consumer.hero.subheading).toBe(APPROVED_EN);
  });

  it("the login og:description drops «קטנים»", () => {
    expect(he.seo.login.og_description).toBe(APPROVED_LOGIN_OG);
  });

  it("the two lines that say some businesses ARE small stay as they were", () => {
    // These claim small businesses exist, not that all of them are small —
    // out of scope by the card, and a sweep must not catch them.
    expect(he.about.consumer.story.p4).toContain("יש בתי עסק קטנים עם מוצרים מדהימים");
    expect(he.about.consumer.benefits.local.body).toContain("קטנים");
  });
});
