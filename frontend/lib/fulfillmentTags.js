import { Truck, Package } from "@phosphor-icons/react";

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
 * MEH-2438 follow-up widened it once, deliberately: `storeWithHours` splits the
 * "neither" cell only (a shop with fixed hours reads «קנייה במקום» instead of
 * the arranged tag). It never decides whether delivery or pickup is shown.
 */
export function fulfillmentTags({ delivers, offersPickup, storeWithHours }, t) {
  if (delivers && offersPickup) {
    return [
      { key: "delivery", label: t("fulfillment.delivery"), Icon: Truck },
      { key: "pickup", label: t("fulfillment.pickup"), Icon: Package },
    ];
  }
  if (delivers) {
    return [{ key: "delivery_only", label: t("fulfillment.delivery_only"), Icon: Truck }];
  }
  if (offersPickup) {
    return [{ key: "pickup_only", label: t("fulfillment.pickup_only"), Icon: Package }];
  }
  // MEH-2438 follow-up: no declared service axis. A shop with fixed hours is
  // not "by arrangement" — you walk in — so it gets its own neutral tag. Both
  // tags sit in the set the /map service filter excludes, so the tag and the
  // filter still cannot disagree; `storeWithHours` only splits that cell.
  if (storeWithHours) {
    return [{ key: "on_site", label: t("fulfillment.on_site"), Icon: null, neutral: true }];
  }
  return [{ key: "arranged", label: t("fulfillment.arranged"), Icon: null, neutral: true }];
}
