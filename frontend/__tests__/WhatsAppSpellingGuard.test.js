// @ts-check
// MEH-3979: in Hebrew the app is «וואטסאפ» (docs/BRAND.md, MEH-2837). This
// walks every he.json value: the short spelling «ווטסאפ» fails, and so does
// Latin «WhatsApp» unless it is part of a product name. No component renders
// a message file as a whole, so the strings are read as data (MEH-3531).
import { describe, expect, it } from "vitest";
import he from "../messages/he.json";

/** Latin «WhatsApp» is kept only inside these product names. */
const PRODUCT_NAMES = /WhatsApp (Business|Cloud API)/g;
/** Legal text kept as written in full (docs/BRAND.md, the Meta third-party item). */
const LEGAL_AS_WRITTEN = new Set(["privacy.sections.third_parties.items.meta"]);

/** @param {any} node @param {string} path @returns {Array<[string, string]>} */
function strings(node, path = "") {
  if (typeof node === "string") return [[path, node]];
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
  }
  return [];
}

const all = strings(he);

/** @param {[string, string]} entry */
const shortSpelling = ([, s]) => /ווטסאפ|וו?אצאפ/.test(s);
/** @param {[string, string]} entry */
const strayLatin = ([k, s]) => !LEGAL_AS_WRITTEN.has(k) && s.replace(PRODUCT_NAMES, "").includes("WhatsApp");

describe("WhatsApp in Hebrew copy (MEH-3979)", () => {
  it("reads a real number of strings", () => {
    expect(all.length).toBeGreaterThan(1000);
    expect(all.filter(([, s]) => s.includes("וואטסאפ")).length).toBeGreaterThan(100);
  });

  it("the matchers catch a known-bad string and pass a good one", () => {
    expect(shortSpelling(["x", "שליחה בווטסאפ"])).toBe(true);
    expect(shortSpelling(["x", "שליחה בוואצאפ"])).toBe(true);
    expect(shortSpelling(["x", "שליחה בוואטסאפ"])).toBe(false);
    expect(strayLatin(["x", "שליחה ב-WhatsApp"])).toBe(true);
    expect(strayLatin(["x", "ב-WhatsApp Business"])).toBe(false);
  });

  it("never spells it «ווטסאפ» or with a tsadi", () => {
    expect(all.filter(shortSpelling).map(([k]) => k)).toEqual([]);
  });

  it("writes Latin «WhatsApp» only inside a product name", () => {
    expect(all.filter(strayLatin).map(([k]) => k)).toEqual([]);
  });
});
