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
 * Raw-Hebrew static config — same idiom as frontend/lib/producer-status.js
 * (admin-internal, single-language; deliberately no i18n / en.json twin).
 */

// Heading rendered above the checklist items.
export const ADMIN_REVIEW_CHECKLIST_TITLE = "רשימת בדיקה לפני אישור";

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

// Approve-confirm dialog copy (soft warning shown when items remain unticked).
// `message` interpolates the remaining count; the buttons are fixed labels.
export const ADMIN_REVIEW_APPROVE_CONFIRM = {
  message: (count) =>
    `נשארו ${count} סעיפים לא מסומנים ברשימת הבדיקה. לאשר בכל זאת?`,
  confirmLabel: "אשרי בכל זאת",
  cancelLabel: "חזרה לבדיקה",
};
