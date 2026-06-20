/**
 * Module:   event-categories
 * Purpose:  Single source of truth for the /events (6) and /experiences (7)
 *           category sets — previously duplicated across 5 call-sites in 4
 *           files (EventsClient, ExperiencesClient, the two create-forms).
 * Touches:  nothing — pure data. Labels resolve via next-intl
 *           `events.categories.*` / `experiences.categories.*`.
 * Does NOT: cover PRODUCER categories (that's lib/categories.js, MEH-472)
 *           nor own the category icon map (EventsClient.jsx CATEGORY_ICON).
 * Related:  frontend/app/[locale]/events/EventsClient.jsx (both filter sets),
 *           frontend/app/[locale]/experiences/ExperiencesClient.jsx (filter),
 *           frontend/app/[locale]/experiences/new/NewExperienceClient.jsx (form),
 *           frontend/app/[locale]/producer/dashboard/events/new/page.js (form).
 * History:  MEH-869 (creation, 2026-06-19 — DRY the duplicated arrays).
 */

// API filter/wire values are Hebrew strings (server-side enum). Keep `key`
// as the wire format; localize via the labelKey at render time. Base sets
// carry NO "all" entry — filters add it via withAll(); forms map key→value.
//
// MEH-869: DO NOT translate the `key` values — they're the backend's Hebrew
// enum wire format (Event.category / Experience.category String columns); the
// labelKey, not the key, is the i18n surface. If the server enum ever migrates
// to English keys, this is the single file to update.

// MEH-869: Object.freeze is shallow — it seals the array (no push/splice on the
// by-reference alias in page.js); the {key,labelKey} items stay mutable, but no
// consumer mutates them.
export const EVENT_CATEGORIES = Object.freeze([
  { key: "סדנה", labelKey: "workshop" },
  { key: "סיור", labelKey: "tour" },
  { key: "שוק", labelKey: "market" },
  { key: "קטיף", labelKey: "harvest" },
  { key: "טעימות", labelKey: "tasting" },
  { key: "אחר", labelKey: "other" },
]);

// Narrower set for community experiences — different vocabulary than the
// producer-farm events above.
export const EXPERIENCE_CATEGORIES = Object.freeze([
  { key: "בישול", labelKey: "cooking" },
  { key: "תזונה", labelKey: "nutrition" },
  { key: "סיור אוכל", labelKey: "food_tour" },
  { key: "חקלאות", labelKey: "agriculture" },
  { key: "טעימות", labelKey: "tasting" },
  { key: "סדנה", labelKey: "workshop" },
  { key: "אחר", labelKey: "other" },
]);

// Filter chip rows prepend an "all" option; create-form selects do not.
export function withAll(categories) {
  return [{ key: "", labelKey: "all" }, ...categories];
}
