/**
 * Module:   edit-accordion-chips
 * Purpose:  Answer one question per edit-hub accordion card — does this card
 *           gate the submit button, or is it optional? The header chip
 *           («חובה» / «רשות») is rendered from this answer.
 * Touches:  nothing. Pure mapping, no I/O, no React.
 * Does NOT: decide whether a card is FILLED. That is the completeness
 *           checklist's job (`ProfileCompletenessCard` + `producer-completeness`);
 *           this module answers "is it required", never "is it done", and the
 *           chip is therefore identical for a finished and an untouched card.
 * Related:  lib/submission-gate.js (SUBMISSION_REQUIREMENTS — the owner of the
 *           gate), components/EditAccordionCard.jsx (the consumer),
 *           app/[locale]/producer/dashboard/edit/page.js (anchor registry).
 * History:  MEH-2138 chunk C (creation).
 */

import {
  MISSING_CATEGORY,
  MISSING_IMAGE,
  MISSING_LOCATION,
  MISSING_PHONE_VERIFIED,
  MISSING_PRODUCT,
  SUBMISSION_REQUIREMENTS,
} from "./submission-gate";

/**
 * Gate code → the accordion card where the owner supplies that thing.
 *
 * DERIVED, not re-listed. The set of required cards is computed below by
 * walking `SUBMISSION_REQUIREMENTS` — the list `DraftSubmitBanner` renders and
 * the mirror of the backend's own gate — so a requirement added or dropped
 * there changes the chips with no edit here. Hand-writing a second list of
 * "the required ones" is the two-owners-for-one-fact smell (workflow.md
 * Smell #1), and it is the specific way this chip would go quietly wrong: the
 * gate would move and the chip would keep claiming the old answer.
 *
 * A code with no accordion card maps to `null` and contributes nothing.
 */
const CODE_TO_ANCHOR = {
  [MISSING_IMAGE]: "images",
  [MISSING_PRODUCT]: "products",
  [MISSING_CATEGORY]: "categories",
  [MISSING_LOCATION]: "locations",

  // The OTP card itself lives in the dashboard's draft banner, not in this
  // accordion — but the PHONE it verifies is typed on the contact card, so
  // that card is on the critical path to passing the gate. Marking it «רשות»
  // would be the one actively harmful chip on the page: an owner who skips it
  // cannot submit, and nothing on the card would have told her.
  //
  // This is a judgement, not a mechanical mapping, and it is the one place
  // this module departs from a literal reading of "the submit gate's items".
  // Recorded here rather than buried in the PR so the next reader can disagree
  // with it deliberately.
  [MISSING_PHONE_VERIFIED]: "contact-channels",
};

/** Anchor ids whose card is on the submit-gate critical path. */
export const REQUIRED_ANCHORS = new Set(
  SUBMISSION_REQUIREMENTS.map((code) => CODE_TO_ANCHOR[code]).filter(Boolean),
);

/**
 * i18n key for a card's header chip, under `dashboard.producer.edit_accordion`.
 *
 * Every card gets one. A chip that appeared only on required cards would make
 * "no chip" ambiguous between «optional» and «this card predates the feature»,
 * which is the same absence-vs-negative confusion the empty states had before
 * this change.
 */
export function chipKeyFor(anchorId) {
  return REQUIRED_ANCHORS.has(anchorId) ? "chip_required" : "chip_optional";
}
