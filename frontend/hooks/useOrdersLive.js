// @ts-check
"use client";

/**
 * Module:   hooks/useOrdersLive
 * Purpose:  Keep an open «הזמנות» tab current (MEH-3964): once a minute while
 *           the tab is visible, and once when it comes back into view, read
 *           the pending orders (one request); reload the board only when that
 *           set changed. The browser tab title carries «(N) » while N orders
 *           wait for an answer, the way Gmail and WhatsApp Web count unread.
 * Does NOT: play a sound or send a push — a sound needs a tap on the page
 *           first, and push is MEH-3134. Does not poll a hidden tab.
 * History:  MEH-3964 (creation).
 */

import { useEffect, useRef } from "react";
import { loadOrders, loadPendingPage } from "@/lib/product-orders";

const CHECK_EVERY_MS = 60_000;
const COUNT_PREFIX = /^\(\d+\) /;

/** The title with «(N) » in front, or none at 0; an older count is replaced.
 * @param {string} title @param {number} count */
export function pendingTitle(title, count) {
  const base = title.replace(COUNT_PREFIX, "");
  return count > 0 ? `(${count}) ${base}` : base;
}

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

/**
 * @param {any[] | null} orders the board's orders; null until the first load
 * @param {(orders: any[]) => void} onFresh gets the whole reloaded list
 */
export default function useOrdersLive(orders, onFresh) {
  const known = useRef(/** @type {Set<string | number>} */ (new Set()));
  const fresh = useRef(onFresh);
  fresh.current = onFresh;
  const loaded = orders !== null;
  known.current = loaded ? pendingIds(orders) : new Set();
  const count = known.current.size;

  useEffect(() => {
    document.title = pendingTitle(document.title, count);
  }, [count]);
  useEffect(() => () => {
    document.title = pendingTitle(document.title, 0);
  }, []);

  useEffect(() => {
    if (!loaded) return undefined;
    let live = true;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const page = await loadPendingPage();
        if (live && changed(page, known.current)) {
          const all = await loadOrders();
          if (live) fresh.current(all);
        }
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
