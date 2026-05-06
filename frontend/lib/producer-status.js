// Producer status — render-only labels and color tokens.
// DB emits raw codes (pending_whatsapp / pending / approved / rejected /
// inactive — see backend/app/models/models.py:62). This module wraps
// rendering so UI never shows a raw code. Never mutate DB values here.
//
// Hebrew נקבה. Voice = warm + factual (not punitive); see CLAUDE.md.

export const PRODUCER_STATUS_LABELS = {
  pending_whatsapp: "ממתינה לאימות WhatsApp",
  pending: "ממתינה לאישור האדמין",
  approved: "מאושר",
  rejected: "נדחה",
  inactive: "לא פעילה",
};

// Color tokens — verbatim from admin/producers/page.js:139-143 (pre-MEH-294).
// Single source of truth — admin chip imports these instead of inlining.
export const PRODUCER_STATUS_COLORS = {
  approved: "bg-primary text-white",
  pending: "bg-yellow-100 text-yellow-800",
  pending_whatsapp: "bg-orange-100 text-orange-800",
  rejected: "bg-red-100 text-red-700",
  inactive: "bg-gray-200 text-gray-700",
};

// SEPARATOR CONTRACT: dashboard JSX splits on " — " (em-dash with spaces).
// If you change the separator here, update producer/dashboard/page.js too.
export const PENDING_WHATSAPP_COMPANION_COPY =
  "לא קיבלת הודעה? השלימי את הפרופיל כאן — עריכת פרופיל";

export function getProducerStatusLabel(status) {
  return PRODUCER_STATUS_LABELS[status] ?? status;
}

export function getProducerStatusColor(status) {
  return PRODUCER_STATUS_COLORS[status] ?? "bg-gray-100";
}
