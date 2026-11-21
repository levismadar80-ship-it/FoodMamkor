// @ts-check
"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Bread, MapPin, Warning } from "@phosphor-icons/react";

import SectionHeading from "@/components/ui/SectionHeading";
import { AddressNavLinks } from "@/components/NavAppGlyphs";
import { addressNavLinks } from "@/lib/nav-links";
import { israelTime } from "@/lib/rescue";

// REUSES: app/[locale]/events/[id]/EventDetailClient.jsx:45 — ssr:false,
// leaflet touches window at module eval.
const MiniMap = dynamic(() => import("@/components/MiniMap"), { ssr: false });

const HOW_STEPS = ["how_1", "how_2", "how_3"];

/**
 * Module:   RescueOfferDetails
 * Purpose:  What a buyer reads before reserving (MEH-3586), in the order Too
 *           Good To Go puts it: where to pick up (the window sits under the
 *           title, RescueOfferPage) (with a map and
 *           Waze / Google), what is usually inside, allergens, how pickup
 *           works, and the cancellation rule.
 * Does NOT: show the price or the button (RescueOfferAction), or the bag
 *           reviews — those feed the pilot metrics only (RescueReview model).
 * History:  MEH-3586 (creation)
 *
 * @param {{ offer: any }} props
 */
export default function RescueOfferDetails({ offer }) {
  const t = useTranslations("rescue");
  const tProducts = useTranslations("settings.products.form");
  const p = offer.producer;
  const cancelUntil = israelTime(offer.cancel_until);
  const cutoffPassed = new Date(offer.cancel_until) <= new Date();
  const address = [p.location_address, p.location_city].filter(Boolean).join(", ");
  const hasCoords = offer.lat !== null && offer.lat !== undefined && offer.lng !== null && offer.lng !== undefined;
  const nav = hasCoords ? null : addressNavLinks(p.location_address, p.location_city);
  const items = (offer.typical_items || []).filter(Boolean);

  return (
    // One white card, sections split by hairlines (Airbnb / Wolt item page):
    // on the beige page loose headings read as a long unstructured list.
    <div
      className="mt-6 bg-surface border border-border rounded-lg divide-y divide-border [&>section]:p-5"
      data-testid="rescue-offer-details"
    >
      <section aria-labelledby="rescue-where">
        <SectionHeading size="content" id="rescue-where" className="mb-3">{t("offer_page.address_title")}</SectionHeading>
        <ul className="grid gap-2 text-base text-text mb-3">
          {address && (
            <li className="flex items-start gap-2">
              <MapPin aria-hidden="true" size={20} className="text-primary shrink-0 mt-0.5" />
              <span data-testid="rescue-offer-address">{address}</span>
            </li>
          )}
        </ul>
        {hasCoords && <MiniMap lat={offer.lat} lng={offer.lng} name={p.name} />}
        {nav && <AddressNavLinks links={nav} testId="rescue-offer-nav" />}
      </section>

      <section aria-labelledby="rescue-inside">
        <SectionHeading size="content" id="rescue-inside" className="mb-3">{t("offer_page.inside_title")}</SectionHeading>
        <p className="text-base text-text">{t("offer_page.inside_body")}</p>
        {items.length > 0 && (
          <div className="mt-3" data-testid="rescue-offer-typical">
            <p className="text-sm text-fg-muted mb-2">{t("offer_page.inside_typical")}</p>
            <ul className="flex flex-wrap gap-2">
              {items.map((item) => (
                <li key={item} className="inline-flex items-center gap-1.5 bg-surface-card border border-border rounded-full px-3 py-1 text-sm text-text">
                  <Bread aria-hidden="true" size={14} className="text-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section aria-labelledby="rescue-allergens" data-testid="rescue-offer-allergens">
        <SectionHeading size="content" id="rescue-allergens" className="mb-3">{t("section.allergens_title")}</SectionHeading>
        {/* MEH-2752: null = not declared; a list = what THIS business declared. */}
        <p className="flex items-start gap-2 text-base text-text">
          <Warning aria-hidden="true" size={20} className="text-gold-deep shrink-0 mt-0.5" />
          {offer.allergens?.length ? (
            <span data-testid="rescue-offer-allergens-declared">
              {t("section.allergens_declared", { list: offer.allergens.map((code) => tProducts(`allergen_${code}`)).join(", ") })}
            </span>
          ) : (
            <span data-testid="rescue-offer-allergens-none">{t("section.allergens_undeclared")}</span>
          )}
        </p>
      </section>

      <section aria-labelledby="rescue-how">
        <SectionHeading size="content" id="rescue-how" className="mb-3">{t("offer_page.how_title")}</SectionHeading>
        <ol className="grid gap-3">
          {HOW_STEPS.map((key, i) => (
            <li key={key} className="flex items-start gap-3 text-base text-text">
              <span aria-hidden="true" className="w-7 h-7 rounded-full bg-green-50 text-primary font-bold grid place-items-center shrink-0 numeric">
                {i + 1}
              </span>
              <span className="pt-0.5">{t(`offer_page.${key}`)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="rescue-cancel" data-testid="rescue-offer-cancel">
        <SectionHeading size="content" id="rescue-cancel" className="mb-3">{t("offer_page.cancel_title")}</SectionHeading>
        <p className="text-base text-text">
          {cutoffPassed ? t("offer_page.cancel_passed") : t("offer_page.cancel_body", { time: cancelUntil })}
        </p>
        <p className="text-sm text-fg-muted mt-1">{t("offer_page.no_show")}</p>
      </section>
    </div>
  );
}
