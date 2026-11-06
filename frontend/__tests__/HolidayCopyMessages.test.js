/**
 * MEH-2741 (MEH-1687 phase 7c) — holiday words come from messages, per locale.
 * lib/holidays.js holds dates, icon, colour and the Hebrew search term only.
 */
import { describe, it, expect } from "vitest";
import he from "../messages/he.json";
import en from "../messages/en.json";
import { HOLIDAYS } from "@/lib/holidays";

const HEBREW = /[֐-׿]/;
const KEYS = Object.keys(HOLIDAYS);
const FIELDS = ["name", "tagline", "cta", "dashboard_hint"];

describe("holiday copy lives in messages (MEH-2741)", () => {
  it("the registry holds no words of its own", () => {
    for (const k of KEYS) {
      for (const f of ["name", "tagline", "cta", "dashboardHint", "featured"]) {
        expect(HOLIDAYS[k][f], `${k}.${f}`).toBeUndefined();
      }
    }
  });

  it.each([
    ["he", he],
    ["en", en],
  ])("%s has every field for every holiday, and nothing extra", (_loc, msgs) => {
    expect(Object.keys(msgs.holidays).sort()).toEqual([...KEYS].sort());
    for (const k of KEYS) for (const f of FIELDS) expect(msgs.holidays[k][f], `${k}.${f}`).toBeTruthy();
  });

  it("no English holiday string contains Hebrew", () => {
    for (const k of KEYS) for (const f of FIELDS) expect(en.holidays[k][f], `${k}.${f}`).not.toMatch(HEBREW);
  });

  // The two taglines with a verb use the plural form; no reader string in the
  // set uses a feminine-singular imperative (the forms this copy used before).
  it("reader-facing holiday copy is gender-neutral (ADR-037)", () => {
    expect(he.holidays.pesach.tagline).toContain("מצאו");
    expect(he.holidays.chanuka.tagline).toContain("הדליקו");
    const FEMININE = /(^|\s)(מצאי|הדליקי|גלי|קני|הזמיני|בחרי|חפשי|עדכני)(\s|$)/;
    for (const k of KEYS) {
      for (const f of ["name", "tagline", "cta"]) {
        expect(he.holidays[k][f], `${k}.${f}`).not.toMatch(FEMININE);
      }
    }
  });
});
