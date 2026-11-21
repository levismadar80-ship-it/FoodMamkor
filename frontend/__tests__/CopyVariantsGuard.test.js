// MEH-3462: one way to write the same Hebrew string. he.json had «בטעינה...»
// 13 times and «בטעינה…» once, «נשמר» 12 times and «נשמר.» once, «ט"ו בשבט»
// beside «ט״ו בשבט». Each copy was right on its own; together the site read
// as written by several hands. Rules (Sapir 19/11): the single «…» character,
// no trailing «.» / «!» on a string that elsewhere has none, gershayim «״».
import { describe, it, expect } from "vitest";
import he from "../messages/he.json";
import en from "../messages/en.json";

const flat = (o, p = "") =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" ? flat(v, p ? `${p}.${k}` : k) : [[p ? `${p}.${k}` : k, v]],
  );

// Two spellings that differ only in this punctuation are the same string.
export const normalize = (s) =>
  s
    .replace(/\.\.\./g, "…")
    // An acronym mark between two Hebrew letters — ASCII ", curly quotes, or a
    // geresh where gershayim belongs (ט׳ו) — all read as the one gershayim.
    .replace(/(?<=[א-ת])["“”׳](?=[א-ת])/g, "״")
    .replace(/[.!]+(\s*✓)?$/, "$1");

// Same words, different jobs: a field's placeholder vs its error, a page
// subtitle vs an SEO description (full sentences end in «.» there).
const DIFFERENT_ROLES = [
  ["registration.signup.session_placeholder", "registration.signup.session_required"],
  ["events.list.subtitle_experiences", "seo.experiences.og_description"],
];

const entries = flat(he).filter(([, v]) => typeof v === "string");
const enEntries = flat(en).filter(([, v]) => typeof v === "string");

// MEH-3627: an acronym's gershayim sits before its last letter (ק״ג, מע״מ,
// ארה״ב). A quote followed by a whole word is a real quotation (ה"בעלים",
// ו"מאחורי העסק") and stays.
const ASCII_ACRONYM = /(?<=[א-ת])["“”](?=[א-ת](?![א-ת]))/;
const isUrl = (v) => /^https?:/.test(v);

function variantGroups(rows) {
  const groups = new Map();
  for (const [key, value] of rows) {
    const n = normalize(value);
    if (!groups.has(n)) groups.set(n, new Map());
    const spellings = groups.get(n);
    spellings.set(value, [...(spellings.get(value) ?? []), key]);
  }
  const allowed = new Set(DIFFERENT_ROLES.map((pair) => [...pair].sort().join("|")));
  return [...groups.values()]
    .filter((spellings) => spellings.size > 1)
    .filter((spellings) => !allowed.has([...spellings.values()].flat().sort().join("|")));
}

describe("MEH-3462: one spelling per Hebrew string", () => {
  it("control: the check groups the shapes it was written for", () => {
    const rows = [
      ["a", "בטעינה..."], ["b", "בטעינה…"],
      ["c", "נשמר"], ["d", "נשמר."],
      ["e", "הועתק ✓"], ["f", "הועתק! ✓"],
      ["g", 'ט"ו בשבט'], ["h", "ט״ו בשבט"], ["g2", "ט׳ו בשבט"],
      ["i", "בבדיקה"], ["j", "בבדיקה…"], // a status and a loading line: different words
    ];
    expect(variantGroups(rows)).toHaveLength(4);
    expect(normalize("ט׳ו בשבט")).toBe(normalize('ט"ו בשבט')); // geresh-for-gershayim merges
    expect(variantGroups(entries.slice(0, 0))).toEqual([]);
    expect(entries.length).toBeGreaterThan(1000); // the file really loaded
  });

  it("no he.json value uses three dots for an ellipsis", () => {
    const dots = entries.filter(([, v]) => v.includes("...") && !/^https?:/.test(v)).map(([k]) => k);
    expect(dots, "use the single «…» character").toEqual([]);
  });

  it("no string is spelled two ways", () => {
    const report = variantGroups(entries).map((s) => Object.fromEntries(s));
    expect(report, "pick one spelling; a different job goes in DIFFERENT_ROLES").toEqual([]);
  });

  it("every DIFFERENT_ROLES key still exists", () => {
    const keys = new Set(entries.map(([k]) => k));
    expect(DIFFERENT_ROLES.flat().filter((k) => !keys.has(k))).toEqual([]);
  });

  it("MEH-3465 control: the acronym check tells an acronym from a quotation", () => {
    expect(ASCII_ACRONYM.test('ק"ג')).toBe(true);
    expect(ASCII_ACRONYM.test('כולל מע"מ, אם')).toBe(true);
    expect(ASCII_ACRONYM.test('ה"בעלים בעבודה"')).toBe(false);
    expect(ASCII_ACRONYM.test("ק״ג")).toBe(false);
    expect(enEntries.length).toBeGreaterThan(1000); // en.json really loaded
  });

  it("MEH-3465: no he.json acronym uses an ASCII quote for gershayim", () => {
    const bad = entries.filter(([, v]) => ASCII_ACRONYM.test(v)).map(([k]) => k);
    expect(bad, "write ״ (gershayim), as in ק״ג").toEqual([]);
  });

  it("MEH-3465: no en.json value uses three dots for an ellipsis", () => {
    const dots = enEntries.filter(([, v]) => v.includes("...") && !isUrl(v)).map(([k]) => k);
    expect(dots, "use the single «…» character, as he.json does").toEqual([]);
  });
});
