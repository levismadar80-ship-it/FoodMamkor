"use client";

import { Truck } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import WhatsAppButton from "@/components/WhatsAppButton";

/**
 * MEH-213: Delivery section shown on ProducerDetail when offers_delivery=true.
 *
 * Three states:
 *   nationwide=true              → "משלוחים לכל הארץ" badge
 *   cities.length > 0            → one chip per city
 *   nationwide=false, cities=[]  → "משלוחים בתיאום מראש"
 *
 * Uses WhatsAppButton (existing) for the CTA — no beacon duplication.
 */
export default function DeliveryBlock({ nationwide, cities = [], producer }) {
  // MEH-996: strings live under group_buys.delivery in both locale files —
  // the producer.delivery namespace never existed (same trap as
  // FridayDeliveryStrip), so t() rendered raw key paths.
  const t = useTranslations("group_buys.delivery");
  return (
    <section className="mt-8 border-t border-border pt-6">
      <h2 className="font-headline-md text-2xl font-bold text-text mb-4 flex items-center gap-2">
        <Truck size={22} className="text-primary" aria-hidden="true" />
        {t("heading")}
      </h2>

      <div className="flex flex-wrap gap-2 mb-4">
        {nationwide ? (
          <span className="inline-flex items-center gap-1.5 bg-green-50 text-text border border-border rounded-[20px] text-[13px] px-3 py-1.5 font-medium">
            <Truck size={14} className="text-current ms-1" aria-hidden="true" />{t("nationwide")}
          </span>
        ) : cities.length > 0 ? (
          cities.map((city) => (
            <span
              key={city}
              className="bg-green-50 text-text border border-border rounded-[20px] text-[12px] px-[10px] py-[4px]"
            >
              {city}
            </span>
          ))
        ) : (
          <p className="text-sm text-fg-muted">{t("arranged")}</p>
        )}
      </div>

      <WhatsAppButton
        phone={producer.phone}
        productTitle={producer.name}
        producerId={producer.id}
      />
    </section>
  );
}
