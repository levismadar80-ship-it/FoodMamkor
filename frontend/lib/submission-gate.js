/**
 * Module:   submission-gate
 * Purpose:  Answer "may this business be sent for review, and if not, what is
 *           missing?" on the CLIENT, so the dashboard can disable the
 *           "שליחה לבדיקה" CTA and name the remaining items before the owner
 *           clicks and gets a 422.
 * Does NOT: decide anything. The SERVER is the authority
 *           (backend/app/services/submission_gate.py); this is an affordance,
 *           and POST /producers/me/submit-for-review re-checks every rule. A
 *           client that ignores the disabled button still gets 422 with the
 *           same codes. Does NOT compute profile completeness — that is
 *           lib/producer-completeness.js, which answers "how polished is
 *           this?" (and counts a tagline and opening hours, neither of which
 *           blocks submission).
 * Related:  backend/app/services/submission_gate.py (the authority — the code
 *           strings below are its contract, returned in
 *           `detail.params.missing`), components/producer/DraftSubmitBanner.jsx
 *           (the only consumer), lib/producerPoints.js (the location rule this
 *           reuses rather than re-derives).
 * History:  MEH-2100 (creation).
 *
 * ON DUPLICATING THE BACKEND. This is a deliberate second implementation, and
 * the alternative was worse: the only way to know what is missing without one
 * is to POST and read the 422, which means the CTA is always enabled and the
 * owner discovers the gate by failing it. The duplication is bounded — five
 * boolean rules, no copy, no ordering — and the codes are asserted against the
 * backend's list in __tests__/SubmissionGateParity.test.js so a rename on
 * either side reds rather than silently splitting the two.
 */

import { producerPoints } from "./producerPoints.js";

// The machine-readable codes. These MUST match
// backend/app/services/submission_gate.py — they cross the API boundary in
// `detail.params.missing`, so a mismatch means the dashboard cannot highlight
// what the server rejected.
export const MISSING_IMAGE = "image";
export const MISSING_PRODUCT = "product";
export const MISSING_CATEGORY = "category";
export const MISSING_LOCATION = "location";
export const MISSING_PHONE_VERIFIED = "phone_verified";

// Canonical order — the order the owner reads her remaining items in. Mirrors
// SUBMISSION_REQUIREMENTS in the backend module.
export const SUBMISSION_REQUIREMENTS = [
  MISSING_IMAGE,
  MISSING_PRODUCT,
  MISSING_CATEGORY,
  MISSING_LOCATION,
  MISSING_PHONE_VERIFIED,
];

/**
 * True when the business has told us where it is.
 *
 * MEH-213: a delivery-only business intentionally has no lat/lng, so its
 * location signal is the delivery declaration instead — nationwide, or at
 * least one named city. Demanding coordinates from it would make submission
 * unreachable, which is the exact bug the backend test suite now pins.
 *
 * MEH-904 / MEH-1838: cities come from the `delivery_areas` ROWS. The flat
 * `delivery_cities` field is dead for registration-created producers and
 * reading it here would evaluate empty for every one of them.
 */
function hasLocation(producer) {
  const deliveryOnly =
    producer?.has_physical_location === false && !!producer?.offers_delivery;

  if (deliveryOnly) {
    if (producer?.delivery_nationwide) return true;
    return (producer?.delivery_areas || []).some((area) =>
      (area?.city || "").trim(),
    );
  }

  // Physical: a producer_locations row, else the Producer.lat/lng fallback —
  // producerPoints() already encodes that precedence (MEH-1938 chunk 3), so
  // this reuses it rather than re-deriving it and drifting.
  return producerPoints(producer).length > 0;
}

/**
 * The requirement codes this producer has NOT satisfied, in canonical order.
 * Empty array = ready to submit.
 *
 * Every check proves PRESENCE, never absence, so a field that failed to load
 * reads as missing rather than satisfied — the fail-closed direction. A false
 * "missing" costs one confused owner; a false "ready" costs an enabled button
 * that 422s.
 */
export function submissionMissingItems(producer) {
  if (!producer) return [...SUBMISSION_REQUIREMENTS];

  const missing = [];

  // MEH-799: `images` can be [] or null/undefined depending on how the row was
  // inserted — both mean "no photo".
  if ((producer.images || []).length === 0) missing.push(MISSING_IMAGE);

  // MEH-1238: one product, matching the checklist's CHECKLIST_PRODUCTS_MIN —
  // deliberately NOT badges.js PRODUCTS_MIN = 3, which is the auto-badge rule.
  // /producers/me joinloads the products relation, so the array is the
  // reliable source; products_count is a listing-serializer field defaulting
  // to 0 here and is only a fallback.
  const productCount = Array.isArray(producer.products)
    ? producer.products.length
    : (producer.products_count ?? 0);
  if (productCount < 1) missing.push(MISSING_PRODUCT);

  if ((producer.categories || []).length === 0) missing.push(MISSING_CATEGORY);

  if (!hasLocation(producer)) missing.push(MISSING_LOCATION);

  // MEH-745: the WhatsApp number is the channel every customer contact runs
  // through. Read from the `phone_verified` column, NOT inferred from a status
  // value — the status this was once inferred from (`pending_whatsapp`) stopped
  // being reachable for a new registration under the draft machine and was
  // removed in MEH-2124; a status-based read would have reported every draft
  // as verified.
  if (!producer.phone_verified) missing.push(MISSING_PHONE_VERIFIED);

  return missing;
}

/** Convenience predicate — one definition of ready, no second condition. */
export function isReadyForReview(producer) {
  return submissionMissingItems(producer).length === 0;
}
