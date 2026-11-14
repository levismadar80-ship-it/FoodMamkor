// MEH-3166 — one home for everything the site says about price.
//
// Before this guard «חינם, בלי עמלות» was hand-written in 19 strings, so a
// change of model meant searching the whole site. The contract it holds:
//   1. A message that uses pricing vocabulary lives under `pricing.*`, or is
//      named in PRICING_COPY_KEYS (lib/pricing.js), or is in OTHER_MEANING
//      below with the reason the word means something else there.
//   2. No digit is written into a pricing message — numbers arrive as ICU
//      values from lib/pricing.js, and every placeholder is one it supplies.
//   3. he and en carry the same pricing keys.
//   4. The numbers in lib/pricing.js equal docs/PRICING.md.
//
// DO NOT widen OTHER_MEANING to get a new price sentence past this test —
// move the sentence under `pricing.*` or list its key in PRICING_COPY_KEYS.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import he from "../messages/he.json";
import en from "../messages/en.json";
import { PRICING_COPY_KEYS, currentPriceList, pricingCopyValues } from "../lib/pricing";

const VOCAB = {
  he: /עמלה|עמלות|עמלת|דמי מנוי|מנוי|לתמיד|חינם תמיד|תמיד חינם/,
  en: /commission|subscription|transaction fee|no fees|free forever|forever free|always free/i,
};

// Keys where the word is not about what a business pays. Each needs a reason.
const OTHER_MEANING = {
  "admin.help.topics.approved_actions.steps.3": "«מוחק לתמיד» — about deleting a business, not about price",
};

/** @returns {Record<string, string>} every string message, by dotted key */
function flatten(node, prefix = "", out = {}) {
  for (const [key, value] of Object.entries(node)) {
    const dotted = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out[dotted] = value;
    else if (value && typeof value === "object") flatten(value, dotted, out);
  }
  return out;
}

const MESSAGES = { he: flatten(he), en: flatten(en) };
const isPricingKey = (key) => key.startsWith("pricing.") || PRICING_COPY_KEYS.includes(key);
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

/** The check itself, as a function, so the self-test can feed it known input. */
function strayPricingKeys(messages, vocab) {
  return Object.entries(messages)
    .filter(([key, text]) => vocab.test(text) && !isPricingKey(key) && !(key in OTHER_MEANING))
    .map(([key]) => key);
}

describe("PricingCopyGuard (MEH-3166)", () => {
  it("self-test: the scanner flags a stray price sentence and passes an allowed one", () => {
    expect(strayPricingKeys({ "home.hero.sub": "חינם, בלי עמלות" }, VOCAB.he)).toEqual(["home.hero.sub"]);
    expect(strayPricingKeys({ "home.hero.sub": "Free, no commission" }, VOCAB.en)).toEqual(["home.hero.sub"]);
    expect(strayPricingKeys({ "pricing.page.x": "בלי עמלות" }, VOCAB.he)).toEqual([]);
    // Anchored to the real file: the real cost answer is found by the vocabulary,
    // so an empty result below cannot mean "the regex matches nothing".
    expect(VOCAB.he.test(MESSAGES.he["join.faq.a_cost"])).toBe(true);
    expect(VOCAB.en.test(MESSAGES.en["join.faq.a_cost"])).toBe(true);
  });

  it.each(["he", "en"])("%s: pricing vocabulary appears only in pricing keys", (locale) => {
    expect(Object.keys(MESSAGES[locale]).length).toBeGreaterThan(1000);
    expect(strayPricingKeys(MESSAGES[locale], VOCAB[locale])).toEqual([]);
  });

  it("every OTHER_MEANING entry still exists and still needs the exemption", () => {
    for (const [key, reason] of Object.entries(OTHER_MEANING)) {
      expect(reason.length, `${key} needs a reason`).toBeGreaterThan(10);
      const hit = VOCAB.he.test(MESSAGES.he[key] ?? "") || VOCAB.en.test(MESSAGES.en[key] ?? "");
      expect(hit, `${key} no longer uses pricing vocabulary — remove it from OTHER_MEANING`).toBe(true);
    }
  });

  it.each(["he", "en"])("%s: no number is hand-written into a pricing message", (locale) => {
    const allowed = Object.keys(pricingCopyValues());
    const keys = Object.keys(MESSAGES[locale]).filter(isPricingKey);
    expect(keys.length).toBeGreaterThan(PRICING_COPY_KEYS.length);
    for (const key of keys) {
      const text = MESSAGES[locale][key];
      expect(text.replace(/\{\w+\}/g, ""), `${locale} ${key} carries a digit`).not.toMatch(/\d/);
      for (const name of placeholders(text)) {
        expect(allowed, `${locale} ${key} uses {${name}}`).toContain(name);
      }
    }
  });

  it("he and en carry the same pricing keys, and every listed key exists", () => {
    const pricingKeys = (locale) => Object.keys(MESSAGES[locale]).filter(isPricingKey).sort();
    expect(pricingKeys("en")).toEqual(pricingKeys("he"));
    for (const key of PRICING_COPY_KEYS) {
      expect(MESSAGES.he[key], `he ${key}`).toBeTypeOf("string");
      expect(MESSAGES.en[key], `en ${key}`).toBeTypeOf("string");
    }
  });

  it("the numbers equal docs/PRICING.md", () => {
    const doc = fs.readFileSync(path.resolve(__dirname, "../../docs/PRICING.md"), "utf8");
    const pick = (re, label) => {
      const m = doc.match(re);
      expect(m, `docs/PRICING.md: ${label} not found`).not.toBeNull();
      return Number(m[1]);
    };
    const list = currentPriceList();
    expect(pick(/\| חודשי \| (\d+) ₪ לחודש/, "monthly")).toBe(list.subscription.monthly);
    expect(pick(/\| שנתי \| (\d+) ₪ לשנה/, "yearly")).toBe(list.subscription.yearly);
    expect(pick(/הרשמה לאירוע בתשלום \| (\d+)% /, "event percent")).toBe(list.commission.paidBookingPercent);
    expect(pick(/קנייה קבוצתית שנסגרה \| (\d+)% /, "group-buy percent")).toBe(list.commission.paidBookingPercent);
    expect(pick(/שקית הצלה שנאספה \| (\d+) ₪ לשקית/, "bag fee")).toBe(list.commission.rescueBagFee);
    expect(pick(/מחיר המנוי החודשי \((\d+) ₪\)/, "monthly cap")).toBe(list.commission.monthlyCap);
    expect(pick(/אחרי שעבר (\d+) הזמנות בחודש/, "threshold")).toBe(list.thresholdBookingsPerMonth);
    expect(pick(/\*\*הודעה מראש:\*\* (\d+) יום/, "notice days")).toBe(list.noticeDays);
  });
});
