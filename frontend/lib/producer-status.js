// Producer status — render-only labels and color tokens.
// DB emits raw codes (draft / pending / approved / rejected / inactive — see
// backend/app/models/models.py). A sixth code, pending_whatsapp, was removed
// in MEH-2124. This module wraps rendering so UI never shows a raw code.
// Never mutate DB values here.
//
// Hebrew נקבה. Voice = warm + factual (not punitive); see CLAUDE.md.

export const PRODUCER_STATUS_LABELS = {
  // MEH-2126: `draft` has been where every new registration starts since
  // MEH-2100, and it was the ONLY status value missing from this map — so the
  // admin chip fell through to the `?? status` fallback and rendered the raw
  // English code in a Hebrew table. Copy is Sapir's (rule 22): "טיוטה",
  // matching the "טיוטות" filter tab so the chip and the tab name agree.
  draft: "טיוטה",
  pending: "ממתינה לאישור האדמין",
  approved: "מאושר",
  rejected: "נדחה",
  inactive: "לא פעילה",
};

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
  rejected: "bg-red-100 text-red-700",
  inactive: "bg-gray-200 text-gray-700",
};

export function getProducerStatusLabel(status) {
  return PRODUCER_STATUS_LABELS[status] ?? status;
}

export function getProducerStatusColor(status) {
  return PRODUCER_STATUS_COLORS[status] ?? "bg-gray-100";
}
