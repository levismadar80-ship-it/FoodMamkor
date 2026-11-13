/**
 * Module:   payment-info
 * Purpose:  The closed lists behind producers.payment_info and the one
 *           serializer the dashboard editor sends, so the dashboard and the
 *           public page agree on order and shape.
 * Does NOT: validate letters in the note — the API does (MEH-555, 422 Hebrew).
 * Related:  backend/app/schemas/schemas.py PAYMENT_METHODS / PAYMENT_TIMINGS /
 *           _payment_info_validator (the authority; keep these lists equal —
 *           __tests__/PaymentInfoLib.test.js reads both).
 * History:  MEH-3035 chunk 2.
 */

export const PAYMENT_METHODS = ["bit", "paybox", "bank_transfer", "cash", "credit_card"];
export const PAYMENT_TIMINGS = ["advance", "on_pickup", "deposit"];
export const PAYMENT_NOTE_MAX = 80;

/** Stored value (or null) → editor state. Unknown methods are dropped. */
export function paymentStateFrom(info) {
  const methods = new Set((info?.methods || []).filter((m) => PAYMENT_METHODS.includes(m)));
  const timing = PAYMENT_TIMINGS.includes(info?.timing) ? info.timing : null;
  return { methods, timing, note: info?.note || "" };
}

/** Editor state → PUT body value. All-empty → null (= the business says nothing). */
export function serializePaymentInfo({ methods, timing, note }) {
  const out = {
    methods: PAYMENT_METHODS.filter((m) => methods.has(m)),
    timing: timing || null,
    note: note.trim() || null,
  };
  if (out.methods.length === 0 && !out.timing && !out.note) return null;
  return out;
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
