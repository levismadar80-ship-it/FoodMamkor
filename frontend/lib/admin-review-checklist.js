// @ts-check
/**
 * Module:   admin-review-checklist
 * Purpose:  Static config for the pre-approval review checklist an admin runs
 *           before approving a pending producer (MEH-1396, Phase 1). Moves the
 *           per-document verification knowledge out of docs/VERIFICATION.md §2
 *           and in front of the admin at approval time.
 * Touches:  nothing — pure data + one copy helper. No API, no DB, no persistence.
 * Does NOT: gate approval. This is a SOFT checklist; ticks never block the
 *           request. The hard gates (photo 422 / license 422) stay server-side
 *           and are surfaced by use-admin-producers.js:122 — untouched here.
 *           Checkbox state is session-local (see use-review-checklist.js).
 * Related:  frontend/app/[locale]/admin/producers/AdminReviewChecklist.jsx,
 *           frontend/app/[locale]/admin/producers/use-review-checklist.js,
 *           docs/VERIFICATION.md §2 (source of the items).
 * History:  MEH-1396 (creation).
 *
 * MEH-3170: the rendered copy (the heading above the items and the
 * approve-confirm dialog) lives in messages/{he,en}.json under
 * `admin.producers.review.*`. What stays here is the 7-item seed below, which
 * is data, not rendered copy.
 */

// The 7 review items. `id` is a stable session-state key (never rendered);
// `label` + optional `hint` are the admin-facing Hebrew copy. Source: §2 of
// docs/VERIFICATION.md (per-document-type admin checklist), condensed into a
// single pre-approval pass.
export const ADMIN_REVIEW_CHECKLIST = [
  {
    id: "basics",
    label: "פרטים בסיסיים תקינים",
    hint: "שם, עיר, טלפון, קטגוריות, תיאור ברמת מגזין",
  },
  {
    id: "photos",
    label: "תמונות שייכות לעסק ואיכותיות",
    hint: "חשד לתמונת סטוק — בדקי חיפוש הפוך",
  },
  {
    id: "license",
    label: "רישיון הוצלב מול מאגר משרד הבריאות",
    hint: "שם תואם, מספר תואם, תוקף בתוקף",
  },
  {
    id: "kosher",
    label: "כשרות: תעודה נבדקה (אם הוצהרה)",
  },
  {
    id: "signals",
    label: "סימני חיים: אתר / אינסטגרם / גוגל תואמים לעסק",
  },
  {
    id: "call",
    label: "שיחה קצרה בוצעה (רק אם risk גבוה או ספק)",
  },
  {
    id: "decision",
    label: "החלטה מנומקת: אישור / השלמה / דחייה",
  },
];

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
