// @ts-check
/**
 * Module:   wizard-step-numbers
 * Purpose:  Turn a wizard's STEP enum into the numbers a user actually SEES.
 *           A step that is conditionally absent makes the enum value and the
 *           visible position diverge, and every number on screen must follow
 *           the position.
 * Does NOT: decide which steps exist, drive navigation, or touch i18n. The
 *           caller owns the visible-step list and passes approved copy in.
 * Related:  frontend/app/[locale]/register/producer/RegisterProducerClient.jsx
 *           (the only caller); frontend/messages/{he,en}.json
 *           `auth.register.producer.steps.*.title` (the approved headings whose
 *           digit renumberTitle swaps).
 * History:  MEH-0000 (creation — /register/organizer showed «01 02 04» in its
 *           stepper and jumped «2.» → «4.» in its headings, because both read
 *           the enum: an organizer never visits CATEGORY (MEH-2460). An upgrade
 *           starts past ACCOUNT, so its headings began at «2.».)
 */

/**
 * 1-based position of `step` among the steps this user sees, or 0 when the step
 * is not one of them.
 *
 * @param {ReadonlyArray<number>} visibleSteps steps in display order
 * @param {number} step a STEP enum value
 * @returns {number}
 */
export function stepNumberOf(visibleSteps, step) {
  return visibleSteps.indexOf(step) + 1;
}

/**
 * Swap the leading number of an approved heading for the real position.
 *
 * The approved strings carry their own number («4. הסיפור שלכם»), which is
 * wrong whenever a step is skipped. Only the DIGIT changes; the words are
 * returned untouched, so `he.json` / `en.json` stay exactly as approved and no
 * new copy is introduced. A title with no leading number comes back unchanged —
 * which is also what happens under the test mock that returns key paths.
 *
 * @param {string} title an approved step heading
 * @param {number} position the 1-based visible position
 * @returns {string}
 */
export function renumberTitle(title, position) {
  return String(title).replace(/^\s*\d+\.\s*/, `${position}. `);
}
