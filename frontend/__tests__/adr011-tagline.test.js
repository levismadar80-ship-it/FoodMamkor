import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { SITE_DESCRIPTION } from "@/lib/constants";
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

  it("SITE_DESCRIPTION is the locked line", () => {
    expect(SITE_DESCRIPTION).toBe(locked);
  });

  it.each([
    ["nav.footer.brand_tagline", he.nav.footer.brand_tagline],
    ["seo.home.description", he.seo.home.description],
    ["seo.site.description", he.seo.site.description],
    ["seo.site.og_description", he.seo.site.og_description],
    ["seo.site.twitter_description", he.seo.site.twitter_description],
  ])("he.json %s is the locked line", (_key, value) => {
    expect(value).toBe(locked);
  });
});
