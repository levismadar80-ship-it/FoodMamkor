import { describe, it, expect } from "vitest";
import en from "../messages/en.json";

// MEH-840 — guard against untranslated Hebrew leaking into the English locale.
// Two recent PRs (MEH-203, MEH-132) seeded en.json keys verbatim from he.json;
// only the manual calibration review caught them. This runs inside the existing
// (required) "Frontend unit tests (vitest)" CI job, so any NEW Hebrew value in
// en.json fails CI — no new workflow needed, and no path-filter "Expected
// forever" trap. The BASELINE allowlists the pre-existing leaks (captured
// 2026-06-16) so CI is green today; the MEH-840 sweep translates them to English
// and removes each from BASELINE (the second test forces that hygiene).

const HEBREW = /[֐-׿]/; // U+0590–U+05FF
// i18n-ok — the brand name is the test subject (stripped before scanning),
// not display copy; it legitimately appears inline in otherwise-English strings.
const BRAND = "מהמקור";

const BASELINE = new Set([
  "nav.add_business_short",
  "home.hero.cta_primary",
  "home.hero.how_it_works",
  "home.featured.eyebrow",
  "home.featured.heading",
  "home.featured.cta_meet",
  "home.featured.cta_write",
  "home.comparison_teaser.eyebrow",
  "home.comparison_teaser.heading",
  "home.comparison_teaser.cta",
  "home.categories.eyebrow",
  "producer.card.favorites.aria",
  "about.comparison.eyebrow",
  "about.comparison.heading",
  "about.comparison.row1_brand",
  "about.comparison.row1_super",
  "about.comparison.row2_brand",
  "about.comparison.row2_super",
  "about.comparison.row3_brand",
  "about.comparison.row3_super",
]);

function hebrewKeys(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") out.push(...hebrewKeys(v, key));
    else if (typeof v === "string" && HEBREW.test(v.split(BRAND).join(""))) out.push(key);
  }
  return out;
}

describe("en-locale guard (MEH-840)", () => {
  const offenders = hebrewKeys(en);

  it("has no NEW untranslated Hebrew in en.json (outside the known baseline)", () => {
    const newLeaks = offenders.filter((k) => !BASELINE.has(k));
    expect(newLeaks).toEqual([]);
  });

  it("baseline stays honest — every baselined key is still Hebrew (else remove it)", () => {
    const stale = [...BASELINE].filter((k) => !offenders.includes(k));
    expect(stale).toEqual([]);
  });
});
