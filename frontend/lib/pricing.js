// @ts-check
/**
 * Module:   pricing
 * Purpose:  The one place the site reads its prices from — subscription,
 *           booking commissions (with and without a subscription), the results threshold and
 *           the notice period — plus the list of message keys that are
 *           allowed to talk about price at all.
 * Touches:  nothing — pure data + pure helpers, no React, no fetch, no env.
 * Does NOT: own the WORDS (they live in messages/{he,en}.json and take these
 *           numbers as ICU values), bill anyone, or decide which tool a
 *           business may use — nothing is charged today (`phase: "launch"`).
 *           Does NOT own the RULES either: those are ADR-042. Changing a
 *           number here is allowed without a new ADR; changing a rule is not.
 * Related:  docs/decisions/ADR-042-revenue-model-v3.md (the rules) ·
 *           docs/PRICING.md (the same numbers for people — the guard keeps the
 *           two equal) · __tests__/PricingCopyGuard.test.js (the guard) ·
 *           app/[locale]/join/pricing/page.js (the public price list).
 * History:  MEH-3166 (creation, 2026-11-14).
 *
 * WHY THIS EXISTS. Before it, «חינם, בלי עמלות» was hand-written in 19
 * separate strings and once more in the chat prompt, so changing the model
 * meant searching the whole site and hoping nothing was missed. The rule from
 * here on: a number is written once, here; a sentence about price lives under
 * `pricing.*` or in a key listed in PRICING_COPY_KEYS; the guard fails on
 * anything else.
 *
 * CHANGING A PRICE. Do not edit a version that businesses may already have
 * agreed to. Add a new entry to PRICE_LISTS with its own `version` and
 * `effectiveFrom`, and point CURRENT_PRICE_LIST_VERSION at it — the Stripe
 * rule (a price is never edited, a new one is created), so an existing
 * business can stay on the list it joined under. Per-business storage of the
 * agreed version is not built yet (MEH-3165).
 */

const PRICE_LISTS = Object.freeze({
  1: Object.freeze({
    version: 1,
    effectiveFrom: "2026-11-14",
    currency: "ILS",
    // "launch" = everything is free for every business and nothing is billed.
    phase: "launch",
    subscription: Object.freeze({ monthly: 49, yearly: 490 }),
    commission: Object.freeze({
      // Paid event / experience registration, closed group-buy order.
      paidBookingPercent: 5,
      // A rescue bag marked as collected.
      rescueBagFee: 2,
    }),
    // A subscriber pays the subscription AND a reduced commission, so what a
    // business pays keeps growing with its bookings (Sapir 14/11: no monthly
    // cap; the subscription lowers the commission instead of removing it).
    subscriberCommission: Object.freeze({
      paidBookingPercent: 2,
      rescueBagFee: 1,
    }),
    // Billing starts per business, only above this many bookings in a month.
    thresholdBookingsPerMonth: 20,
    // Written notice before a business's first charge.
    noticeDays: 60,
    // The price of the paid sign-up used in the worked example on the price
    // list. The fee shown next to it is computed, never typed.
    exampleBookingPrice: 200,
  }),
});

const CURRENT_PRICE_LIST_VERSION = 1;

/** The price list in force today. */
export function currentPriceList() {
  return PRICE_LISTS[CURRENT_PRICE_LIST_VERSION];
}

/**
 * Paid bookings a month (₪) from which subscribing is the cheaper choice:
 * monthly / (percent − subscriber percent), rounded up to the next 50.
 */
function subscriptionBreakEven(list) {
  const saved = list.commission.paidBookingPercent - list.subscriberCommission.paidBookingPercent;
  const exact = (list.subscription.monthly * 100) / saved;
  return Math.ceil(exact / 50) * 50;
}

/**
 * The ICU values every pricing sentence takes. Strings, not numbers, so a
 * message renders «49» in every locale instead of a locale-formatted number.
 * Pass the whole object to `t()` — a message uses the ones it names.
 */
export function pricingCopyValues(list = currentPriceList()) {
  const [year, month, day] = list.effectiveFrom.split("-");
  return {
    // «14.11.2026» — the day this list took effect, shown on the price list.
    asOf: `${Number(day)}.${Number(month)}.${year}`,
    examplePrice: String(list.exampleBookingPrice),
    exampleFee: String((list.exampleBookingPrice * list.commission.paidBookingPercent) / 100),
    monthly: String(list.subscription.monthly),
    yearly: String(list.subscription.yearly),
    percent: String(list.commission.paidBookingPercent),
    bagFee: String(list.commission.rescueBagFee),
    subPercent: String(list.subscriberCommission.paidBookingPercent),
    subBagFee: String(list.subscriberCommission.rescueBagFee),
    // Monthly paid bookings (₪) above which the subscription costs less than
    // the plain commission, rounded up to the next 50. Computed, never typed.
    breakEven: String(subscriptionBreakEven(list)),
    threshold: String(list.thresholdBookingsPerMonth),
    noticeDays: String(list.noticeDays),
  };
}

/** Where the public price list lives. One constant, so a move is one edit. */
export const PRICING_PATH = "/join/pricing";

/**
 * Message keys OUTSIDE the `pricing.*` namespace that may talk about price
 * (fees, a subscription, what is free for how long). This is the list to
 * re-read when the model changes: every sentence the site says about money is
 * either under `pricing.*` or named here. PricingCopyGuard fails on a message
 * that uses pricing vocabulary and is in neither place.
 *
 * The chat's own answer is not a message key — it is in
 * backend/app/routers/chat.py and guarded by tests/test_chat_no_premium_promise.py.
 */
export const PRICING_COPY_KEYS = Object.freeze([
  "join.faq.a_cost",
  "join.faq.a_revenue",
  "about_business.faq.cost.q",
  "about_business.faq.cost.a",
  "about_business.faq.revenue_model.a",
]);
