// @ts-check
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
 *   - SOME areas have no effective fee (no override, no producer rate)
 *                            → { fee: null, from: false }
 *
 * MEH-3968: the last case used to drop the unstated areas, so [0, ∅, ∅] read
 * as "every area agrees on 0" and the page said «משלוח חינם» for all cities.
 * A price stated for some areas is not a price for the business; the per-area
 * rows carry it instead (DeliveryBlock treats ∅ as a distinct value there).
 *
 * @param {number|null|undefined} producerFee
 * @param {Array<{delivery_fee?: number|null}>} areas
 * @returns {{ fee: number|null, from: boolean }}
 */
export function resolveDeliveryFee(producerFee, areas = []) {
  const fallback = producerFee ?? null;
  const resolved = (areas || []).filter(Boolean).map((a) => a.delivery_fee ?? fallback);
  const effective = resolved.filter((f) => f != null);
  if (effective.length > 0 && effective.length < resolved.length) {
    return { fee: null, from: false };
  }
  const distinct = new Set(effective);
  if (distinct.size > 1) return { fee: Math.min(...effective), from: true };
  if (distinct.size === 1) return { fee: effective[0], from: false };
  return { fee: fallback, from: false };
}

/**
 * MEH-3891: a list page's first paint (home, /producers) carried every card's
 * full delivery_areas, and one business with 191 cities (62 KB) put the home
 * page over the Lighthouse byte budget. A card reads those rows only through
 * resolveDeliveryFee above, whose answer depends only on the SET of per-area
 * fees. So the server page keeps the first row of each distinct fee: the card
 * shows exactly what it showed with the full list, at a fraction of the bytes.
 * `delivery_count` comes from the server and is not touched. The business page
 * and every client-side fetch still get the full list.
 *
 * Only for the server-rendered default lists. A list fetched with a city
 * filter is rendered from client fetches, which keep their rows (the region
 * fallback reads delivery days per city, HomeProducersGrid.jsx).
 *
 * @template {{ delivery_areas?: Array<{delivery_fee?: number|null}|null>|null }} P
 * @param {P[]|null|undefined} list
 * @returns {P[]|null|undefined}
 */
export function slimCardList(list) {
  if (!Array.isArray(list)) return list;
  return list.map((producer) => {
    const areas = producer?.delivery_areas;
    if (!Array.isArray(areas) || areas.length < 2) return producer;
    const seen = new Set();
    const kept = areas.filter((area) => {
      if (!area) return false;
      const key = area.delivery_fee ?? null;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { ...producer, delivery_areas: kept };
  });
}
