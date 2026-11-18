import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import he from "../messages/he.json";
import en from "../messages/en.json";

/**
 * MEH-3299 (MEH-2208, Sapir chose option א on 15/11): the leads list holds
 * contact details of businesses that have not joined. The privacy policy must
 * say so — where the details come from, what they are used for, and that a
 * deletion request is honoured. Each claim is asserted separately so a copy
 * edit that drops one goes red naming it.
 */
const PAGE_SRC = readFileSync(
  path.resolve(__dirname, "../app/[locale]/privacy/page.js"),
  "utf8",
);

const CLAIMS = {
  he: { source: "מקורות ציבוריים", purpose: "לפנות לבית העסק", erase: "שנמחק את הפרטים" },
  en: { source: "public sources", purpose: "reach out to the business", erase: "delete these details" },
};

describe("privacy policy covers the outreach leads list (MEH-3299)", () => {
  it("the page renders the `outreach` data item", () => {
    const m = PAGE_SRC.match(/const DATA_ITEMS = \[([^\]]*)\]/);
    expect(m, "DATA_ITEMS not found").toBeTruthy();
    expect(m[1]).toContain('"outreach"');
  });

  for (const [locale, msgs] of [["he", he], ["en", en]]) {
    const item = msgs.privacy.sections.data.items.outreach;
    for (const [claim, text] of Object.entries(CLAIMS[locale])) {
      it(`${locale}: states the ${claim}`, () => {
        expect(item?.label, "label missing").toBeTruthy();
        expect(item?.value ?? "").toContain(text);
      });
    }
  }
});
