// @ts-check
/**
 * Module:   order-setup-draft
 * Purpose:  Put a «ספרו לנו איך אתם מקבלים הזמנות» draft (MEH-3752) into the
 *           three order-setup cards: the settings numbers, the weekly
 *           hand-over windows and the products open to order. A field the
 *           draft fills replaces the card's value; one it leaves empty keeps
 *           what is there.
 * Does NOT: touch «לקבל הזמנות באתר», auto-confirm or the business ID — the
 *           owner sets those herself (the draft never carries them, and this
 *           file would not read them if it did); save (each card saves
 *           through its own route when she presses its button).
 * Related:  lib/form-draft.js (the shared rule) ·
 *           backend/app/data/form_maps/order_setup.json (the keys) ·
 *           components/dashboard/orders/OrderSettingsCard.jsx,
 *           OrderWindowsCard.jsx, OrderProductsCard.jsx
 * History:  MEH-3752 (creation)
 */

import { filledKeys } from "@/lib/form-draft";

const NUMBERS = ["slot_cap", "cancel_cutoff_hours", "min_order", "slot_minutes", "lead_time_hours"];

/**
 * The settings form after the draft: the cap and the minimum as the strings
 * their inputs hold, the three timings as numbers.
 * @template {Record<string, any>} T
 * @param {T} form OrderSettingsCard's form state
 * @param {Record<string, unknown>} draft
 * @returns {T}
 */
export function applySettingsDraft(form, draft) {
  /** @type {Record<string, any>} */
  const next = { ...form };
  const filled = new Set(filledKeys(draft, { number: NUMBERS }));
  if (filled.has("slot_cap")) next.cap = String(draft.slot_cap);
  if (filled.has("min_order")) next.minimum = String(draft.min_order);
  for (const key of ["cancel_cutoff_hours", "slot_minutes", "lead_time_hours"]) {
    if (filled.has(key)) next[key] = draft[key];
  }
  return /** @type {T} */ (next);
}

/**
 * The drafted week, or null when the draft has none (the card keeps its rows).
 * @param {Record<string, unknown>} draft
 * @returns {{ weekday: number, start_time: string, end_time: string, fulfilment: string }[] | null}
 */
export function draftWindows(draft) {
  const rows = Array.isArray(draft.windows) ? draft.windows : [];
  return rows.length ? rows.map((row) => ({ ...row })) : null;
}

/**
 * The product ids the draft opens for ordering.
 * @param {Record<string, unknown>} draft
 * @returns {string[]}
 */
export function draftProductIds(draft) {
  return Array.isArray(draft.product_ids) ? draft.product_ids.map(String) : [];
}
