// @ts-check
/**
 * Module:   use-orders-tab
 * Purpose:  Whether the dashboard shows the «הזמנות» tab, and its counter
 *           (orders waiting for an answer).
 * Touches:  GET /producers/me/order-settings (404 = ordering off on this
 *           server → no tab) · GET /producers/me/product-orders?status=pending.
 * Does NOT: read a build flag — the server's 404 is the one switch
 *           (lib/product-orders.js says why).
 * History:  MEH-3316 (creation; stage 4 of MEH-3216) · MEH-3526 (staff: no
 *           settings read — that route is the owner's; the tab is always there)
 */

import { useEffect, useState } from "react";
import { ORDERS_CHANGED_EVENT, loadSettings, pendingCount } from "@/lib/product-orders";

/**
 * @param {{ enabled: boolean, refreshKey: string, staff?: boolean }} options `enabled` false
 *   (an organizer, or no business yet) skips both requests. `staff` (MEH-3526):
 *   order staff, whose only screen IS the tab, read the counter alone.
 * @returns {{ visible: boolean, pending: number }}
 */
export function useOrdersTab({ enabled, refreshKey, staff = false }) {
  const [state, setState] = useState({ visible: false, pending: 0 });
  const [changes, setChanges] = useState(0);
  useEffect(() => {
    const bump = () => setChanges((n) => n + 1);
    window.addEventListener(ORDERS_CHANGED_EVENT, bump);
    return () => window.removeEventListener(ORDERS_CHANGED_EVENT, bump);
  }, []);
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    (async () => {
      const settings = staff ? true : await loadSettings();
      const pending = settings ? await pendingCount() : 0;
      if (live) setState({ visible: settings !== null, pending });
    })().catch(() => {});
    return () => {
      live = false;
    };
  }, [enabled, refreshKey, changes, staff]);
  return state;
}
