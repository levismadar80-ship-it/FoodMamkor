"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { useOptionalAuth } from "@/lib/auth-context";

import RescueConfirmation from "@/components/rescue/RescueConfirmation";
import RescueReview from "@/components/rescue/RescueReview";
import {
  cancelOrder,
  fetchMyOrders,
  fetchOffers,
  israelTime,
  rescueBagsEnabled,
  reserveBag,
  reserveErrorKey,
  shekels,
} from "@/lib/rescue";

/**
 * Module:   RescueSection
 * Purpose:  The rescue-bag block on a business page — the only place a bag is
 *           reserved. Shows what is in it, what it costs AT THE COUNTER, and
 *           swaps itself for the confirmation the moment it is reserved.
 * Does NOT: take payment, and does not navigate anywhere to do so: there is no
 *           checkout page and no provider (03/11 pilot ruling). Reserve →
 *           confirmation, in place.
 * Related:  app/[locale]/producer/[id]/components/ProducerSections.jsx (slot,
 *           before section-products), lib/rescue.js
 * History:  MEH-2648 (creation)
 */
export default function RescueSection({ producer }) {
  const t = useTranslations("rescue");
  const [offer, setOffer] = useState(null);
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState(null);
  const [reviewed, setReviewed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // The public list is per-town; the business's own bag is whichever of
        // today's rows belongs to this producer.
        const rows = await fetchOffers({ city: producer?.city || undefined });
        if (!alive) return;
        setOffer(rows.find((row) => row.producer?.id === producer?.id) || null);
      } catch {
        if (alive) setOffer(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [producer?.id, producer?.city]);

  // MEH-2680: a reload must not lose the code. Read the buyer's own order on
  // this business's bag back from the server — matched on the producer, not
  // the offer, because the public list drops a sold-out offer and the buyer of
  // the last bag would otherwise lose hers. Re-read on focus so a bag the
  // business just marked handed brings up the review without a reload.
  // Guests are skipped: their 401 would end in the "session expired" toast.
  const userId = useOptionalAuth()?.user?.id;
  useEffect(() => {
    if (!rescueBagsEnabled() || !userId || !producer?.id) return undefined;
    let alive = true;
    async function restore() {
      try {
        const mine = await fetchMyOrders();
        if (!alive) return;
        // A buyer may hold two bags of one offer (the cap is per buyer per
        // offer, summed), e.g. one already handed and a newer one reserved:
        // the reserved one wins, because its code is what she still needs.
        const here = mine.filter((row) => row.producer_id === producer.id);
        const hit = here.find((row) => row.status === "reserved") || here[here.length - 1];
        if (hit) {
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
  }, [userId, producer?.id]);

  if (!rescueBagsEnabled()) return null;
  // No bag today is the ordinary case for most businesses most days, and it
  // renders nothing at all rather than an empty "no bags" shelf.
  if (!offer && !order) return null;

  async function reserve() {
    setBusy(true);
    setErrorKey(null);
    try {
      setOrder(await reserveBag({ offerId: offer.id }));
    } catch (err) {
      setErrorKey(reserveErrorKey(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      await cancelOrder(order.id);
      setOrder(null);
    } catch {
      setErrorKey("errors.generic");
    } finally {
      setBusy(false);
    }
  }

  const price = shekels(offer?.price_agorot);
  const from = israelTime(offer?.pickup_start);
  const until = israelTime(offer?.pickup_end);

  return (
    <section
      id="section-rescue"
      data-testid="rescue-section"
      className="mt-12 scroll-mt-[calc(var(--chrome-top,82px)_+_var(--section-nav-h,68px))] md:scroll-mt-24"
    >
      <h2 className="font-headline-md text-lg font-black text-text">{t("section.title")}</h2>

      {order ? (
        <div className="mt-3 space-y-4">
          <RescueConfirmation order={order} onCancel={cancel} cancelling={busy} />
          {/* The review only appears once the business marked it handed; the
              API refuses it before that with a 409, so showing it earlier
              would be a button that cannot work. */}
          {order.status === "handed" && !reviewed && (
            <RescueReview orderId={order.id} onDone={() => setReviewed(true)} />
          )}
          {reviewed && (
            <p className="font-body-sm text-sm text-fg-muted" data-testid="rescue-review-thanks">
              {t("review.thanks")}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-3 border border-border bg-surface-card rounded-md px-4 py-4 space-y-2">
          <p className="font-body-sm text-sm text-text" data-testid="rescue-section-stock">
            {t("row.left", { count: offer.qty_left })}
          </p>
          {from && until && (
            <p className="font-body-sm text-sm text-text" data-testid="rescue-section-pickup">
              {t("row.pickup", { from, until })}
            </p>
          )}
          {/* Full address: a live bag is the MEH-829 carve-out, and the point
              is exact-precision or the backend refuses the offer. */}
          {offer.producer?.location_address && (
            <p className="font-body-sm text-sm text-text" data-testid="rescue-section-address">
              {offer.producer.location_address}
              {offer.producer.location_city ? `, ${offer.producer.location_city}` : ""}
            </p>
          )}
          {offer.typical_items?.length > 0 && (
            <p className="font-body-sm text-sm text-fg-muted" data-testid="rescue-section-typical">
              {t("section.typical", { items: offer.typical_items.join(", ") })}
            </p>
          )}
          <p className="font-body-sm text-sm text-fg-muted" data-testid="rescue-section-allergens">
            {t("section.allergens")}
          </p>

          {errorKey && (
            <p className="font-body-sm text-sm text-error" data-testid="rescue-section-error">
              {t(errorKey)}
            </p>
          )}

          <button
            type="button"
            onClick={reserve}
            disabled={busy || offer.qty_left < 1}
            data-testid="rescue-reserve"
            className="w-full bg-primary text-white py-3 rounded-md font-medium disabled:opacity-50 hover:bg-primary-dark transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {t("section.cta", { price })}
          </button>
          <p className="font-body-sm text-sm text-fg-muted text-center" data-testid="rescue-section-terms">
            {t("confirm.terms", { cancel_until: israelTime(offer.cancel_until) })}
          </p>
        </div>
      )}
    </section>
  );
}
