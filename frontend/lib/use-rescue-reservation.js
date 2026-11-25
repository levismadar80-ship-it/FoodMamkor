// @ts-check
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useOptionalAuth } from "@/lib/auth-context";
import { isUnverifiedEmailError } from "@/lib/errors";
import {
  bagDay,
  cancelErrorKey,
  cancelOrder,
  fetchMyOrders,
  rescueBagsEnabled,
  reserveBag,
  reserveErrorKey,
} from "@/lib/rescue";

export const UNVERIFIED_KEY = "errors.unverified";

/**
 * Module:   use-rescue-reservation
 * Purpose:  The buyer's side of one business's surprise bag — reserve, read
 *           the reservation back after a reload, cancel, and settle a 409 by
 *           asking the server what happened. One copy, used by the bag block
 *           on the business page and by the bag's own page.
 * Does NOT: render anything, or fetch the offer itself: each caller reads the
 *           offer its own way (by business on the business page, by id on
 *           the bag page) and passes `onCancelled` to re-read it.
 * Related:  app/[locale]/rescue/[offerId]/RescueOfferPage.jsx (its only
 *           user since the business-page card became a link), lib/rescue.js
 * History:  MEH-3586 (moved out of RescueSection unchanged: MEH-2680 read-back,
 *           MEH-2700 guest prompt, MEH-2737 cancel, MEH-2738 business cancel,
 *           MEH-3225 unverified email, MEH-3130 login modal) · MEH-3702 (which
 *           day's bag the business cancelled: `businessCancelledDay`)
 *
 * `offerId` (the bag page): read back only orders on THAT bag. A business
 * with two pickup points can have two bags a day, and the page of bag B must
 * not show the code of bag A. The business page passes none and keeps
 * matching on the business, which is what lets the buyer of the last bag find
 * hers after the list dropped it.
 *
 * @param {{ producerId?: string|null, offerId?: string|null, onCancelled?: () => void }} args
 */
export default function useRescueReservation({ producerId, offerId = null, onCancelled }) {
  const [order, setOrder] = useState(/** @type {any} */ (null));
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState(/** @type {string|null} */ (null));
  // MEH-3130: a guest's tap opens the shared login prompt.
  const [loginOpen, setLoginOpen] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  // MEH-2737: shown once the cancel went through, until the next reserve.
  const [cancelled, setCancelled] = useState(false);
  // MEH-2738: the business cancelled today's bag, and hers with it.
  const [businessCancelled, setBusinessCancelled] = useState(false);
  // MEH-3702: «היום» or «מחר» in that notice — the cancelled bag's own day.
  const [businessCancelledDay, setBusinessCancelledDay] = useState(/** @type {"today"|"tomorrow"} */ ("today"));
  const onCancelledRef = useRef(onCancelled);
  onCancelledRef.current = onCancelled;

  // MEH-2680: a reload must not lose the code. Read the buyer's own order on
  // this business's bag back from the server — matched on the producer, not
  // the offer, because the public list drops a sold-out offer and the buyer of
  // the last bag would otherwise lose hers. Re-read on focus so a bag the
  // business just marked handed brings up the review without a reload.
  // Guests are skipped: their 401 would end in the "session expired" toast.
  const auth = useOptionalAuth();
  const userId = auth?.user?.id;
  useEffect(() => {
    if (!rescueBagsEnabled() || !userId || !producerId) return undefined;
    let alive = true;
    async function restore() {
      try {
        const mine = await fetchMyOrders();
        if (!alive) return;
        // A buyer may hold two bags of one offer, e.g. one already handed and
        // a newer one reserved: the reserved one wins, because its code is
        // what she still needs. MEH-2738: a live one always wins over a
        // business-cancelled one; only when none is left does the page say
        // the business cancelled. A buyer's own cancel is never in the list.
        const here = mine.filter(
          (row) => row.producer_id === producerId && (!offerId || row.offer_id === offerId),
        );
        const live = here.filter((row) => row.status !== "cancelled");
        const hit = live.find((row) => row.status === "reserved") || live[live.length - 1];
        const byBusiness = here.find((row) => row.cancelled_by_business);
        if (!hit && byBusiness) {
          setOrder(null);
          // eslint-disable-next-line no-restricted-syntax -- MEH-3861: in the reservations fetch's callback, after the load
          setBusinessCancelledDay(bagDay(byBusiness.date));
          setBusinessCancelled(true);
          return;
        }
        if (hit) {
          setBusinessCancelled(false);
          setOrder(hit);
          // Never un-review: a read that left before a just-sent review must
          // not bring the form back.
          setReviewed((was) => was || hit.reviewed);
        }
      } catch {
        // A failed read-back leaves whatever the page already shows.
      }
    }
    restore();
    window.addEventListener("focus", restore);
    return () => {
      alive = false;
      window.removeEventListener("focus", restore);
    };
  }, [userId, producerId, offerId]);

  /** @param {string} offerId */
  async function reserve(offerId) {
    // MEH-2700: a known guest gets the sign-in prompt straight away. Sending
    // the request would 401, and the refresh interceptor would then add its
    // "session expired" toast — wrong for someone who never signed in.
    if (auth && !auth.loading && !auth.user) {
      setErrorKey(null);
      setLoginOpen(true);
      return;
    }
    setBusy(true);
    setErrorKey(null);
    setCancelled(false);
    setBusinessCancelled(false);
    try {
      setOrder(await reserveBag({ offerId }));
    } catch (err) {
      // MEH-3225: an unverified account gets the resend notice, not a dead end.
      setErrorKey(isUnverifiedEmailError(err) ? UNVERIFIED_KEY : reserveErrorKey(err));
    } finally {
      setBusy(false);
    }
  }

  const showCancelled = useCallback(() => {
    setOrder(null);
    setCancelled(true);
    // The bag went back on the list: the caller re-reads it, so the stock is
    // right — and it reappears if hers was the last one.
    onCancelledRef.current?.();
  }, []);

  /** True when the server's own state explains the 409 and is now shown. */
  async function settleAfterConflict(orderId) {
    let mine;
    try {
      mine = await fetchMyOrders();
    } catch {
      return false;
    }
    const row = mine.find((r) => r.id === orderId);
    if (!row) {
      // Not in the list = the buyer's own cancel went through earlier.
      showCancelled();
      return true;
    }
    if (row.cancelled_by_business) {
      setOrder(null);
      // eslint-disable-next-line no-restricted-syntax -- MEH-3861: in the reservations fetch's callback, after the load
      setBusinessCancelledDay(bagDay(row.date));
      setBusinessCancelled(true);
      return true;
    }
    if (row.status === "handed") {
      setOrder(row);
      setReviewed((was) => was || row.reviewed);
      return true;
    }
    return false;
  }

  async function cancel() {
    if (!order) return;
    setBusy(true);
    setErrorKey(null);
    try {
      await cancelOrder(order.id);
      showCancelled();
    } catch (err) {
      const key = cancelErrorKey(err, order.cancel_until);
      // MEH-2738: a 409 before the cutoff means the order is no longer
      // reserved — cancelled in another tab, cancelled by the business, or
      // handed meanwhile. Ask the server which, instead of «משהו נתקע».
      if (key === "errors.generic" && err?.response?.status === 409 && (await settleAfterConflict(order.id))) {
        return;
      }
      setErrorKey(key);
    } finally {
      setBusy(false);
    }
  }

  return {
    order,
    busy,
    errorKey,
    loginOpen,
    setLoginOpen,
    reviewed,
    setReviewed,
    cancelled,
    businessCancelled,
    businessCancelledDay,
    reserve,
    cancel,
  };
}
