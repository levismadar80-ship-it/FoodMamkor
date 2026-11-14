// MEH-3166 — one home for everything the site says about price.
//
// Before this guard «חינם, בלי עמלות» was hand-written in 19 strings, so a
// change of model meant searching the whole site. The contract it holds:
//   SCOPE: the vocabulary is fees, subscriptions and "free forever" — the
//   promises ADR-042 changed. «חינם להצטרף» / "free to join" alone is not
//   flagged: joining and the page stay free under ADR-042 §1, so that phrase
//   may appear anywhere.
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
  he: /עמלה|עמלות|עמלת|דמי מנוי|מנוי|לתמיד|לעולם|חינם,? תמיד|תמיד חינם|אחוז מ/,
  en: /commission|subscription|transaction fee|no fees?\b|free forever|forever free|always free|for life|cut of/i,
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
    // Same numbers in both languages: a translation must not drop or swap one.
    for (const key of pricingKeys("he")) {
      expect(placeholders(MESSAGES.en[key]).sort(), `${key} placeholders`).toEqual(placeholders(MESSAGES.he[key]).sort());
    }
  });

  // MEH-3197: the he/en comparison above passes when BOTH locales use the same
  // wrong number, so each promise names the number it must carry.
  it.each([
    ["terms.sections.pricing.launch", ["noticeDays"]],
    ["terms.sections.pricing.dispute", ["disputeDays"]],
    ["terms.sections.pricing.early", ["earlyMonths", "priceChangeDays", "subBagFee", "subPercent"]],
    ["terms.sections.pricing.change", ["priceChangeDays"]],
    ["pricing.page.early_body", ["earlyMonths", "subBagFee", "subPercent"]],
    ["pricing.page.dispute_body", ["disputeDays"]],
    ["pricing.page.change_body", ["priceChangeDays"]],
    ["pricing.page.trial_body", ["trialDays"]],
    ["terms.sections.pricing.trial", ["trialDays"]],
    ["terms.sections.pricing.threshold", ["threshold"]],
    ["pricing.page.fee_note", ["threshold"]],
    ["pricing.page.fee_example", ["exampleFee", "exampleKeep", "examplePrice"]],
  ])("%s carries its own number", (key, expected) => {
    expect(placeholders(MESSAGES.he[key]).sort()).toEqual(expected);
    expect(placeholders(MESSAGES.en[key]).sort()).toEqual(expected);
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
    expect(pick(/מנוי משלם עמלה מופחתת: (\d+)% /, "subscriber percent")).toBe(list.subscriberCommission.paidBookingPercent);
    expect(pick(/ו-(\d+) ₪ לשקית במקום/, "subscriber bag fee")).toBe(list.subscriberCommission.rescueBagFee);
    expect(pick(/הגיעו ל-(\d+) ₪ \(הרשמות בתשלום/, "threshold")).toBe(list.thresholdPaidBookingsPerMonth);
    expect(pricingCopyValues(list).threshold.replace(/,/g, "")).toBe(String(list.thresholdPaidBookingsPerMonth));
    expect(pick(/עמלה ב-(\d+) הימים הראשונים/, "trial days")).toBe(list.trialDays);
    // «ונשארים לכם»: the fee and what is kept add up to the example price.
    const shown = pricingCopyValues(list);
    expect(Number(shown.exampleFee) + Number(shown.exampleKeep)).toBe(list.exampleBookingPrice);
    // «עמלה מופחתת» has to be true: a subscriber's rate is below the plain one.
    expect(list.subscriberCommission.paidBookingPercent).toBeLessThan(list.commission.paidBookingPercent);
    expect(list.subscriberCommission.rescueBagFee).toBeLessThan(list.commission.rescueBagFee);
    // The break-even the docs quote (and a future note may show): at that amount the subscription is not dearer.
    const breakEven = Number(pricingCopyValues(list).breakEven);
    const plain = (breakEven * list.commission.paidBookingPercent) / 100;
    const subscribed = list.subscription.monthly + (breakEven * list.subscriberCommission.paidBookingPercent) / 100;
    expect(subscribed).toBeLessThanOrEqual(plain);
    expect(breakEven % 50).toBe(0);
    // «כשהעמלות מגיעות ל-N ₪ … המנוי כבר זול יותר»: at N ₪ of plain commission the
    // subscription track costs less, whether the month was all percent
    // bookings or all rescue bags; and N is not padded by more than one step.
    const fees = Number(pricingCopyValues(list).breakEvenFees);
    const subscribedCost = (share) => list.subscription.monthly + fees * share;
    const percentShare = list.subscriberCommission.paidBookingPercent / list.commission.paidBookingPercent;
    const bagShare = list.subscriberCommission.rescueBagFee / list.commission.rescueBagFee;
    expect(subscribedCost(percentShare)).toBeLessThan(fees);
    expect(subscribedCost(bagShare)).toBeLessThan(fees);
    expect(list.subscription.monthly + (fees - 10) * Math.max(percentShare, bagShare)).toBeGreaterThanOrEqual(fees - 10);
    expect(fees % 10).toBe(0);
    const [year, month, day] = list.effectiveFrom.split("-");
    expect(doc, "docs/PRICING.md as-of date").toContain(`נכון ל-${Number(day)}/${Number(month)}/${year}`);
    expect(pick(/\*\*הודעה מראש:\*\* (\d+) יום/, "notice days")).toBe(list.noticeDays);
    expect(pick(/ב-(\d+) החודשים הראשונים של החיוב/, "launch joiner months")).toBe(list.launchJoinerMonths);
    expect(pick(/\*\*ערעור על ספירה:\*\* (\d+) יום/, "dispute days")).toBe(list.disputeDays);
    expect(pick(/\*\*שינוי במחירון:\*\* (\d+) יום/, "price change notice")).toBe(list.priceChangeNoticeDays);
  });
});
