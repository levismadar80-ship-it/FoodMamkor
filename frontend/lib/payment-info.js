// @ts-check
/**
 * Module:   payment-info
 * Purpose:  The closed lists behind producers.payment_info and the one
 *           serializer the dashboard editor sends, so the dashboard and the
 *           public page agree on order and shape.
 * Does NOT: validate letters in the note — the API does (MEH-555, 422 Hebrew).
 * Related:  backend/app/schemas/schemas.py PAYMENT_METHODS / PAYMENT_TIMINGS /
 *           _payment_info_validator (the authority; keep these lists equal —
 *           __tests__/PaymentInfoLib.test.js reads both).
 * History:  MEH-3035 chunk 2 · MEH-3895 (`link`, the business's own prepay
 *           link; prepayLink = backend schemas/payment_link.py prepay_link).
 */

export const PAYMENT_METHODS = ["bit", "paybox", "bank_transfer", "cash", "credit_card"];
export const PAYMENT_TIMINGS = ["advance", "on_pickup", "deposit"];
export const PAYMENT_NOTE_MAX = 80;
export const PAYMENT_LINK_MAX = 300; // = backend schemas/payment_link.py
// MEH-3895: the timings in which money moves before pickup — the only ones
// in which a buyer is shown the link.
export const PREPAY_TIMINGS = ["advance", "deposit"];

/** Stored value (or null) → editor state. Unknown methods are dropped. */
export function paymentStateFrom(info) {
  const methods = new Set((info?.methods || []).filter((m) => PAYMENT_METHODS.includes(m)));
  const timing = PAYMENT_TIMINGS.includes(info?.timing) ? info.timing : null;
  return { methods, timing, note: info?.note || "", link: info?.link || "" };
}

/** Editor state → PUT body value. All-empty → null (= the business says nothing). */
export function serializePaymentInfo({ methods, timing, note, link = "" }) {
  /** @type {{ methods: string[], timing: string | null, note: string | null, link?: string }} */
  const out = {
    methods: PAYMENT_METHODS.filter((m) => methods.has(m)),
    timing: timing || null,
    note: note.trim() || null,
  };
  // MEH-3895: only when set, so a row saved before the link keeps its shape;
  // and only on a prepay timing, as the API keeps it (schemas._payment_info_validator).
  if (link.trim() && PREPAY_TIMINGS.includes(out.timing)) out.link = link.trim();
  if (out.methods.length === 0 && !out.timing && !out.note && !out.link) return null;
  return out;
}

/** MEH-3895: the link a buyer is shown, or null — only a stored link, and
 *  only when the business takes the money before pickup. */
export function prepayLink(info) {
  const link = typeof info?.link === "string" ? info.link : "";
  return link && PREPAY_TIMINGS.includes(info?.timing) ? link : null;
}

/** The host printed beside the pay button («דרך bitpay.co.il»), or null. */
export function linkHost(link) {
  try {
    return new URL(link).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

// MEH-3035: the public «איך משלמים?» answer from a stored payment_info, or
// null when nothing usable is set. ONE owner for both the page chip
// (WhatsAppQuestionChips) and the dashboard preview (resolvedQuestions), so
// the two can't disagree about when the question shows.
export function paymentAnswer(info) {
  const methods = PAYMENT_METHODS.filter((m) => (info?.methods || []).includes(m));
  const timing = PAYMENT_TIMINGS.includes(info?.timing) ? info.timing : null;
  const note = (info?.note || "").trim();
  if (methods.length === 0 && !timing && !note) return null;
  return { methods, timing, note };
}

/** MEH-3895: whether a member of a group buy is shown the prepay button —
 *  only once the group is funded (also after the deadline: pickup follows),
 *  never while it may still fail. Kickstarter and Groupon charge only after
 *  the threshold is reached, and the join form promises «לא משלמים עכשיו».
 *  Not once handed (fulfilled) or cancelled. */
export function groupBuyAwaitsPayment(status) {
  return status === "funded";
}

/**
 * MEH-3895: what the group-buy member card gets as its `prepay` prop — the
 * business's link and timing once the group is funded, else null (no button,
 * «לא משלמים עכשיו» stays).
 * @param {{ status?: string } | null | undefined} gb
 * @param {any} paymentInfo the business's payment_info
 * @returns {{ link: string, timing: string | null } | null}
 */
export function groupBuyPrepay(gb, paymentInfo) {
  if (!groupBuyAwaitsPayment(gb?.status)) return null;
  const link = prepayLink(paymentInfo);
  return link ? { link, timing: paymentInfo?.timing ?? null } : null;
}
