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
 */
export function fulfillmentTags({ delivers, offersPickup, storeWithHours }, t) {
  const count = [delivers, offersPickup, storeWithHours].filter(Boolean).length;
  if (count === 0) {
    return [{ key: "arranged", label: t("fulfillment.arranged"), Icon: null, neutral: true }];
  }
  const solo = count === 1;
  const tags = [];
  if (delivers) {
    const key = solo ? "delivery_only" : "delivery";
    tags.push({ key, label: t(`fulfillment.${key}`), Icon: Truck });
  }
  if (offersPickup) {
    const key = solo ? "pickup_only" : "pickup";
    tags.push({ key, label: t(`fulfillment.${key}`), Icon: Package });
  }
  if (storeWithHours) {
    tags.push({ key: "on_site", label: t("fulfillment.on_site"), Icon: Storefront });
  }
  return tags;
}
