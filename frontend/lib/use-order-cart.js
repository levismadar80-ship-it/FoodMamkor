// @ts-check
"use client";
/**
 * Module:   use-order-cart
 * Purpose:  The buyer's picks on one business page, held by ProducerDetail so
 *           the product rows and the order bar read the same state.
 * Touches:  GET /producers/{id}/order-menu, once per business, and only when
 *           the page payload says `takes_site_orders`; inside the owner's
 *           preview GET /producers/me/order-menu/preview instead (MEH-3746).
 * Does NOT: persist — the picks live in memory and a reload starts empty.
 *           The one hand-off in is «להזמין שוב» (lib/order-again.js): a
 *           stash left by the order page, merged once when the menu loads.
 * Related:  lib/order-cart.js (the pure helpers this wraps)
 * History:  MEH-3216 stage 5b (creation); MEH-3746 (inside the owner's
 *           preview: her own menu, read even while ordering is off);
 *           MEH-3764 («להזמין שוב» hand-off)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { applyOrderAgain, takeOrderAgain } from "@/lib/order-again";
import { showToast } from "@/lib/toast";
import { keepOrderable, loadOrderMenu, loadOwnerMenuPreview, pickedCount, pickedTotalAgorot, setQty } from "@/lib/order-cart";
import { useOwnerOrderMenu } from "@/lib/preview-mode";

/** @typedef {import("@/lib/order-cart").OrderMenu} OrderMenu */
/** @typedef {import("@/lib/order-cart").MenuProduct} MenuProduct */

/**
 * @typedef {{
 *   menu: OrderMenu | null,
 *   byId: Map<string, MenuProduct>,
 *   picks: Record<string, number>,
 *   change: (id: string, qty: number) => void,
 *   reload: () => void,
 *   count: number,
 *   totalAgorot: number,
 * }} OrderCart
 */

/**
 * The one toast that says what «להזמין שוב» put in the cart.
 * @param {(key: string, values?: Record<string, string>) => string} t
 * @param {{ added: number, skipped: string[] }} result
 */
function orderAgainToast(t, { added, skipped }) {
  if (added === 0) showToast.info(t("none_available"));
  else if (skipped.length > 0) showToast.info(t("added_some", { names: skipped.join(", ") }));
  else showToast.success(t("added_all"));
}

/** @type {Record<string, number>} */
const NO_PICKS = Object.freeze({});

/**
 * @param {{ id?: string, takes_site_orders?: boolean } | null | undefined} producer
 * @returns {OrderCart}
 */
export function useOrderCart(producer) {
  const t = useTranslations("order_again");
  const producerId = producer?.id;
  // MEH-3746: the owner's preview shows the order form before ordering is on.
  // Only where the page opts in (OrderPreviewClient), never from preview mode
  // alone: the draft-preview page has no owner session (fresh review).
  const preview = useOwnerOrderMenu();
  const takesOrders = preview || Boolean(producer?.takes_site_orders);
  const [menu, setMenu] = useState(/** @type {OrderMenu | null} */ (null));
  const [picks, setPicks] = useState(/** @type {Record<string, number>} */ ({}));
  // Bumped to read the menu again: the order sheet does it when the server
  // says a pick is no longer orderable, so the sold-out line drops out of the
  // picks and the page shows «אזל להיום» (fresh review of #4837).
  const [generation, setGeneration] = useState(0);
  const reload = useCallback(() => setGeneration((n) => n + 1), []);

  useEffect(() => {
    // Nothing to read: what is returned below is empty while the business
    // takes no orders, so no state is reset here.
    if (!producerId || !takesOrders) return undefined;
    let live = true;
    (preview ? loadOwnerMenuPreview() : loadOrderMenu(producerId)).then((read) => {
      if (!live) return;
      // The owner route answers for HER business; a page of another business
      // never shows her menu.
      const loaded = read && read.producer_id === producerId ? read : null;
      setMenu(loaded);
      // MEH-3764: read after the menu, so a stash is spent only once it can be
      // checked against what is orderable now.
      const stash = loaded ? takeOrderAgain(producerId) : null;
      const kept = (/** @type {Record<string, number>} */ current) => (loaded ? keepOrderable(current, loaded.products) : {});
      if (!stash || !loaded) {
        setPicks(kept);
        return;
      }
      // The toast is worked out against an empty cart: a stash is read on the
      // first menu load after the order page sent her here, before any pick
      // could be made (picking needs the menu). The cart itself merges into
      // whatever it holds, to stay right if that ever changes.
      setPicks((current) => applyOrderAgain(kept(current), stash.lines, loaded.products).picks);
      orderAgainToast(t, applyOrderAgain({}, stash.lines, loaded.products));
    });
    return () => {
      live = false;
    };
    // `t` is read, not reacted to: a locale switch must not re-read the menu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [producerId, takesOrders, preview, generation]);

  // MEH-3764: «להזמין שוב» to a business that stopped taking site orders.
  // The button opens /producer/{id}, which reads the business fresh in the
  // browser, so a cached `takes_site_orders` (the /[slug] page's 60 s) is not
  // what decides this toast.
  useEffect(() => {
    if (!producerId || takesOrders) return;
    if (takeOrderAgain(producerId)) showToast.info(t("not_taking"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [producerId, takesOrders]);

  const open = takesOrders ? menu : null;
  const shown = open ? picks : NO_PICKS;
  const byId = useMemo(() => new Map((open?.products ?? []).map((p) => [p.id, p])), [open]);
  const change = useCallback((/** @type {string} */ id, /** @type {number} */ qty) => {
    setPicks((current) => setQty(current, { id, qty }));
  }, []);

  return {
    menu: open,
    byId,
    picks: shown,
    change,
    reload,
    count: pickedCount(shown),
    totalAgorot: open ? pickedTotalAgorot(shown, open.products) : 0,
  };
}
