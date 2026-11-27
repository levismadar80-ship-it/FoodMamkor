// @ts-check
"use client";

/**
 * Module:   hooks/useOrdersLive
 * Purpose:  Keep an open «הזמנות» tab current (MEH-3964): once a minute while
 *           the tab is visible, and once when it comes back into view, read
 *           the pending orders (one request); reload the board only when that
 *           set changed, then tell the layout (ORDERS_CHANGED_EVENT) so the
 *           tab badge and the «(N) » title prefix (use-dashboard-title) follow.
 * Does NOT: play a sound or send a push — a sound needs a tap on the page
 *           first, and push is MEH-3134. Does not poll a hidden tab. Never
 *           swaps the board under an open dialog or over a newer local change.
 * History:  MEH-3964 (creation).
 */

import { useEffect, useRef } from "react";
import { loadOrders, loadPendingPage } from "@/lib/product-orders";

const CHECK_EVERY_MS = 60_000;

/** @param {any[]} orders */
function pendingIds(orders) {
  return new Set(orders.filter((o) => o.status === "pending").map((o) => o.id));
}

/** Changed = a different count, or an id on the first page the board lacks.
 * A count over one page (50) still compares right, without reading it all.
 * @param {{ total: number, orders: any[] }} page @param {Set<string | number>} known */
function changed(page, known) {
  return page.total !== known.size || page.orders.some((o) => !known.has(o.id));
}

/** A confirm, decline or propose dialog is open: her typed note must not vanish. */
const dialogOpen = () => document.querySelector('[role="dialog"], [role="alertdialog"], dialog[open]') !== null;

/**
 * @param {any[] | null} orders the board's orders; null until the first load
 * @param {(orders: any[]) => void} onFresh gets the whole reloaded list
 */
export default function useOrdersLive(orders, onFresh) {
  const known = useRef(/** @type {Set<string | number>} */ (new Set()));
  const fresh = useRef(onFresh);
  // Bumped whenever the board's list changes (her own confirm, a dialog's
  // answer): a reload that started before it is older than the screen.
  const epoch = useRef(0);
  const seen = useRef(orders);
  fresh.current = onFresh;
  if (orders !== seen.current) {
    seen.current = orders;
    epoch.current += 1;
  }
  const loaded = orders !== null;
  known.current = loaded ? pendingIds(orders) : new Set();

  useEffect(() => {
    if (!loaded) return undefined;
    let live = true;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== "visible" || dialogOpen()) return;
      busy = true;
      try {
        const started = epoch.current;
        const page = await loadPendingPage();
        if (!live || !changed(page, known.current)) return;
        const all = await loadOrders();
        // A newer local change or an opened dialog wins; the next check retries.
        if (live && epoch.current === started && !dialogOpen()) fresh.current(all);
      } catch {
        // Offline or a hiccup: the board stays as it is until the next check.
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(check, CHECK_EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loaded]);
}
