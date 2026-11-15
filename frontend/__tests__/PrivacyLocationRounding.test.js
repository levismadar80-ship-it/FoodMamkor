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

describe("privacy page — location is rounded, OpenStreetMap is listed", () => {
  it.each([
    ["he", he, "מעוגל לכקילומטר", "OpenStreetMap", "Google Places"],
    ["en", en, "rounded to about one kilometre", "OpenStreetMap", "Google Places"],
  ])("%s", (_l, m, rounding, osm, places) => {
    const s = m.privacy.sections;
    expect(s.data.items.location.value).toContain(rounding);
    expect(s.third_parties.items.osm).toContain(osm);
    expect(s.third_parties.items.google).toContain(places);
  });

  it("the page renders the OpenStreetMap item", () => {
    expect(page).toMatch(/THIRD_PARTY_ITEMS = \[[^\]]*"osm"/);
  });
});
