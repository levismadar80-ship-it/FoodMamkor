"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

import { israelTime, shekels, walkingMinutes } from "@/lib/rescue";

/**
 * Module:   BagRow
 * Purpose:  One rescue bag as a flat row — who, when to collect, what is left,
 *           what it costs at the counter, and how far it is.
 * Does NOT: reserve anything. The row is a link to the business page, whose
 *           RescueSection owns the CTA — one reserve button in the product,
 *           not two.
 * Related:  components/rescue/RescueList.jsx and RescueHomeModule.jsx (both
 *           render this), lib/rescue.js (every unit it formats)
 * History:  MEH-2648 (creation)
 */
export default function BagRow({ offer }) {
  const t = useTranslations("rescue");
  const producer = offer?.producer;
  if (!producer) return null;

  const price = shekels(offer.price_agorot);
  const minutes = walkingMinutes(offer.distance_km);
  const from = israelTime(offer.pickup_start);
  const until = israelTime(offer.pickup_end);

  return (
    <Link
      href={`/producer/${producer.slug || producer.id}`}
      data-testid="rescue-bag-row"
      // Flat 1px border, no shadow and no radius flourish — the canvas's row
      // treatment, and the same surface Card.jsx uses.
      className="block border border-border bg-surface-card px-4 py-3 rounded-md hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-headline-md text-base font-black text-text truncate" data-testid="rescue-row-name">
          {producer.name}
        </p>
        {/* Frank Ruhl numerals (font-headline) and the ONLY gold on the row:
            the stock count is the thing that makes someone hurry. */}
        <p className="font-headline-md text-sm font-black text-gold-deep shrink-0" data-testid="rescue-row-stock">
          {t("row.left", { count: offer.qty_left })}
        </p>
      </div>

      <p className="font-body-sm text-sm text-fg-muted mt-1" data-testid="rescue-row-pickup">
        {from && until ? t("row.pickup", { from, until }) : null}
      </p>

      <div className="flex items-baseline gap-3 mt-1">
        {price !== null && (
          <p className="font-headline-md text-sm font-black text-text" data-testid="rescue-row-price">
            {t("row.price", { price })}
          </p>
        )}
        {offer.distance_km !== null && offer.distance_km !== undefined && (
          <p className="font-body-sm text-sm text-fg-muted" data-testid="rescue-row-distance">
            {/* A km figure is LTR inside RTL text, or "2.4" renders reversed. */}
            <bdi dir="ltr">{offer.distance_km}</bdi> {t("row.km")}
            {minutes !== null ? ` · ${t("row.walk", { minutes })}` : null}
          </p>
        )}
      </div>

      <p className="font-body-sm text-sm text-fg-muted mt-1 truncate" data-testid="rescue-row-where">
        {producer.location_address
          ? `${producer.location_address}, ${producer.location_city || producer.city || ""}`.replace(/, $/, "")
          : producer.location_city || producer.city}
      </p>
    </Link>
  );
}
