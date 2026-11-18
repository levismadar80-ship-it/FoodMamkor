// @ts-check
/**
 * Module:   use-orders-tab
 * Purpose:  Whether the dashboard shows the «הזמנות» tab, and its counter
 *           (orders waiting for an answer).
 * Touches:  GET /producers/me/order-settings (404 = ordering off on this
 *           server → no tab) · GET /producers/me/product-orders?status=pending.
 * Does NOT: read a build flag — the server's 404 is the one switch
 *           (lib/product-orders.js says why).
 * History:  MEH-3316 (creation; stage 4 of MEH-3216)
 */

import { useEffect, useState } from "react";
import { loadSettings, pendingCount } from "@/lib/product-orders";

/**
 * @param {{ enabled: boolean, refreshKey: string }} options `enabled` false
 *   (an organizer, or no business yet) skips both requests.
 * @returns {{ visible: boolean, pending: number }}
 */
export function useOrdersTab({ enabled, refreshKey }) {
  const [state, setState] = useState({ visible: false, pending: 0 });
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    (async () => {
      const settings = await loadSettings();
      const pending = settings ? await pendingCount() : 0;
      if (live) setState({ visible: settings !== null, pending });
    })().catch(() => {});
    return () => {
      live = false;
    };
  }, [enabled, refreshKey]);
  return state;
}
