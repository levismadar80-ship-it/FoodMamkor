// @ts-check
/**
 * Module:   map-offer-marks
 * Purpose:  MEH-3824 — the small mark on a business's pin while one of the
 *           map's offer switches is on (סלי הפתעה · קבוצות רכישה · אירועים ·
 *           חוויות). Sapir 25/11: the mark shows ONLY while a switch is on,
 *           so the map does not single out one kind of offer by default.
 * Touches:  nothing — pure functions over the producer payload.
 * Does NOT: decide which switches exist (lib/filter-taxonomy.js
 *           MAP_ONLY_GROUPS), gate them (producer-filters visibleAxisChips),
 *           or draw the pin (components/MapComponent.jsx).
 * Related:  lib/producer-filters.js GATED_AXIS_PREDICATES (the same test the
 *           switch's gate uses, so a marked pin is one the switch counted);
 *           lib/chip-icons.js (the glyph is the switch's own glyph).
 */
import { FILTER_AXES, MAP_CHIP_ORDER, MAP_ONLY_GROUPS } from "@/lib/filter-taxonomy";
import { GATED_AXIS_PREDICATES } from "@/lib/producer-filters";

/** The offer axes, in the order the sheet shows them. */
export const OFFER_MARK_KEYS = MAP_CHIP_ORDER.filter((key) =>
  MAP_ONLY_GROUPS.includes(FILTER_AXES[key]?.group),
);

/**
 * The offer switches that are on, in sheet order.
 * @param {Record<string, unknown> | null | undefined} chipState
 * @returns {string[]}
 */
export function activeOfferMarks(chipState) {
  if (!chipState) return [];
  return OFFER_MARK_KEYS.filter((key) => chipState[key]);
}

/**
 * Which mark a business's pin carries: the first switched-on kind it has, in
 * sheet order, or null. One mark per pin — two would cover the photo.
 * @param {object | null | undefined} producer
 * @param {string[]} activeKeys
 * @returns {string | null}
 */
export function offerMarkFor(producer, activeKeys) {
  if (!producer || !activeKeys?.length) return null;
  for (const key of activeKeys) {
    const has = GATED_AXIS_PREDICATES[key];
    if (typeof has === "function" && has(producer)) return key;
  }
  return null;
}
