import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// MEH-2592 (30/10/2026) — one word for reviews across the site. «ביקורות» is
// the site's word (59 strings in he.json: heading, form, admin, emails);
// «חוות דעת» had survived in three strings — the summary count and the
// «show more» button on the business page, and one line on /about/for-businesses
// — so the same section read «ביקורות» in its heading and «חוות דעת» in its
// count. Sapir delegated the call; Google / Wolt / Booking (he) all say
// «ביקורות». This guard keeps a fourth string from bringing it back.
const here = path.dirname(fileURLToPath(import.meta.url));
const he = JSON.parse(
  readFileSync(path.join(here, "..", "messages", "he.json"), "utf8"),
);

function* walk(node, key = "") {
  if (typeof node === "string") yield [key, node];
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node)) yield* walk(v, key ? `${key}.${k}` : k);
}

describe("he.json — reviews are «ביקורות», never «חוות דעת»", () => {
  it("no string says «חוות דעת»", () => {
    const hits = [...walk(he)].filter(([, v]) => /חוות[\s-]?דעת/.test(v)).map(([k]) => k);
    expect(hits).toEqual([]);
  });

  it("the business-page review count and show-more say «ביקורות»", () => {
    expect(he.reviews.summary_count).toContain("ביקורות");
    expect(he.reviews.summary_count).toContain("ביקורת אחת");
    expect(he.reviews.show_more).toBe("הצגת עוד ביקורות");
  });
});

// MEH-2999 (12/11/2026) — writing a review never required WhatsApp: the
// server has accepted contact through ANY channel since MEH-2204, yet three
// review strings kept saying «וואטסאפ» (the guest line, the signed-in gate
// line, the owner's empty state). The review texts may not name a channel.
describe("reviews.* — the write-a-review texts name no contact channel (MEH-2999)", () => {
  const en = JSON.parse(readFileSync(path.join(here, "..", "messages", "en.json"), "utf8"));
  for (const [lang, msgs, re] of [
    ["he", he, /וואטסאפ|ווצאפ|whatsapp/i],
    ["en", en, /whatsapp/i],
  ]) {
    it(`${lang}: no string under «reviews» mentions WhatsApp`, () => {
      const hits = [...walk(msgs.reviews, "reviews")].filter(([, v]) => re.test(v)).map(([k]) => k);
      expect(hits).toEqual([]);
    });
  }

  it("the invite card's two strings exist in both languages", () => {
    expect(he.reviews.invite_title).toBeTruthy();
    expect(he.reviews.invite_hint).toBeTruthy();
    expect(en.reviews.invite_title).toBeTruthy();
    expect(en.reviews.invite_hint).toBeTruthy();
  });
});
