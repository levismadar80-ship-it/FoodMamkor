// @ts-check
// Producer status — render-only labels and color tokens.
// DB emits raw codes (draft / pending / approved / rejected / inactive — see
// backend/app/models/models.py). A sixth code, pending_whatsapp, was removed
// in MEH-2124. This module wraps rendering so UI never shows a raw code.
// Never mutate DB values here.
//
// MEH-3170: the labels live in messages/{he,en}.json under
// `admin.producers.status_label.<code>` (Hebrew נקבה; voice = warm + factual,
// not punitive). MEH-2126: `draft` is where every new registration starts
// since MEH-2100; its label «טיוטה» matches the «טיוטות» filter tab.

// Every status code that has a label. A code outside this list renders raw
// (the `?? status` net for a status added to the backend before the UI).
export const PRODUCER_STATUSES = ["draft", "pending", "approved", "rejected", "inactive"];

// Color tokens — verbatim from admin/producers/page.js:139-143 (pre-MEH-294).
// Single source of truth — admin chip imports these instead of inlining.
export const PRODUCER_STATUS_COLORS = {
  // MEH-2126: deliberately NOT `bg-gray-100` — that is the unknown-status
  // fallback below, so reusing it would make a known draft and an unrecognised
  // code look identical, which is half of what this entry exists to fix.
  // Distinct from `inactive`'s `bg-gray-200` for the same reason.
  draft: "bg-slate-100 text-slate-700",
  approved: "bg-primary text-white",
  pending: "bg-yellow-100 text-yellow-800",
  rejected: "bg-danger-100 text-danger-700",
  inactive: "bg-gray-200 text-gray-700",
};

/**
 * @param {string} status — raw DB code
 * @param {(key: string) => string} t — translator scoped to `admin`
 */
export function getProducerStatusLabel(status, t) {
  return PRODUCER_STATUSES.includes(status) ? t(`producers.status_label.${status}`) : status;
}

// The colour a status the map does not know falls back to. Named and exported
// because ProducerStatusLabelMap.test.js asserts that every KNOWN status
// resolves to something else — with the value hardcoded there, changing this
// fallback would leave the test green even if a known status started falling
// through to the new value. (CI review, MEH-2126.)
export const UNKNOWN_STATUS_COLOR = "bg-gray-100";

export function getProducerStatusColor(status) {
  return PRODUCER_STATUS_COLORS[status] ?? UNKNOWN_STATUS_COLOR;
}
