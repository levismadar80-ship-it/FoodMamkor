// @ts-check
/**
 * Module:   MapRescueRow
 * Purpose:  The business's surprise bag today, as one row under the business
 *           picked on the map: «סל הפתעה», the pickup window and the price,
 *           linking to the bag's own page, where it is reserved (MEH-3824).
 *           No badge on the pin (Sapir 25/11): bags are one offer among
 *           several on the site, so the map does not single them out.
 * Does NOT: fetch. The bag rides the producer list the map already loads
 *           (`rescue_today`, set by the server's attach_rescue_today), so the
 *           map adds no request (the per-IP limits, testing.md MEH-2972).
 *           Does not reserve: the bag page owns reserve / cancel.
 * Related:  frontend/lib/rescue.js (rescueToday — both flag halves);
 *           frontend/components/rescue/BagRow.jsx (the list row: same price and
 *           worth reading).
 */
import { useTranslations } from "next-intl";
import { Basket, CaretRight } from "@phosphor-icons/react";

import { Link } from "@/i18n/navigation";
import { israelTime, rescueToday, shekels, worthAgorot } from "@/lib/rescue";
import { rescueOfferPath } from "@/lib/producer-path";
import StruckPrice from "@/components/ui/StruckPrice";

/** @param {{ producer: { rescue_today?: object|null } | null }} props */
export default function MapRescueRow({ producer }) {
  const t = useTranslations("rescue");
  const bag = rescueToday(producer);
  if (!bag) return null;

  const from = israelTime(bag.pickup_start);
  const until = israelTime(bag.pickup_end);
  const price = shekels(bag.price_agorot);
  const worth = shekels(worthAgorot(bag));
  const href = rescueOfferPath({ id: bag.offer_id });

  return (
    <Link
      href={href}
      data-testid="map-rescue-row"
      className="mt-1.5 flex min-h-11 items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-text hover:bg-green-100 focus-ring"
    >
      <Basket size={18} weight="regular" aria-hidden="true" className="shrink-0 text-primary" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-bold leading-5">{t("section.title")}</span>
        {from && until && (
          <span className="text-xs leading-4 text-fg-muted" data-testid="map-rescue-row-window">
            {/* LRI … PDI around the whole window: «19:00–21:00» inside Hebrew
                text otherwise reads backwards (the MEH-3823 cancel-row bug). */}
            {t("section.pickup_today", { from: `\u2066${from}`, until: `${until}\u2069` })}
          </span>
        )}
      </span>
      {price !== null && (
        <span className="flex shrink-0 items-baseline gap-1.5">
          {worth !== null && (
            <StruckPrice className="text-xs numeric" testId="map-rescue-row-worth">
              {t("row.price", { price: worth })}
            </StruckPrice>
          )}
          <span
            dir="ltr"
            aria-hidden={worth !== null ? "true" : undefined}
            className="font-semibold text-primary numeric"
            data-testid="map-rescue-row-price"
          >
            {t("row.price", { price })}
          </span>
          {worth !== null && (
            <span className="sr-only">
              {t("row.worth_and_price", { worth: t("row.price", { price: worth }), price: t("row.price", { price }) })}
            </span>
          )}
        </span>
      )}
      <CaretRight size={16} weight="regular" aria-hidden="true" className="shrink-0 text-fg-muted rtl:rotate-180" />
    </Link>
  );
}
