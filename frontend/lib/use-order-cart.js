// @ts-check
"use client";
/**
 * Module:   use-order-cart
 * Purpose:  The buyer's picks on one business page, held by ProducerDetail so
 *           the product rows and the order bar read the same state.
 * Touches:  GET /producers/{id}/order-menu, once per business, and only when
 *           the page payload says `takes_site_orders`.
 * Does NOT: persist — the picks live in memory and a reload starts empty.
 * Related:  lib/order-cart.js (the pure helpers this wraps)
 * History:  MEH-3216 stage 5b (creation)
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { keepOrderable, loadOrderMenu, pickedCount, pickedTotalAgorot, setQty } from "@/lib/order-cart";

/** @typedef {import("@/lib/order-cart").OrderMenu} OrderMenu */
/** @typedef {import("@/lib/order-cart").MenuProduct} MenuProduct */

/**
 * @typedef {{
 *   menu: OrderMenu | null,
 *   byId: Map<string, MenuProduct>,
 *   picks: Record<string, number>,
 *   change: (id: string, qty: number) => void,
 *   count: number,
 *   totalAgorot: number,
 * }} OrderCart
 */

/**
 * @param {{ id?: string, takes_site_orders?: boolean } | null | undefined} producer
 * @returns {OrderCart}
 */
export function useOrderCart(producer) {
  const producerId = producer?.id;
  const takesOrders = Boolean(producer?.takes_site_orders);
  const [menu, setMenu] = useState(/** @type {OrderMenu | null} */ (null));
  const [picks, setPicks] = useState(/** @type {Record<string, number>} */ ({}));

  useEffect(() => {
    if (!producerId || !takesOrders) {
      setMenu(null);
      return undefined;
    }
    let live = true;
    loadOrderMenu(producerId).then((loaded) => {
      if (!live) return;
      setMenu(loaded);
      setPicks((current) => (loaded ? keepOrderable(current, loaded.products) : {}));
    });
    return () => {
      live = false;
    };
  }, [producerId, takesOrders]);

  const byId = useMemo(() => new Map((menu?.products ?? []).map((p) => [p.id, p])), [menu]);
  const change = useCallback((/** @type {string} */ id, /** @type {number} */ qty) => {
    setPicks((current) => setQty(current, { id, qty }));
  }, []);

  return {
    menu,
    byId,
    picks,
    change,
    count: pickedCount(picks),
    totalAgorot: menu ? pickedTotalAgorot(picks, menu.products) : 0,
  };
}
