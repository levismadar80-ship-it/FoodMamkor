// @ts-check
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CaretLeft, Clock, MapPin } from "@phosphor-icons/react";

import { bagDay, fetchOffers, israelTime, rescueBagsEnabled, shekels, worthAgorot } from "@/lib/rescue";
import useIsraelToday from "@/lib/use-israel-today";
import { RESCUE_SECTION_ID, rescueOfferPath } from "@/lib/producer-path";
import SectionHeading from "@/components/ui/SectionHeading";
import OfferCard from "@/components/ui/OfferCard";
import { GroupBuyProgressMark } from "@/components/ui/SeedProgressMark";

/**
 * Module:   RescueSection
 * Purpose:  The rescue-bag block on a business page: the bag as one card that
 *           links to the bag's own page, like the group-buy cards beside it.
 *           What is in it, what it costs, how many are left, when to pick up.
 * Does NOT: reserve, cancel or show a reservation. All of that, and the
 *           allergens, lives on the bag page (app/[locale]/rescue/[offerId];
 *           Sapir 22/11: a reserve button on the card, before the buyer has
 *           seen the bag, was confusing). Takes no payment (03/11 ruling).
 * Related:  app/[locale]/producer/[id]/components/ProducerSections.jsx (slot,
 *           after the activities, beside the group buys — MEH-3585), lib/rescue.js
 * History:  MEH-2648 (creation) · MEH-2713 (icon-row card: price up top,
 *           one short cancel line, allergens folded) · MEH-2737 (a cancel
 *           says it worked, or why not; past the cutoff the card says the bag
 *           can no longer be cancelled) · MEH-2738 (says when the business
 *           cancelled the bag) · MEH-3586 (reserve/cancel state moved to
 *           lib/use-rescue-reservation, shared with the bag page) · MEH-3585
 *           (drawn by the shared ui/OfferCard, the group-buy card: same size,
 *           seeds for the bags left) · MEH-3586 follow-up (the whole card is
 *           the link to the bag page; the reserve button, login prompt,
 *           cancel, errors and allergens are on that page only)
 */

export default function RescueSection({ producer }) {
  const day = useIsraelToday(); // MEH-3805: «מחר» turns into «היום» at midnight
  const t = useTranslations("rescue");
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
  // today's rows belongs to this producer.
  // A response for a business the page no longer shows is dropped (the old
  // effect's `alive` flag): only the latest request may set the offer.
  const latest = useRef(0);
  const loadOffer = useCallback(
    () => {
      const ticket = ++latest.current;
      return fetchOffers({ city: producer?.city || undefined })
        .then((rows) => {
          if (ticket !== latest.current) return;
          // MEH-3702: today's bag first; tomorrow's when there is none today.
          const own = rows.filter((row) => row.producer?.id === producer?.id);
          // eslint-disable-next-line no-restricted-syntax -- MEH-3861: in the fetch's .then, after the load
          setOffer(own.find((row) => bagDay(row.date) === "today") || own[0] || null);
        })
        .catch(() => {
          if (ticket === latest.current) setOffer(null);
        });
    },
    [producer?.id, producer?.city],
  );
  useEffect(() => {
    loadOffer();
  }, [loadOffer]);

  if (!rescueBagsEnabled()) return null;
  // No bag today is the ordinary case for most businesses most days, and it
  // renders nothing at all rather than an empty "no bags" shelf. A buyer who
  // already reserved finds her code on the bag page, as a group-buy member
  // finds hers on the group buy's page.
  const href = rescueOfferPath(offer);
  if (!offer || !href) return null;

  const price = shekels(offer?.price_agorot);
  const worth = shekels(worthAgorot(offer));
  // MEH-3585: the gold saving line, as on the group-buy card. Only off the
  // business's own LOW estimate (worthAgorot), so never a made-up discount.
  const worthA = worthAgorot(offer);
  const savingPct = worthA ? Math.round((1 - offer.price_agorot / worthA) * 100) : 0;
  const from = israelTime(offer?.pickup_start);
  const until = israelTime(offer?.pickup_end);

  return (
    <section
      id={RESCUE_SECTION_ID}
      data-testid="rescue-section"
      className="mt-12 scroll-mt-[calc(var(--chrome-top,82px)_+_var(--section-nav-h,68px))] md:scroll-mt-24"
    >
      <SectionHeading size="content">{t("section.title")}</SectionHeading>
      {/* MEH-3585: the shared OfferCard — the same card as the group buys under
          «קבוצות רכישה פתוחות», in the same half-width grid (Sapir 21/11: one
          design, one size). MEH-3586 follow-up (Sapir 22/11): the whole card
          is the link to the bag page, as each group-buy card is, so nothing on
          it is a button and the reserve comes after the buyer saw the bag. */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <OfferCard
          href={href}
          testId="rescue-section-card"
          // No icon tile (Sapir 21/11: the basket looked unprofessional).
          // Like the group-buy card: the business's photo is already the
          // page's own hero, and a generic icon adds nothing (DESIGN.md «Offer cards»).
          // No typical items → no card title: «סל הפתעה» is already the
          // section heading right above (MEH-3585 review).
          title={offer.typical_items?.length > 0 ? t("section.typical", { items: offer.typical_items.join(", ") }) : null}
          titleTestId="rescue-section-typical"
          // Forward caret, as on the group-buy card: points left in Hebrew.
          trailing={<CaretLeft size={20} aria-hidden="true" className="text-primary shrink-0 mt-1 ltr:rotate-180" />}
          lines={
            // Full address: a live bag is the MEH-829 carve-out, and the point
            // is exact-precision or the backend refuses the offer.
            offer.producer?.location_address && (
              <p className="mt-0.5 flex items-start gap-1.5 text-sm text-fg-muted" data-testid="rescue-section-address">
                <MapPin aria-hidden="true" size={16} className="shrink-0 mt-0.5" />
                <span>
                  {offer.producer.location_address}
                  {offer.producer.location_city ? `, ${offer.producer.location_city}` : ""}
                </span>
              </p>
            )
          }
          price={price !== null ? t("row.price", { price }) : null}
          priceTestId="rescue-section-price"
          worth={worth !== null ? t("row.price", { price: worth }) : null}
          worthTestId="rescue-section-worth"
          saving={savingPct > 0 ? t("section.saving", { pct: savingPct }) : null}
          savingTestId="rescue-section-saving"
          bandStart={
            <>
              {/* The logo seeds, as on the group-buy card: one per bag, filled
                  = still available. */}
              <GroupBuyProgressMark
                commits={offer.qty_left}
                min={offer.qty_total || offer.qty_left}
                // Decorative: «נשארו 4 סלים» sits right beside it (MEH-3585 review).
                label={null}
              />
              <span className="text-xs font-bold text-text" data-testid="rescue-section-stock">
                {t("row.left", { count: offer.qty_left })}
              </span>
            </>
          }
          bandEnd={
            from && until && (
              <span className="flex items-center gap-1" data-testid="rescue-section-pickup">
                <Clock aria-hidden="true" size={14} className="shrink-0" />
                {/* MEH-3585: say the day — the public list is today's bags
                    only, and a bare window reads as «every day». */}
                {t(bagDay(offer.date, day) === "tomorrow" ? "row.pickup_tomorrow" : "section.pickup_today", { from, until })}
              </span>
            )
          }
        />
      </div>
    </section>
  );
}
