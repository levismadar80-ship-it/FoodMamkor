"use client";

import { Truck } from "@phosphor-icons/react";
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
  return (
    <section className="mt-8 border-t border-border pt-6">
      <h2 className="font-headline text-2xl font-bold text-site-text mb-4 flex items-center gap-2">
        <Truck size={22} weight="duotone" className="text-primary" aria-hidden="true" />
        משלוחים
      </h2>

      <div className="flex flex-wrap gap-2 mb-4">
        {nationwide ? (
          <span className="inline-flex items-center gap-1.5 bg-light text-site-text border border-border rounded-[20px] text-[13px] px-3 py-1.5 font-medium">
            🚚 משלוחים לכל הארץ
          </span>
        ) : cities.length > 0 ? (
          cities.map((city) => (
            <span
              key={city}
              className="bg-light text-site-text border border-border rounded-[20px] text-[12px] px-[10px] py-[4px]"
            >
              {city}
            </span>
          ))
        ) : (
          <p className="text-sm text-site-muted">משלוחים בתיאום מראש — צרי קשר לפרטים</p>
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
