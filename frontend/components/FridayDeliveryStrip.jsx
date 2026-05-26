"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { optimizeCloudinary } from "@/lib/cloudinary";
import api from "@/lib/api";

function ProducerMiniCard({ producer }) {
  const t = useTranslations("producer.friday_delivery");
  const img = producer.images?.[0]
    ? optimizeCloudinary(producer.images[0], "w_160,h_160,c_fill,f_auto,q_auto")
    : null;

  return (
    <Link
      href={producer.slug ? `/${producer.slug}` : `/producer/${producer.id}`}
      className="flex-shrink-0 w-36 rounded-[12px] overflow-hidden border border-border bg-white hover:shadow-md transition-shadow group"
      aria-label={producer.name}
    >
      <div className="relative h-24 bg-green-50">
        {img ? (
          <Image src={img} alt={producer.name} fill className="object-cover group-hover:scale-105 transition-transform duration-300" sizes="144px" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl text-primary/40 font-headline">
            {(producer.name || "?")[0]}
          </div>
        )}
        <span className="absolute top-1.5 end-1.5 bg-secondary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
          🛒 {t("today")}
        </span>
      </div>
      <div className="px-2 py-1.5">
        <p className="text-xs font-semibold text-text truncate">{producer.name}</p>
        {producer.city && <p className="text-[11px] text-fg-muted truncate">{producer.city}</p>}
      </div>
    </Link>
  );
}

export default function FridayDeliveryStrip({ city }) {
  const t = useTranslations("producer.friday_delivery");
  const [producers, setProducers] = useState([]);
  const scrollRef = useRef(null);

  useEffect(() => {
    // MEH-291 Phase 3 — switched from is_available_today=true to the unified
    // availability_state filter. Backend dual-writes during the 7-day overlap.
    const params = { availability_state: "available_today", page_size: 12 };
    if (city) params.delivery_city = city;
    api
      .get("/producers", { params })
      .then((r) => setProducers((r.data || []).slice(0, 12)))
      .catch(() => {});
  }, [city]);

  if (producers.length === 0) return null;

  return (
    <section
      className="bg-[#F5F0E8] border-b border-border py-4 px-4"
      aria-label={t("title")}
      dir="rtl"
    >
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🛒</span>
          <h2 className="font-headline font-semibold text-primary text-base">
            {t("title_alt")}
          </h2>
          {city && (
            <span className="text-xs text-fg-muted border border-border rounded-full px-2 py-0.5">
              {city}
            </span>
          )}
        </div>
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {producers.map((p) => (
            <ProducerMiniCard key={p.id} producer={p} />
          ))}
        </div>
      </div>
    </section>
  );
}
