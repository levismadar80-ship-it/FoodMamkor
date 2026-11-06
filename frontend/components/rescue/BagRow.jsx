"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Basket } from "@phosphor-icons/react";

import { cssUrl } from "@/lib/css-url";
import { optimizeCloudinary } from "@/lib/cloudinary";
import { israelTime, shekels, walkingMinutes } from "@/lib/rescue";

// "עוד שעה" lights up when the pickup window opens within this many ms.
const SOON_MS = 3_600_000;

/** True when pickup starts within the next hour (and has not started yet). */
function startsSoon(iso, now = Date.now()) {
  if (!iso) return false;
  const start = new Date(iso).getTime();
  if (Number.isNaN(start)) return false;
  const ahead = start - now;
  return ahead > 0 && ahead <= SOON_MS;
}

/** The struck-through "worth" figure: the business's own LOW estimate, and
 *  only when it is actually above the price — never a made-up discount. */
function worthAgorot(offer) {
  const v = offer?.value_min_agorot;
  if (typeof v !== "number" || typeof offer?.price_agorot !== "number") return null;
  return v > offer.price_agorot ? v : null;
}

/**
 * Module:   BagRow
 * Purpose:  One rescue bag as a row in the events-list language (#3976):
 *           a pickup-time block on the start side with the green rule, then
 *           who, what is usually inside, how much is left, price against the
 *           declared worth, and the business photo on the end side.
 * Does NOT: reserve anything. The row is a link to the business page, whose
 *           RescueSection owns the CTA — one reserve button in the product,
 *           not two.
 * Related:  components/rescue/RescueList.jsx and RescueHomeModule.jsx (both
 *           render this), lib/rescue.js (every unit it formats)
 * History:  MEH-2648 (creation) · rescue-home redesign (events-row language)
 */
export default function BagRow({ offer, headingTag = "h3" }) {
  const t = useTranslations("rescue");
  const producer = offer?.producer;
  if (!producer) return null;

  const price = shekels(offer.price_agorot);
  const worth = shekels(worthAgorot(offer));
  const from = israelTime(offer.pickup_start);
  const until = israelTime(offer.pickup_end);
  const soon = startsSoon(offer.pickup_start);
  const minutes = walkingMinutes(offer.distance_km);
  const items = (offer.typical_items || []).filter(Boolean).join(", ");
  const hasDistance = offer.distance_km !== null && offer.distance_km !== undefined;
  const where = producer.location_address || producer.location_city || producer.city || "";
  const image = producer.image_url ? optimizeCloudinary(producer.image_url, { aspectRatio: "1:1", width: 160 }) : null;

  // h3 under the home block's h2; h2 on /rescue, whose only heading is the h1.
  const Heading = headingTag;
  const thumbBg = image ? { backgroundImage: cssUrl(image) } : undefined;

  return (
    <Link
      href={`/producer/${producer.slug || producer.id}`}
      data-testid="rescue-bag-row"
      className="relative grid grid-cols-[64px_minmax(0,1fr)_auto] md:grid-cols-[88px_minmax(0,1fr)_auto] border-b border-border transition hover:bg-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {/* Start-edge tick, full height — EventEntryRow's, same colour. */}
      <span aria-hidden="true" className="absolute start-0 inset-y-0 w-[3px] bg-primary" />

      {/* Pickup rail — the events row's date rail, with the time as the numeral. */}
      <div
        className="py-4 grid justify-items-center content-start gap-0.5"
        data-testid="rescue-row-pickup"
      >
        <span className="text-xs font-semibold text-fg-muted">{t("row.pickup_label")}</span>
        {from && (
          <span dir="ltr" className="font-headline-display font-black text-2xl md:text-3xl leading-none text-text numeric">
            {from}
          </span>
        )}
        {until && (
          <span className="text-2xs text-fg-muted mt-0.5">{t("row.until", { time: until })}</span>
        )}
        {soon && (
          <span className="text-2xs font-bold text-primary" data-testid="rescue-row-soon">
            {t("row.soon")}
          </span>
        )}
      </div>

      <div className="py-4 ps-3 pe-4 min-w-0">
        <Heading className="font-headline-md text-lg font-bold text-text leading-snug truncate" data-testid="rescue-row-name">
          {producer.name}
        </Heading>
        <p className="text-sm text-fg-muted mt-1 truncate" data-testid="rescue-row-where">
          {items}
          {items && (hasDistance || where) ? " · " : null}
          {hasDistance ? (
            <span data-testid="rescue-row-distance">
              {/* A km figure is LTR inside RTL text, or "2.4" renders reversed. */}
              <bdi dir="ltr">{offer.distance_km}</bdi> {t("row.km")}
              {minutes !== null ? ` · ${t("row.walk", { minutes })}` : null}
            </span>
          ) : (
            where
          )}
        </p>
        <div className="flex items-baseline gap-2 mt-2 flex-wrap">
          {/* The only gold on the row: the stock count is what makes someone hurry. */}
          <span className="text-xs font-bold text-gold-deep" data-testid="rescue-row-stock">
            {t("row.left_short", { count: offer.qty_left })}
          </span>
          {price !== null && (
            <span className="ms-auto flex items-baseline gap-1.5">
              {worth !== null && (
                // aria-hidden: read aloud as two bare prices it says nothing
                // useful; the price actually paid is the one announced.
                <s dir="ltr" className="text-xs text-fg-muted numeric" aria-hidden="true" data-testid="rescue-row-worth">
                  {t("row.price", { price: worth })}
                </s>
              )}
              <span dir="ltr" className="font-english italic font-semibold text-primary numeric" data-testid="rescue-row-price">
                {t("row.price", { price })}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Decorative: the row is a link already named by the business. Never an
          empty box — no photo gets the basket tile, as events get a category tile. */}
      <div
        aria-hidden="true"
        data-testid="rescue-row-image"
        className={`my-4 me-4 w-16 h-16 md:w-20 md:h-20 rounded-md bg-cover bg-center grid place-items-center ${image ? "bg-border" : "bg-green-50 text-primary"}`}
        style={thumbBg}
      >
        {image ? null : <Basket size={24} weight="duotone" />}
      </div>
    </Link>
  );
}
