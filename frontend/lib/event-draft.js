// @ts-check
/**
 * Module:   event-draft
 * Purpose:  Put a «יש לכם מודעה על האירוע?» draft (MEH-3751) into the event
 *           form's state: a field the draft fills replaces the form's value,
 *           a field it leaves empty keeps what the owner already typed.
 * Does NOT: call the server or save (components/FormFillBox.jsx reads,
 *           EventForm saves through POST /events); geocode — a drafted
 *           address clears lat/lng, so the pin of a saved point is never
 *           kept under an address that is no longer it.
 * Related:  lib/form-draft.js (the shared field rule) ·
 *           backend/app/data/form_maps/event.json (the keys) ·
 *           lib/event-categories.js (the category wire values)
 * History:  MEH-3751 (creation)
 */

import { EVENT_CATEGORIES } from "@/lib/event-categories";
import { applyDraftFields, filledKeys } from "@/lib/form-draft";

const KEYS = {
  text: ["title", "description", "location", "city", "event_date", "event_time", "end_time"],
  number: ["price", "max_participants"],
};
const CATEGORIES = new Set(EVENT_CATEGORIES.map((c) => c.key));

/**
 * The form keys a draft fills.
 * @param {Record<string, unknown>} draft
 * @returns {string[]}
 */
export function eventDraftKeys(draft) {
  const category = typeof draft.category === "string" && CATEGORIES.has(draft.category);
  return [...filledKeys(draft, KEYS), ...(category ? ["category"] : [])];
}

/**
 * @template {Record<string, any>} T
 * @param {T} form the form state
 * @param {Record<string, unknown>} draft the route's draft
 * @returns {T} the next form state
 */
export function applyEventDraft(form, draft) {
  /** @type {Record<string, any>} */
  const next = applyDraftFields(form, draft, KEYS);
  if (eventDraftKeys(draft).includes("category")) next.category = draft.category;
  if (next.location !== form.location || next.city !== form.city) {
    next.lat = null;
    next.lng = null;
  }
  return /** @type {T} */ (next);
}
