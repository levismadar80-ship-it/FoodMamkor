/**
 * MEH-1508 (Sapir 09/11, approved verbatim in the card): the two VEGAN
 * badges' tooltips end with the allergy sentence; the vegetarian ones do not
 * (a vegetarian business does sell milk and eggs). Labels unchanged
 * (MEH-2677: «טבעוני» / «צמחוני»). The sentence mirrors the gluten line
 * (producer.detail.header.gluten_facility.shared): «… כדאי לוודא ישירות מול
 * בית העסק.»
 */
import { describe, it, expect } from "vitest";
import he from "../messages/he.json";
import en from "../messages/en.json";

const HE_ALLERGY = "אם יש אלרגיה לחלב או לביצים, כדאי לוודא ישירות מול בית העסק.";
const EN_ALLERGY = "If you have a milk or egg allergy, please check directly with the business.";

describe("vegan badges carry the milk/egg allergy sentence (MEH-1508)", () => {
  it("he: exact approved strings", () => {
    expect(he.badges.vegan.tooltip).toBe(`לעסק יש מוצרים טבעוניים מסומנים בקטלוג. ${HE_ALLERGY}`);
    expect(he.badges.vegan_all.tooltip).toBe(`לפי הצהרת בית העסק. ${HE_ALLERGY}`);
  });

  it("en: the same change on both keys", () => {
    expect(en.badges.vegan.tooltip).toBe(`The business has products marked vegan in its catalog. ${EN_ALLERGY}`);
    expect(en.badges.vegan_all.tooltip).toBe(`As declared by the business. ${EN_ALLERGY}`);
  });

  it("labels are unchanged (MEH-2677)", () => {
    expect([he.badges.vegan.label, he.badges.vegan_all.label]).toEqual(["מתאים לטבעונים", "טבעוני"]);
    expect([en.badges.vegan.label, en.badges.vegan_all.label]).toEqual(["Vegan options", "Vegan"]);
  });

  it("the vegetarian badges do NOT get the sentence (milk and eggs are vegetarian)", () => {
    for (const msgs of [he, en]) {
      for (const key of ["vegetarian", "vegetarian_all"]) {
        expect(msgs.badges[key].tooltip).not.toMatch(/אלרגיה|allergy/);
      }
    }
    expect(he.badges.vegetarian.tooltip).toBe("לעסק יש מוצרים צמחוניים מסומנים בקטלוג.");
    expect(he.badges.vegetarian_all.tooltip).toBe("לפי הצהרת בית העסק");
  });

  it("the filter chip's ⓘ subtext (its aria-label) is untouched", () => {
    const subtexts = JSON.stringify(he).match(/"subtext":"[^"]*"/g) ?? [];
    expect(subtexts.length, "control: subtexts exist").toBeGreaterThan(0);
    for (const s of subtexts) expect(s).not.toMatch(/אלרגיה/);
  });
});
