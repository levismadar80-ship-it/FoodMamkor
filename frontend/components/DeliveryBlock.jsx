"use client";

import { Truck, Package } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import WhatsAppButton from "@/components/WhatsAppButton";
import { formatPrice } from "@/lib/utils";

/**
 * MEH-213 / MEH-1146 chunk B: editorial delivery section shown on
 * ProducerDetail when offers_delivery=true.
 *
 * States:
 *   nationwide=true         → "משלוחים לכל הארץ" badge
 *   areas.length > 0        → one editorial row per area (city · min order ·
 *                             day, invention-fix 4) from delivery_areas
 *   nationwide=false, none  → "משלוחים בתיאום מראש"
 *
 * Plus an optional self-pickup line (invention-fix 6, gated on pickup_points)
 * and a DEMOTED tertiary WhatsApp order CTA (tone="tertiary") so the delivery
 * section no longer competes with the contact card's single primary CTA.
 * min_order is rendered via formatPrice (MEH-1140 canonical shekel format).
 */
export default function DeliveryBlock({ nationwide, areas = [], pickup = false, producer }) {
  const t = useTranslations("group_buys.delivery");
  const hasAreas = areas.length > 0;
  return (
    <section className="mt-8 border-t border-border pt-6">
      <h2 className="font-headline-md text-2xl font-bold text-text mb-4 flex items-center gap-2">
        <Truck size={22} className="text-primary" aria-hidden="true" />
        {t("heading")}
      </h2>

      {nationwide ? (
        <span className="inline-flex items-center gap-1.5 bg-green-50 text-text border border-border rounded-[20px] text-[13px] px-3 py-1.5 font-medium mb-4">
          <Truck size={14} className="text-current ms-1" aria-hidden="true" />{t("nationwide")}
        </span>
      ) : hasAreas ? (
        <ul className="mb-4 divide-y divide-border border-y border-border">
          {areas.map((da) => (
            <li
              key={da.id ?? da.city}
              className="flex items-center justify-between gap-3 py-2.5 text-sm"
            >
              <span className="font-medium text-text">{da.city}</span>
              <span className="text-fg-muted flex items-center gap-2">
                {da.min_order ? (
                  <span>
                    {/* MEH-1168 P1 (bidi): isolate the ₪ amount so RTL flow keeps
                        it as "150₪", never "₪150" (MEH-1140 canon). */}
                    {t("min_order")} <span dir="ltr">{formatPrice(da.min_order)}</span>
                  </span>
                ) : null}
                {da.delivery_day && (
                  <>
                    {da.min_order ? <span aria-hidden="true">·</span> : null}
                    <span>{da.delivery_day}</span>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-muted mb-4">{t("arranged")}</p>
      )}

      {/* Self-pickup — invention-fix 6: only when the pickup_points flag is set. */}
      {pickup && (
        <p className="flex items-center gap-2 text-sm text-text mb-4">
          <Package size={18} className="text-primary" aria-hidden="true" />
          {t("pickup")}
        </p>
      )}

      <WhatsAppButton
        phone={producer.phone}
        productTitle={producer.name}
        producerId={producer.id}
        tone="tertiary"
      />
    </section>
  );
}
