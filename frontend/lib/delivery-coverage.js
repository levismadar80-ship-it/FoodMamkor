/**
 * Module:   delivery-coverage
 * Purpose:  The rule for whether a producer's public page shows the
 *           «מגיעים אלייך?» checker, and through it the coverage CTA. Kept in
 *           lib/ so DeliveryChecker and the owner dashboard's switch
 *           (CoverageCtaToggle) share one owner without the dashboard
 *           pulling in the checker's UI imports.
 * History:  MEH-1536 (gates 1–3, written inline in DeliveryChecker) ·
 *           MEH-1676 (extracted; 03/11 ערב: hide the switch where the CTA
 *           can never appear).
 */
import { normalizePhone } from "@/lib/utils";

/**
 * Gates 1–3 of DeliveryChecker as one predicate:
 *   1. only for producers that actually deliver;
 *   2. nationwide with no exclusions → the answer is always "yes", no checker;
 *   3. not nationwide AND no delivery_areas rows → always "no", no checker.
 */
export function deliveryCheckerUsable({ offersDelivery = false, nationwide = false, excluded = [], areas = [] }) {
  const hasExclusions = nationwide && excluded.length > 0;
  return !!offersDelivery && (hasExclusions || (!nationwide && areas.length > 0));
}

/**
 * Can this producer's public page ever show CoverageRequestCta? The checker
 * must render (gates 1–3, fed the same producer fields DeliveryBlock passes at
 * ProducerSections.jsx:676-681), and the CTA needs a WhatsApp phone
 * (CoverageRequestCta.jsx:40-43). The opt-out flag is deliberately NOT part of
 * this: it is what the owner's switch controls.
 */
export function coverageCtaReachable(producer) {
  if (!normalizePhone(producer?.phone)) return false;
  return deliveryCheckerUsable({
    offersDelivery: !!producer?.offers_delivery,
    nationwide: producer?.delivery_nationwide,
    excluded: producer?.delivery_excluded_cities || [],
    areas: producer?.delivery_areas || [],
  });
}
