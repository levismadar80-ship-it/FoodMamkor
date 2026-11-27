// @ts-check
import { Truck, Package, Storefront } from "@phosphor-icons/react";

// MEH-2561: moved here verbatim from MapProducerCard.jsx so the owner dashboard
// (DeliveryCard's "בכרטיס במפה יופיע" preview) renders the SAME tag the /map
// card does — one function, two readers, nothing to keep in sync by hand.

// MEH-2046: the fulfillment tag washes, both from tailwind.tokens.json.
// `green-50` is the same light-green the /map service chips use for their ON
// state (ServiceChipRow.jsx:71), so a declared service reads in the palette the
// filter already established. The neutral is deliberately NOT a faded green — an
// absent service axis must not read as a weaker version of a present one, which
// a green tint would imply — so it takes the sand `background-alt` with
// `fg-muted` text (#5c584f, the palette's quiet-but-AA foreground).
//
// Both are CLASSES, not inline values. An earlier revision of this block wrote
// `var(--color-fg-muted, #6b6b6b)`, and no such custom property exists: the
// token is a Tailwind color, so the var resolved to nothing and every neutral
// tag rendered in an off-palette grey that had never been through DESIGN.md. It
// read as a token reference while being a hardcoded hex with extra steps.
export const FULFILLMENT_WASH_GREEN = "bg-green-50 text-primary";
export const FULFILLMENT_WASH_NEUTRAL = "bg-background-alt text-fg-muted";
export const FULFILLMENT_ICON_PX = 13;

/**
 * MEH-2046: the fulfillment state of one business, as tags.
 *
 * FOUR states, and the block is present in ALL of them — including the
 * "neither" case. That is not padding: MapProducerCard's text column is three
 * fixed-height rows precisely so every card is the same height (🔒 MEH-1243
 * §5), and a block that appeared only for *some* businesses would reintroduce
 * the ragged list that guarantee exists to prevent. Always-present costs one
 * row uniformly and keeps the lock intact.
 *
 * Reads `delivers` / `offers_pickup` and NOTHING else. Both are computed
 * server-side (MEH-2046 PR-1) as the exact results of the listing predicates,
 * so the tag on the card and the filter that returned the card cannot disagree
 * — which is the MEH-1836 divergence this ticket closes. Do not fall back to
 * `has_delivery` or `delivery_count` here: those are the operands whose drift
 * caused it. The destructured first parameter is what makes that contract
 * literal rather than a promise in prose — the whole producer is not in scope
 * here, so a future fallback to a legacy operand cannot be added without
 * widening the signature first.
 *
 * MEH-2438 follow-up widened it once, deliberately: `storeWithHours` (a shop
 * with fixed hours) reads «קנייה במקום».
 *
 * MEH-2598 made «קנייה במקום» a FILTER (`?on_site=true`), so it is now a
 * service tag like the other two: green with a glyph, and shown ALONGSIDE
 * delivery / pickup rather than only in the "neither" cell. Otherwise a store
 * that also delivers would be returned by the on-site filter while its card
 * said only «משלוח» — the exact tag/filter disagreement MEH-1836 closed. On
 * /map the input is the server's `sells_on_site` (the predicate's own answer);
 * the owner dashboard preview passes its live-form equivalent.
 *
 * Keys: with ONE service the delivery / pickup keys keep their `_only` names
 * (MEH-2046 test ids); with two or more each tag uses its bare key.
 * «בתיאום מראש» remains the only neutral tag — the one cell no filter returns.
 *
 * MEH-2447: `byArrangement` is the owner's own answer («איסוף או ביקור בתיאום
 * מראש», producers.by_arrangement AND has_physical_location). It is a fourth
 * service: it counts toward `solo`, so «משלוח בלבד» never sits beside it, and
 * it shows the same neutral tag the "nothing declared" cell falls back to.
 *
 * MEH-3977: `partnerStores` — sold only through other stores (no place, no
 * delivery). Said only in the "nothing else" cell, as a neutral tag: «בתיאום
 * מראש» there would be a claim nobody made, and no filter returns it.
 */
export function fulfillmentTags({ delivers, offersPickup, storeWithHours, byArrangement, partnerStores = false }, t) {
  const arranged = { key: "arranged", label: t("fulfillment.arranged"), Icon: null, neutral: true };
  const count = [delivers, offersPickup, storeWithHours, byArrangement].filter(Boolean).length;
  if (count === 0) {
    if (partnerStores) {
      return [{ key: "partner_stores", label: t("fulfillment.partner_stores"), Icon: null, neutral: true }];
    }
    return [arranged];
  }
  const solo = count === 1;
  const tags = [];
  if (delivers) {
    const key = solo ? "delivery_only" : "delivery";
    tags.push({ key, label: t(`fulfillment.${key}`), Icon: Truck, neutral: false });
  }
  if (offersPickup) {
    const key = solo ? "pickup_only" : "pickup";
    tags.push({ key, label: t(`fulfillment.${key}`), Icon: Package, neutral: false });
  }
  if (storeWithHours) {
    tags.push({ key: "on_site", label: t("fulfillment.on_site"), Icon: Storefront, neutral: false });
  }
  if (byArrangement) {
    tags.push(arranged);
  }
  return tags;
}

/**
 * MEH-2447: «where the customer comes to you» as two exclusive checkboxes
 * over the pair (has_physical_location, by_arrangement): «בשעות קבועות»
 * (place, walk-in) and «בתיאום מראש» (place, arranged). Shared by the owner's
 * DeliveryCard and the admin ProducerForm so both write the same shape.
 * @param {boolean} hasPhysical @param {boolean} byArrangement
 */
export function placeChecks(hasPhysical, byArrangement) {
  return { onsite: !!hasPhysical && !byArrangement, arranged: !!hasPhysical && !!byArrangement };
}

/**
 * The pair after one of the two checkboxes changes. Ticking one unticks the
 * other; unticking either leaves no place at all.
 * @param {"onsite"|"arranged"} axis @param {boolean} checked
 */
export function togglePlace(axis, checked) {
  return checked
    ? { hasPhysical: true, byArrangement: axis === "arranged" }
    : { hasPhysical: false, byArrangement: false };
}
