// MEH-3254 (grill retro B14 + D7) — real messages, not echoed keys.
// A business never receives a participant list (MEH-1651), so no copy may
// promise that the business contacts the group. And the owner's units line
// must read right in the singular and the plural.
import { describe, expect, it } from "vitest";
import { IntlMessageFormat } from "intl-messageformat";
import he from "@/messages/he.json";
import en from "@/messages/en.json";

const COPY = [
  ["he", he.group_buys.list.status_hint_funded],
  ["he", he.group_buys.detail.how_unlock],
  ["en", en.group_buys.list.status_hint_funded],
  ["en", en.group_buys.detail.how_unlock],
];
// The old promises: «ובית העסק יוצר קשר», "the business is in touch / gets in touch".
const BUSINESS_CONTACTS = /בית העסק יוצר קשר|business (is in touch|gets in touch)/;

describe("group-buy copy (MEH-3254)", () => {
  it("control: the pattern catches the old strings", () => {
    expect(BUSINESS_CONTACTS.test("ההצטרפות נסגרה ובית העסק יוצר קשר עם הקבוצה.")).toBe(true);
    expect(BUSINESS_CONTACTS.test("the group price unlocks and the business gets in touch")).toBe(true);
  });

  it.each(COPY)("%s copy does not promise the business contacts participants", (_locale, text) => {
    expect(text).toBeTruthy();
    expect(text).not.toMatch(BUSINESS_CONTACTS);
  });

  const fmt = (locale, key, values) =>
    new IntlMessageFormat((locale === "he" ? he : en).group_buys.dashboard[key], locale).format(values);

  it("units line, he: singular and plural", () => {
    expect(fmt("he", "units_ordered", { count: 1 })).toBe("סה״כ הוזמנה: יחידה אחת");
    expect(fmt("he", "units_ordered", { count: 14 })).toBe("סה״כ הוזמנו: 14 יחידות");
    expect(fmt("he", "units_requested_with_unit", { count: 3, unit: "מארז" })).toBe("כמות מבוקשת עד כה: 3 (יחידה: מארז)");
  });

  it("units keys exist in both locales", () => {
    for (const key of ["units_ordered", "units_ordered_with_unit", "units_requested", "units_requested_with_unit"]) {
      expect(he.group_buys.dashboard[key], key).toBeTruthy();
      expect(en.group_buys.dashboard[key], key).toBeTruthy();
    }
  });
});
