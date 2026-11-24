// @ts-check

/**
 * Module:   my-orders-nav-cache
 * Purpose:  MEH-3698 — the session cache key of the «ההזמנות שלי» menu gate,
 *           and the one call that drops it after an order, a group-buy join
 *           or a bag reservation.
 * Does NOT: ask the server or hold React state — lib/use-my-orders-nav-gate.js
 *           does. Kept apart (no "use client", no React) so lib/rescue.js and
 *           lib/order-sheet.js can import it whoever imports them.
 * History:  MEH-3698 (creation)
 */

export const MY_ORDERS_NAV_CACHE_KEY = "meh_my_orders_nav";
// Header and AccountSheet stay mounted across client navigations, so they
// listen for this and ask again.
export const MY_ORDERS_CHANGED_EVENT = "meh:my-orders-changed";

/** The cached «nothing to show» is wrong now: drop it, and tell the menus. */
export function clearMyOrdersNavGate() {
  try {
    sessionStorage.removeItem(MY_ORDERS_NAV_CACHE_KEY);
  } catch {
    // Caching is an optimisation.
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(MY_ORDERS_CHANGED_EVENT));
}
