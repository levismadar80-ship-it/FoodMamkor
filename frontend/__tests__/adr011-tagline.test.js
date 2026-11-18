import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { SITE_DESCRIPTION, CANONICAL_SENTENCE } from "@/lib/constants";
import he from "../messages/he.json";

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

  // MEH-3424 / ADR-043: every surface that describes the site in one line —
  // the meta description, og/twitter description — carries SITE_DESCRIPTION,
  // the descriptor Sapir approved word for word on 18/11/2026. Before it, the
  // og/twitter keys showed the tagline (clause 1 speaks to business owners)
  // and the meta description showed the canonical sentence (ADR-041), so a
  // shared link and a search result said two different things.
  it("SITE_DESCRIPTION is the approved descriptor, not the tagline or the brand sentence", () => {
    expect(SITE_DESCRIPTION).toBe("במהמקור מוצאים אוכל מבתי עסק מקומיים קרוב לבית, במקום אחד.");
    expect(SITE_DESCRIPTION).not.toBe(locked);
    expect(SITE_DESCRIPTION).not.toBe(CANONICAL_SENTENCE);
  });

  it.each([
    ["seo.home.description", he.seo.home.description],
    ["seo.site.description", he.seo.site.description],
    ["seo.site.og_description", he.seo.site.og_description],
    ["seo.site.twitter_description", he.seo.site.twitter_description],
  ])("he.json %s is SITE_DESCRIPTION (ADR-043)", (_key, value) => {
    expect(value).toBe(SITE_DESCRIPTION);
  });
});
