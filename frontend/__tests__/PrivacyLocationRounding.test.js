// MEH-3219 (B17) — the privacy page says what the code now does with location.
// The three strings are the approved ones (decisions doc 14/11, strings 6, 7,
// 18); this pins them so a later copy edit can't quietly drop the rounding
// promise or the OpenStreetMap disclosure while the code still relies on it.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import he from "@/messages/he.json";
import en from "@/messages/en.json";

const page = readFileSync(
  path.resolve(__dirname, "../app/[locale]/privacy/page.js"),
  "utf8",
);

// Verbatim from the decisions doc (strings 6, 7, 18; `**x**` there = `<b>x</b>`
// here). An exact pin, not a substring: any edit to approved copy goes red.
const APPROVED = {
  he: { location: "מיקום מקורב (רק אם אישרת זאת בדפדפן), לצורך הצגת בתי עסק קרובים. המיקום מעוגל לכקילומטר לפני שהוא נשמר במכשיר שלך או נשלח לשרת. במפה עצמה, האזור שמוצג נטען ישירות מספק המפות.",
    osm: "<b>OpenStreetMap</b> — מפות האתר, וחיפוש כתובות כשאין ספק אחר. כשמפה נטענת, הדפדפן פונה לשרתי OpenStreetMap והם רואים איזה אזור מוצג. כשמאשרים מיקום, נשלח אליהם מיקום מעוגל כדי למצוא את שם היישוב.",
    google: "<b>Google</b> — Google OAuth להתחברות, Google Fonts, וחיפוש כתובות (Google Places) בטפסים." },
  en: { location: "Approximate location (only if you allowed it in your browser), used to show nearby businesses. It is rounded to about one kilometre before it is saved on your device or sent to our server. On the map itself, the area shown is loaded directly from the map provider.",
    osm: "<b>OpenStreetMap</b> — the site's maps, and address search when no other provider is available. When a map loads, your browser contacts OpenStreetMap's servers and they see which area is shown. When you allow location, a rounded location is sent to them to find the name of your town.",
    google: "<b>Google</b> — Google OAuth for sign-in, Google Fonts, and address search (Google Places) in forms." },
};

describe("privacy page — location is rounded, OpenStreetMap is listed", () => {
  it.each([
    ["he", he],
    ["en", en],
  ])("%s strings equal the approved text", (l, m) => {
    const s = m.privacy.sections;
    expect(s.data.items.location.value).toBe(APPROVED[l].location);
    expect(s.third_parties.items.osm).toBe(APPROVED[l].osm);
    expect(s.third_parties.items.google).toBe(APPROVED[l].google);
  });

  it("the page renders the OpenStreetMap item", () => {
    expect(page).toMatch(/THIRD_PARTY_ITEMS = \[[^\]]*"osm"/);
  });
});
