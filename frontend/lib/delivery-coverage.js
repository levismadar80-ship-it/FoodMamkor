/**
 * Module:   delivery-coverage
 * Purpose:  The rule for whether a producer's public page shows the
 *           «מגיעים אלייך?» checker, and through it the coverage CTA. Kept in
 *           lib/ so DeliveryChecker and the owner dashboard's switch
 *           (CoverageCtaToggle) share one owner without the dashboard
 *           pulling in the checker's UI imports.
 * History:  MEH-1536 (gates 1–3, written inline in DeliveryChecker) ·
 *           MEH-2626 (exported from DeliveryChecker for DeliveryBlock) ·
 *           MEH-1676 (extracted; 03/11 ערב: hide the switch where the CTA
 *           can never appear).
 */
import { normalizePhone } from "@/lib/utils";

// Gate 1 (spec): only for producers that actually deliver.
// Gate 2 (spec): nationwide with no exclusions — the answer is trivially
//   "yes" for every city, so a checker would be pure noise.
// Gate 3 (MEH-1536 judgment call, documented in the PR): not nationwide AND
//   no delivery_areas rows — every possible answer would be "לא מגיעים",
//   which contradicts the "משלוחים בתיאום מראש" line DeliveryBlock renders
//   right below it. An always-negative checker is worse than none.
// MEH-2626: DeliveryBlock places the WhatsApp updates pill under its
// nationwide badge on exactly the pages this returns false for — one rule,
// read by both, so the pill never has two homes on one page.
export function isDeliveryCheckerUsable({ offersDelivery, nationwide, excluded = [], areas = [] }) {
  const hasExclusions = nationwide && excluded.length > 0;
  return Boolean(offersDelivery) && (hasExclusions || (!nationwide && areas.length > 0));
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
  return isDeliveryCheckerUsable({
    offersDelivery: !!producer?.offers_delivery,
    nationwide: producer?.delivery_nationwide,
    excluded: producer?.delivery_excluded_cities || [],
    areas: producer?.delivery_areas || [],
  });
}
