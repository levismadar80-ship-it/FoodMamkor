import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { REGIONS } from "@/data/regions";

/**
 * MEH-3334 — every region key has its `region_in` copy, in both locales.
 *
 * `data/regions.js` is the SoT for the region → cities mapping (MEH-1256), and
 * `lib/region-pages.js` derives REGION_KEYS straight off it. The category ×
 * region landing route then calls `t(`regions.${regionKey}`)` UNCONDITIONALLY
 * for the H1, the meta title, the meta description and every sibling chip
 * (app/[locale]/producers/[category]/[region]/page.js:167, :205, :248) — so a
 * region added to the data file without a copy entry is a broken page, not a
 * missing nicety.
 *
 * Nothing caught that before this test. The gap is also LATENT rather than
 * loud: the route is data-gated at REGION_PAGE_MIN (5 approved businesses), so
 * a new region 404s and is withheld from every chip until it crosses the
 * threshold — at which point the page turns itself on with no copy behind it
 * and nobody remembering to add any. MEH-3334 added «עמק חפר» and «חוף הכרמל»
 * and hit exactly this.
 *
 * DISCRIMINATION — each case fails against a plausible wrong change:
 *   - add a region to data/regions.js, no copy  → "every region key has he copy"
 *   - add the he copy but forget en             → the en case
 *   - leave a copy entry as ""                  → the non-empty filter
 *   - delete a region, leave its copy behind    → "no orphan copy key"
 *   - break the JSON read / rename the block    → the control below
 */

/** The `region_pages.regions` block of a locale file. */
function regionCopy(locale) {
  const file = path.resolve(__dirname, "..", "messages", `${locale}.json`);
  const messages = JSON.parse(readFileSync(file, "utf8"));
  const block = messages?.region_pages?.regions;
  // CONTROL, and it runs before any comparison: if the key path moves, an
  // undefined block would make "0 missing" below also mean "nothing was read".
  expect(
    block,
    `region_pages.regions missing from messages/${locale}.json — the read broke`,
  ).toBeTruthy();
  expect(
    Object.keys(block).length,
    `parsed no region copy at all from messages/${locale}.json`,
  ).toBeGreaterThan(5);
  return block;
}

/** Control for the subject side: an empty REGIONS would pass everything. */
function regionKeys() {
  const keys = REGIONS.map((r) => r.key);
  expect(keys.length, "data/regions.js exported no regions").toBeGreaterThan(5);
  return keys;
}

describe("region landing-page copy parity (MEH-3334)", () => {
  for (const locale of ["he", "en"]) {
    it(`every region key in data/regions.js has non-empty ${locale} copy`, () => {
      const copy = regionCopy(locale);
      const missing = regionKeys().filter(
        (key) => typeof copy[key] !== "string" || copy[key].trim() === "",
      );
      expect(
        missing,
        `add region_pages.regions.<key> to messages/${locale}.json for: ${missing.join(", ")}`,
      ).toEqual([]);
    });

    it(`no orphan copy key in ${locale} — every entry names a live region`, () => {
      const keys = new Set(regionKeys());
      const orphans = Object.keys(regionCopy(locale))
        .filter((key) => !keys.has(key))
        .sort();
      expect(
        orphans,
        `these have copy but no region in data/regions.js: ${orphans.join(", ")}`,
      ).toEqual([]);
    });
  }

  it("he and en cover exactly the same keys", () => {
    const he = Object.keys(regionCopy("he")).sort();
    const en = Object.keys(regionCopy("en")).sort();
    expect(en).toEqual(he);
  });
});
