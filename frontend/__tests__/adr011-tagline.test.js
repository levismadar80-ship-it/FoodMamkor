import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { SITE_DESCRIPTION, CANONICAL_SENTENCE } from "@/lib/constants";
import he from "../messages/he.json";
import en from "../messages/en.json";

/**
 * MEH-2364 — the ADR-011 tagline is one sentence rendered from four places:
 * SITE_DESCRIPTION (constants.js) and four he.json keys. Nothing tied them to
 * each other or to the ADR, so the next copy edit could move one and leave the
 * rest. The expected value is read from the ADR file itself, never retyped
 * here, so a test copy cannot drift together with the code.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const adr = readFileSync(
  path.join(here, "../../docs/decisions/ADR-011-tagline-locked.md"),
  "utf8",
);
const locked = adr.match(/^> \*\*(.+)\*\*$/m)?.[1];

describe("ADR-011 tagline", () => {
  it("the locked line is found in the ADR", () => {
    expect(locked).toBe("מהמקור — הבית הראשון של העסק שלך. המקום שבו הסיפור מתחיל.");
  });

  it("the footer still shows the locked line — its one remaining surface", () => {
    expect(he.nav.footer.brand_tagline).toBe(locked);
  });

  // MEH-3424 / ADR-043: each sentence has one job. The meta description (read
  // by search engines and AI) carries SITE_DESCRIPTION, the descriptor Sapir
  // approved word for word on 18/11/2026. A shared link (og/twitter) is read
  // by a person a friend sent it to, and carries the brand sentence. Before
  // this the og/twitter keys showed the tagline, whose clause 1 speaks to
  // business owners.
  it("SITE_DESCRIPTION is the approved descriptor, not the tagline or the brand sentence", () => {
    expect(SITE_DESCRIPTION).toBe("במהמקור מוצאים אוכל מבתי עסק מקומיים קרוב לבית, במקום אחד.");
    expect(SITE_DESCRIPTION).not.toBe(locked);
    expect(SITE_DESCRIPTION).not.toBe(CANONICAL_SENTENCE);
  });

  it.each([
    ["seo.home.description", he.seo.home.description],
    ["seo.site.description", he.seo.site.description],
  ])("he.json %s is SITE_DESCRIPTION (ADR-043)", (_key, value) => {
    expect(value).toBe(SITE_DESCRIPTION);
  });

  it.each([
    ["seo.site.og_description", he.seo.site.og_description],
    ["seo.site.twitter_description", he.seo.site.twitter_description],
  ])("he.json %s is the brand sentence, not the tagline (ADR-043)", (_key, value) => {
    expect(value).toBe(CANONICAL_SENTENCE);
    expect(value).not.toBe(locked);
  });
});

// ADR-043 amendment (18/11): the English locale follows the same three roles.
describe("ADR-043 English roles", () => {
  const EN_DESCRIPTOR = "Mehamakor is where you find food from local businesses near you, all in one place.";
  it("en meta descriptions carry the English descriptor", () => {
    expect(en.seo.site.description).toBe(EN_DESCRIPTOR);
    expect(en.seo.home.description).toBe(EN_DESCRIPTOR);
  });
  const EN_BRAND = "Food from local businesses we've personally chosen — close to you, without searching for hours.";
  it("en share card carries the English brand sentence, not the old line", () => {
    expect(en.seo.site.og_description).toBe(EN_BRAND);
    expect(en.seo.site.twitter_description).toBe(EN_BRAND);
    expect(en.about.consumer.hero.subheading).toBe(EN_BRAND);
  });
});
