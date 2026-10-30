/**
 * MEH-2602: the ONE reading of "what does delivery cost" for a business —
 * shared by the discovery card and the business page's DeliveryBlock.
 *
 * The staging sweep (29/10) found the card saying «25₪» (the producer-level
 * rate) while the page said «מ-20₪» (the cheapest per-area override): two
 * surfaces, two derivations of one fact. Both now call this.
 *
 * Per-area `delivery_fee` is an OVERRIDE with the producer rate as fallback
 * (MEH-1772). `??` throughout: 0 is a real fee («משלוח חינם»), not absence.
 *   - effective fees differ  → { fee: cheapest, from: true }  («משלוח מ-…»)
 *   - all areas agree        → { fee: that value, from: false }
 *   - no area states a fee   → { fee: producer rate (or null), from: false }
 *
 * @param {number|null|undefined} producerFee
 * @param {Array<{delivery_fee?: number|null}>} areas
 * @returns {{ fee: number|null, from: boolean }}
 */
export function resolveDeliveryFee(producerFee, areas = []) {
  const fallback = producerFee ?? null;
  const effective = (areas || [])
    .filter(Boolean)
    .map((a) => a.delivery_fee ?? fallback)
    .filter((f) => f != null);
  const distinct = new Set(effective);
  if (distinct.size > 1) return { fee: Math.min(...effective), from: true };
  if (distinct.size === 1) return { fee: effective[0], from: false };
  return { fee: fallback, from: false };
}
