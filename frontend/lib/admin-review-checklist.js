// @ts-check
/**
 * Module:   admin-review-checklist
 * Purpose:  The one copy helper of the pre-approval review checklist: which
 *           approve-confirm message to show (MEH-2175).
 * Touches:  nothing — one pure function. No API, no DB, no persistence.
 * Does NOT: gate approval. This is a SOFT checklist; ticks never block the
 *           request. The hard gates (photo 422 / license 422) stay server-side
 *           and are surfaced by use-admin-producers.js:122 — untouched here.
 *           Checkbox state is session-local (see use-review-checklist.js).
 * Related:  frontend/app/[locale]/admin/producers/AdminReviewChecklist.jsx,
 *           frontend/app/[locale]/admin/producers/use-review-checklist.js,
 *           docs/VERIFICATION.md §2 (source of the items).
 * History:  MEH-1396 (creation); MEH-3170 (copy moved to messages);
 *           MEH-2954 (the dead 7-item array deleted).
 *
 * MEH-3170: the rendered copy (the heading above the items and the
 * approve-confirm dialog) lives in messages/{he,en}.json under
 * `admin.producers.review.*`.
 *
 * DO NOT add the checklist items back here — MEH-2954. They live in the
 * `admin_checklist_items` table (MEH-1399), seeded by migration d4a9c31e6f82
 * and edited by the admin in /admin/settings. An array here is a second owner
 * that nothing reads: editing it changes nothing in the product.
 */

/**
 * Approve-confirm dialog message (soft warning shown when items remain
 * unticked). MEH-2175: `count === null` means the checklist could not be
 * loaded, so there is no number to report and reporting one would be a
 * fabrication. The branch lives here rather than at the render site so the
 * dialog in admin/producers/page.js only asks this module what to say.
 *
 * @param {(key: string, values?: object) => string} t — translator scoped to
 *   `admin.producers.review.approve_confirm`
 * @param {number|null} count — unticked items, or null when the list is unknown
 */
export function approveConfirmMessage(t, count) {
  return count === null
    ? t("message_unavailable")
    : t("message", { count: String(count) });
}
