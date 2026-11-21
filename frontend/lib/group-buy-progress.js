// @ts-check
/**
 * MEH-2540: progress toward the group price, for the list card and the page.
 *
 * Measured against `min_participants` — the number both labels show
 * («{commits} מתוך {min} הצטרפו»). It was `max || min`, which drew a 10% bar
 * beside «2 מתוך 2» whenever a business set a maximum.
 */
export function groupBuyProgressPct(commits, min) {
  if (!min || min <= 0) return 0;
  return Math.min(100, Math.round(((commits || 0) / min) * 100));
}

/**
 * MEH-2544: the saving as a whole percent, for the card badge and the page's
 * «חיסכון של N%». Prices arrive as Decimal strings («18.00»). A missing or
 * non-positive regular price, or a group price that is not lower, is 0 — the
 * badge then hides.
 */
export function groupBuyDiscountPct(regular, group) {
  // Number(null) and Number("") are 0 — a missing group price would read as 100% off.
  if (group == null || group === "") return 0;
  const r = Number(regular);
  const g = Number(group);
  if (!(r > 0) || !Number.isFinite(g) || g >= r) return 0;
  return Math.round(((r - g) / r) * 100);
}

/**
 * MEH-3585: how a member gets the goods — one entry per answer the business
 * gave (MEH-2621: pickup and delivery are two fields). A group made before the
 * split carries only `fulfillment_note`, shown as a pickup line. Blank answers
 * are dropped, so the result is 0, 1 or 2 entries.
 * @param {{ pickup_note?: string|null, delivery_note?: string|null, fulfillment_note?: string|null }} gb
 * @returns {Array<{ kind: "pickup"|"delivery"|"fulfillment", note: string }>}
 */
export function groupBuyFulfillment(gb) {
  const pick = (s) => (typeof s === "string" ? s.trim() : "");
  const split = [
    { kind: /** @type {const} */ ("pickup"), note: pick(gb?.pickup_note) },
    { kind: /** @type {const} */ ("delivery"), note: pick(gb?.delivery_note) },
  ].filter((e) => e.note);
  if (split.length > 0) return split;
  const old = pick(gb?.fulfillment_note);
  return old ? [{ kind: "fulfillment", note: old }] : [];
}

/**
 * MEH-3588: the minimum is a goal, not a cap — reaching it opens the price and
 * the group keeps taking joiners (MEH-3289). True once `commits` reaches `min`.
 */
export function groupBuyGoalReached(commits, min) {
  return Boolean(min) && min > 0 && (commits || 0) >= min;
}

/**
 * MEH-3588: places left under `max_participants`; null when the business set
 * no maximum (then nothing about places is shown).
 */
export function groupBuySpotsLeft(commits, max) {
  if (typeof max !== "number" || max <= 0) return null;
  return Math.max(0, max - (commits || 0));
}
