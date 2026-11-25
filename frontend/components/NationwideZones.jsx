// @ts-check
"use client";
/**
 * Module:   NationwideZones
 * Purpose:  Under «משלוחים לכל הארץ»: the areas on other terms (MEH-3511) —
 *           e.g. «גוש דן, אקספרס»: its cities, fee, minimum, delivery time,
 *           own order cutoff and next delivery. A zone wins over «כל הארץ»
 *           in its cities.
 * Does NOT: render the nationwide badge or the country-wide fee line
 *           (DeliveryBlock.jsx), or decide the next date (lib/next-delivery.js).
 * Related:  backend/app/services/delivery_zones.py (writes a nationwide
 *           business's zone rows — the only city rows it has).
 * History:  MEH-3511 (creation).
 *
 * States: no zone rows → nothing (nationwide renders as before). One zone /
 * several zones → one card each, in the order the rows arrive.
 */
import { useTranslations } from "next-intl";
import AreaTermsRow, { LIST_CARD } from "@/components/AreaTermsRow";
import NextDeliveryLine from "@/components/NextDeliveryLine";
import { daysOfRow, sharedCutoff } from "@/lib/next-delivery";

/** @typedef {{ city: string, zone_name?: string | null, delivery_fee?: number | null,
 *   min_order?: number | null, delivery_days_min?: number | null, delivery_days_max?: number | null,
 *   order_cutoff_day?: string | null, order_cutoff_time?: string | null,
 *   delivery_day?: string | null, delivery_days?: string[] | null }} ZoneRow */

/** @param {ZoneRow[]} areas @returns {Array<[string, ZoneRow[]]>} */
function byZone(areas) {
  /** @type {Map<string, ZoneRow[]>} */
  const zones = new Map();
  for (const a of areas) {
    if (!a?.zone_name) continue;
    zones.set(a.zone_name, [...(zones.get(a.zone_name) || []), a]);
  }
  return [...zones.entries()];
}

/** @param {{ areas?: ZoneRow[], producer?: any }} props */
export default function NationwideZones({ areas = [], producer = null }) {
  const t = useTranslations("group_buys.delivery");
  const zones = byZone(areas);
  if (zones.length === 0) return null;
  return (
    <div className="mb-4" data-testid="nationwide-zones">
      <p className="text-sm font-bold text-gold-deep mb-1.5">{t("zones_other_terms")}</p>
      <ul className="space-y-2">
        {zones.map(([name, rows]) => (
          <ZoneCard key={name} rows={rows} producer={producer} />
        ))}
      </ul>
    </div>
  );
}

/** @param {{ rows: ZoneRow[], producer: any }} props */
// Sapir 20/11 («אחידות»): the same row as every other delivery area
// (AreaTermsRow): the towns as the title, the zone's name a tag, the terms on
// one «·» line, then the next date.
function ZoneCard({ rows, producer }) {
  const first = rows[0];
  return (
    <li data-testid="nationwide-zone">
      <ul className={LIST_CARD}>
        <AreaTermsRow
          rows={rows}
          fee={first.delivery_fee ?? null}
          next={
            <NextDeliveryLine
              days={daysOfRow(first)}
              producer={producer}
              cutoff={sharedCutoff(rows)}
              className="mt-0.5"
              textClass="text-xs text-fg-muted"
            />
          }
        />
      </ul>
    </li>
  );
}
