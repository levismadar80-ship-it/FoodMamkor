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

// BASELINE — pre-existing leaks that were temporarily allowlisted. MEH-840
// Part B swept all 20 to English, so the baseline is now empty: any Hebrew in
// en.json (the brand name aside) fails the guard outright.
const BASELINE = new Set([]);

// MEH-3076 (Sapir 21/11, approved copy): search only understands Hebrew, so the
// /en hero search shows Hebrew EXAMPLES behind an English lead-in. These keys
// carry Hebrew on purpose. Not a baseline: each value must keep the English
// lead-in (checked below), so the set cannot hide an untranslated string.
const HEBREW_EXAMPLE_KEYS = new Set([
  "home.search.placeholders.q1",
  "home.search.placeholders.q2",
  "home.search.placeholders.q3",
  "home.search.placeholders.q4",
]);
const EXAMPLE_LEAD_IN = /^Try in Hebrew: [֐-׿]/;

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
    const newLeaks = offenders.filter((k) => !BASELINE.has(k) && !HEBREW_EXAMPLE_KEYS.has(k));
    expect(newLeaks).toEqual([]);
  });

  it("a Hebrew-example key keeps its English lead-in, and is still Hebrew (MEH-3076)", () => {
    for (const key of HEBREW_EXAMPLE_KEYS) {
      const value = key.split(".").reduce((o, k) => o?.[k], en);
      expect(value, key).toMatch(EXAMPLE_LEAD_IN);
      expect(offenders, key).toContain(key);
    }
  });

  it("baseline stays honest — every baselined key is still Hebrew (else remove it)", () => {
    const stale = [...BASELINE].filter((k) => !offenders.includes(k));
    expect(stale).toEqual([]);
  });
});
