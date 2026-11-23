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
 * Related:  lib/recipe-draft.js (same shape, MEH-3740) ·
 *           backend/app/data/form_maps/event.json (the keys) ·
 *           lib/event-categories.js (the category wire values)
 * History:  MEH-3751 (creation)
 */

import { EVENT_CATEGORIES } from "@/lib/event-categories";

const TEXT_KEYS = ["title", "description", "location", "city", "event_date", "event_time", "end_time"];
const NUMBER_KEYS = ["price", "max_participants"];
const CATEGORIES = new Set(EVENT_CATEGORIES.map((c) => c.key));

/**
 * The form keys a draft fills, in form order.
 * @param {Record<string, unknown>} draft
 * @returns {string[]}
 */
export function eventDraftKeys(draft) {
  const keys = [];
  for (const key of TEXT_KEYS) {
    const value = draft[key];
    if (typeof value === "string" && value.trim()) keys.push(key);
  }
  if (typeof draft.category === "string" && CATEGORIES.has(draft.category)) keys.push("category");
  for (const key of NUMBER_KEYS) {
    const value = draft[key];
    if (typeof value === "number" && Number.isInteger(value)) keys.push(key);
  }
  return keys;
}

/**
 * @template {Record<string, any>} T
 * @param {T} form the form state
 * @param {Record<string, unknown>} draft the route's draft
 * @returns {T} the next form state
 */
export function applyEventDraft(form, draft) {
  /** @type {Record<string, any>} */
  const next = { ...form };
  for (const key of eventDraftKeys(draft)) {
    next[key] = NUMBER_KEYS.includes(key) ? String(draft[key]) : draft[key];
  }
  if (next.location !== form.location || next.city !== form.city) {
    next.lat = null;
    next.lng = null;
  }
  return /** @type {T} */ (next);
}
