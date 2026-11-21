// @ts-check
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Basket, Clock, MapPin, Bread } from "@phosphor-icons/react";

import RescueConfirmation from "@/components/rescue/RescueConfirmation";
import RescueReview from "@/components/rescue/RescueReview";
import { fetchOffers, israelTime, rescueBagsEnabled, shekels, worthAgorot } from "@/lib/rescue";
import useRescueReservation from "@/lib/useRescueReservation";
import RescueErrorLine from "@/components/rescue/RescueErrorLine";
import Button from "@/components/ui/Button";
import { RESCUE_SECTION_ID, rescueOfferPath } from "@/lib/producer-path";
import SectionHeading from "@/components/ui/SectionHeading";
import LoginPromptModal from "@/components/LoginPromptModal";

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
 * History:  MEH-2648 (creation) · MEH-2713 (icon-row card: price up top,
 *           one short cancel line, allergens folded) · MEH-2737 (a cancel
 *           says it worked, or why not; past the cutoff the card says the bag
 *           can no longer be cancelled) · MEH-2738 (says when the business
 *           cancelled the bag) · MEH-3586 (reserve/cancel state moved to
 *           lib/useRescueReservation, shared with the bag page)
 */

export default function RescueSection({ producer }) {
  const t = useTranslations("rescue");
  // Allergen labels come from the product sheet's vocabulary (MEH-2662), so
  // the bag and a product never name the same allergen differently.
  const tProducts = useTranslations("settings.products.form");
  const [offer, setOffer] = useState(null);
  const landedOnHash = useRef(false);

  // Older links (shared, or sent before MEH-3586 moved the bag row and home
  // card to the bag page) land here as `/{slug}#section-rescue`. This
  // section mounts only after its own offer fetch, i.e. after both the
  // browser's native hash scroll and ProducerDetail's MEH-1306 re-apply have
  // run against a DOM without it. Scroll once when the bag appears.
  useEffect(() => {
    if (!offer || landedOnHash.current) return;
    landedOnHash.current = true;
    if (window.location.hash !== `#${RESCUE_SECTION_ID}`) return;
    requestAnimationFrame(() => {
      document.getElementById(RESCUE_SECTION_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [offer]);

  // The public list is per-town; the business's own bag is whichever of
  // today's rows belongs to this producer. A failed read keeps the card as it
  // was when `keepOnError` (the re-read after a cancel).
  const loadOffer = useCallback(
    (keepOnError = false) =>
      fetchOffers({ city: producer?.city || undefined })
        .then((rows) => rows.find((row) => row.producer?.id === producer?.id) || null)
        .then(setOffer)
        .catch(() => {
          if (!keepOnError) setOffer(null);
        }),
    [producer?.id, producer?.city],
  );
  useEffect(() => {
    loadOffer();
  }, [loadOffer]);

  // MEH-3586: reserve / read-back / cancel live in one hook, shared with the
  // bag's own page.
  const {
    order, busy, errorKey, loginOpen, setLoginOpen, reviewed, setReviewed,
    cancelled, businessCancelled, reserve, cancel,
  } = useRescueReservation({ producerId: producer?.id, onCancelled: () => loadOffer(true) });

  if (!rescueBagsEnabled()) return null;
  // No bag today is the ordinary case for most businesses most days, and it
  // renders nothing at all rather than an empty "no bags" shelf.
  // …except right after a cancel of the last bag: the list had dropped the
  // sold-out offer, and the buyer must still read that the cancel worked.
  if (!offer && !order && !cancelled && !businessCancelled) return null;

  const price = shekels(offer?.price_agorot);
  const worth = shekels(worthAgorot(offer));
  const cancelUntil = israelTime(offer?.cancel_until);
  const cutoffPassed = offer?.cancel_until ? new Date(offer.cancel_until) <= new Date() : false;
  const errorLine = <RescueErrorLine errorKey={errorKey} />;
  const from = israelTime(offer?.pickup_start);
  const until = israelTime(offer?.pickup_end);

  return (
    <section
      id={RESCUE_SECTION_ID}
      data-testid="rescue-section"
      className="mt-12 scroll-mt-[calc(var(--chrome-top,82px)_+_var(--section-nav-h,68px))] md:scroll-mt-24"
    >
      <SectionHeading size="content">{t("section.title")}</SectionHeading>
      <LoginPromptModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        title={t("login_prompt_title")}
        message={t("login_prompt_message")}
        nextPath={
          typeof window !== "undefined"
            ? `${window.location.pathname}${window.location.search}#${RESCUE_SECTION_ID}`
            : "/"
        }
      />

      {cancelled && (
        <p
          role="status"
          data-testid="rescue-cancelled-notice"
          className="mt-3 font-body-sm text-sm text-text bg-surface-card border border-border rounded-md px-4 py-3"
        >
          {t("section.cancelled")}
        </p>
      )}

      {businessCancelled && !order && (
        <p
          role="status"
          data-testid="rescue-business-cancelled"
          className="mt-3 font-body-sm text-sm text-text bg-surface-card border border-border rounded-md px-4 py-3"
        >
          {t("section.business_cancelled")}
        </p>
      )}

      {order ? (
        <div className="mt-3 space-y-4">
          <RescueConfirmation order={order} onCancel={cancel} cancelling={busy} />
          {errorLine}
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
      ) : offer ? (
        <div
          className="mt-3 border border-border bg-surface-card rounded-md p-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px] md:gap-x-5 md:items-center"
          data-testid="rescue-section-card"
        >
          {/* Start column: what, when, where. On md+ the price/CTA column sits
              at the end side; below md everything stacks in source order, with
              the price on the top row next to the stock tag. */}
          <div className="grid gap-3 min-w-0">
            <div className="flex items-center gap-2.5">
              <span aria-hidden="true" className="w-11 h-11 rounded-md bg-green-50 text-primary grid place-items-center shrink-0">
                <Basket size={24} weight="regular" />
              </span>
              {/* The only gold on the card, as on the home row: the stock is what makes someone hurry. */}
              <span className="text-xs font-bold text-gold-deep bg-gold-deep/10 rounded-full px-2.5 py-0.5 whitespace-nowrap" data-testid="rescue-section-stock">
                {t("row.left_short", { count: offer.qty_left })}
              </span>
              <PriceBlock className="ms-auto text-end md:hidden" price={price} worth={worth} t={t} testIds />
            </div>
            <ul className="grid gap-2 font-body-sm text-base text-text">
              {from && until && (
                <li className="flex items-start gap-2">
                  <Clock aria-hidden="true" size={18} className="text-primary shrink-0 mt-0.5" />
                  <span data-testid="rescue-section-pickup">{t("row.pickup", { from, until })}</span>
                </li>
              )}
              {/* Full address: a live bag is the MEH-829 carve-out, and the point
                  is exact-precision or the backend refuses the offer. */}
              {offer.producer?.location_address && (
                <li className="flex items-start gap-2">
                  <MapPin aria-hidden="true" size={18} className="text-primary shrink-0 mt-0.5" />
                  <span data-testid="rescue-section-address">
                    {offer.producer.location_address}
                    {offer.producer.location_city ? `, ${offer.producer.location_city}` : ""}
                  </span>
                </li>
              )}
              {offer.typical_items?.length > 0 && (
                <li className="flex items-start gap-2">
                  <Bread aria-hidden="true" size={18} className="text-primary shrink-0 mt-0.5" />
                  <span className="text-fg-muted" data-testid="rescue-section-typical">
                    {t("section.typical", { items: offer.typical_items.join(", ") })}
                  </span>
                </li>
              )}
            </ul>
          </div>

          <div className="grid gap-2 md:text-center">
            <PriceBlock className="hidden md:block" price={price} worth={worth} t={t} />
            {errorLine}
            <Button
              type="button"
              onClick={() => reserve(offer.id)}
              disabled={busy || offer.qty_left < 1}
              data-testid="rescue-reserve"
              variant="primary" size="lg" className="w-full"
            >
              {t("section.cta")}
            </Button>
            {/* Only the cutoff here (Sapir 6/11); the no-show rule stays on the
                confirmation, where confirm.terms still carries it. */}
            {cancelUntil && (
              <p className="font-body-sm text-sm text-fg-muted text-center" data-testid="rescue-section-terms">
                {cutoffPassed ? t("section.no_cancel") : t("section.cancel_until", { time: cancelUntil })}
              </p>
            )}
          </div>

          <details
            className="md:col-span-2 border-t border-border pt-2.5 font-body-sm text-sm text-fg-muted"
            data-testid="rescue-section-allergens"
          >
            <summary className="cursor-pointer text-text font-medium">{t("section.allergens_title")}</summary>
            {/* MEH-2752: what THIS business declared, not one sentence for
                everyone. `null` and a list are genuinely different answers —
                an empty list would read as "contains none of the 14", which
                is a claim nobody made, so the API never sends one. */}
            {offer.allergens?.length ? (
              <p className="mt-1.5" data-testid="rescue-section-allergens-declared">
                {t("section.allergens_declared", {
                  list: offer.allergens.map((code) => tProducts(`allergen_${code}`)).join(", "),
                })}
              </p>
            ) : (
              <p className="mt-1.5" data-testid="rescue-section-allergens-none">
                {t("section.allergens_undeclared")}
              </p>
            )}
          </details>
          {/* MEH-3586: the bag's own page — map, how pickup works, the
              cancel rule. MEH-3585 may turn the whole card into this link. */}
          <Link
            href={rescueOfferPath(offer) || "/rescue"}
            className="md:col-span-2 justify-self-start text-sm font-semibold text-primary underline min-h-touch inline-flex items-center"
            data-testid="rescue-section-details"
          >
            {t("offer_page.details_link")}
          </Link>
        </div>
      ) : null}
    </section>
  );
}

/** Price, with the struck worth under it when there is one. Rendered twice —
 *  top row below md, end column on md+ — so only one copy carries test ids. */
function PriceBlock({ price, worth, t, className = "", testIds = false }) {
  if (price === null) return null;
  return (
    <span className={`leading-tight ${className}`}>
      <b dir="ltr" className="block font-headline-display font-black text-3xl text-primary numeric" data-testid={testIds ? "rescue-section-price" : undefined}>
        {t("row.price", { price })}
      </b>
      {worth !== null && (
        // aria-hidden: read aloud as a second bare price it says nothing useful.
        <s dir="ltr" aria-hidden="true" className="block text-sm text-fg-muted numeric" data-testid={testIds ? "rescue-section-worth" : undefined}>
          {t("row.price", { price: worth })}
        </s>
      )}
    </span>
  );
}
