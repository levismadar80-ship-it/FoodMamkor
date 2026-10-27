import { describe, it, expect } from "vitest";
import he from "@/messages/he.json";
import en from "@/messages/en.json";

// MEH-2394: HomeComparisonTeaser reads /about's `about.comparison.row{1..3}_*`
// strings so the home teaser and /about share one copy home. That is a
// cross-namespace dependency: renaming a row key on /about would leave the
// home teaser rendering a raw key. This pins the three rows in both locales.
// DISCRIMINATION: delete `row2_super` from he.json → the second assertion
// names the missing key.
const ROW_KEYS = ["row1", "row2", "row3"].flatMap((r) => [`${r}_brand`, `${r}_super`]);

describe("home comparison teaser ↔ about.comparison keys (MEH-2394)", () => {
  it.each([["he", he], ["en", en]])("%s carries every row the teaser renders", (_locale, messages) => {
    const comparison = messages.about?.comparison ?? {};
    const missing = ROW_KEYS.filter((k) => typeof comparison[k] !== "string" || !comparison[k].trim());
    expect(missing).toEqual([]);
  });
});
