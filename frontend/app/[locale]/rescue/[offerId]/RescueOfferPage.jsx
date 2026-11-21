// @ts-check
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Basket } from "@phosphor-icons/react";

import { Link } from "@/i18n/navigation";
import EntityCover from "@/components/EntityCover";
import HistoryBackLink from "@/components/HistoryBackLink";
import OwnerRow from "@/components/OwnerRow";
import ShareButton from "@/components/ShareButton";
import RatingCompact from "@/components/ui/RatingCompact";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonBlock } from "@/components/Skeleton";
import { fetchOffer } from "@/lib/rescue";
import { producerPath } from "@/lib/producer-path";
import useRescueReservation from "@/lib/useRescueReservation";

import RescueOfferAction from "./RescueOfferAction";
import RescueOfferDetails from "./RescueOfferDetails";

/**
 * Module:   RescueOfferPage
 * Purpose:  The bag page's body (MEH-3586): loads the bag by id, then lays it
 *           out like the event page — cover, title and business row, a side
 *           card with price and the reserve button (under the title on a
 *           phone), and the details below.
 * Does NOT: decide what a reservation does — lib/useRescueReservation.js, the
 *           same hook the business page's bag block uses.
 * Related:  ./RescueOfferAction.jsx, ./RescueOfferDetails.jsx,
 *           backend/app/routers/rescue.py get_offer
 * History:  MEH-3586 (creation)
 *
 * @param {{ offerId: string }} props
 */
export default function RescueOfferPage({ offerId }) {
  const t = useTranslations("rescue");
  const [offer, setOffer] = useState(/** @type {any} */ (undefined));
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    (keepOnError = false) =>
      fetchOffer(offerId)
        .then((row) => {
          setOffer(row);
          setFailed(false);
        })
        .catch(() => {
          if (!keepOnError) setFailed(true);
        }),
    [offerId],
  );
  useEffect(() => {
    load();
  }, [load]);

  const reservation = useRescueReservation({
    producerId: offer?.producer?.id,
    offerId: offer?.id,
    onCancelled: () => load(true),
  });

  if (failed) {
    return (
      <Shell t={t}>
        <p className="text-sm text-fg-muted" role="alert">{t("list.failed")}</p>
        <Link href="/rescue" className="mt-2 inline-block text-primary font-semibold underline">{t("offer_page.other_bags")}</Link>
      </Shell>
    );
  }
  if (offer === undefined) {
    return (
      <Shell t={t}>
        <p className="sr-only" role="status">{t("offer_page.loading")}</p>
        <SkeletonBlock as="div" className="h-[210px] w-full rounded-md" />
        <SkeletonBlock as="div" className="h-8 w-2/3 mt-5" />
      </Shell>
    );
  }
  if (offer === null) return <NotFound t={t} />;

  const producer = offer.producer;
  const businessHref = producerPath(producer);
  const town = producer.location_city || producer.city;

  return (
    <div className="pb-32 lg:pb-12" data-testid="rescue-offer-page" data-state={offer.state}>
      <EntityCover
        imageUrl={producer.image_url || undefined}
        alt={producer.name}
        tone="primary"
        Icon={Basket}
        actions={<ShareButton variant="overlay" subject="rescue" title={`${t("offer_page.eyebrow")} · ${producer.name}`} city={town || undefined} />}
        testIdPrefix="rescue-offer"
      />
      <div className="max-w-[1100px] mx-auto px-4 pt-5 lg:pt-8 lg:grid lg:grid-cols-[1fr_360px] lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:items-start">
        <div className="lg:col-start-1">
          <HistoryBackLink />
          <p className="inline-flex items-center gap-1 bg-green-50 text-primary text-xs font-semibold px-3 py-1 rounded-full mb-3">
            <Basket size={12} weight="bold" aria-hidden="true" />
            {t("offer_page.eyebrow")}
          </p>
          <h1 className="font-headline-display text-4xl md:text-5xl font-black text-text mb-3" data-testid="rescue-offer-title">
            {producer.name}
          </h1>
          <OwnerRow href={businessHref} name={producer.name} testId="rescue-offer-business">
            <span className="block font-semibold">{t("offer_page.business_link", { name: producer.name })}</span>
            <span className="flex items-center gap-2 text-sm text-fg-muted">
              {town && <span>{town}</span>}
              {producer.reviews_count > 0 && typeof producer.avg_rating === "number" && (
                <RatingCompact avg={producer.avg_rating} count={producer.reviews_count} size="xs" data-testid="rescue-offer-rating" />
              )}
            </span>
          </OwnerRow>
        </div>

        <aside className="mt-6 lg:mt-0 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-24">
          <RescueOfferAction offer={offer} reservation={reservation} />
        </aside>

        <div className="lg:col-start-1">
          <RescueOfferDetails offer={offer} />
        </div>
      </div>
    </div>
  );
}

/** The frame of the loading / failed / not-found states — with an h1, so no
 *  state of the page is left without one. */
function Shell({ t, children }) {
  return (
    <div className="max-w-[1100px] mx-auto px-4 pt-5 pb-12">
      <h1 className="sr-only">{t("section.title")}</h1>
      {children}
    </div>
  );
}

/** Another day's bag, a mistyped id, or a business no longer listed. */
function NotFound({ t }) {
  return (
    <Shell t={t}>
      <div data-testid="rescue-offer-not-found">
        <EmptyState
          icon={Basket}
          title={t("offer_page.not_found_title")}
          description={t("offer_page.not_found_body")}
          ctaLabel={t("offer_page.other_bags")}
          ctaHref="/rescue"
          headingLevel={2}
        />
      </div>
    </Shell>
  );
}
