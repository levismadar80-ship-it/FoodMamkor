"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { optimizeCloudinary } from "@/lib/cloudinary";
import { useUserCity } from "@/lib/use-user-city";
import { styleForProducer } from "@/lib/map-categories";
import { getWhatsAppHref } from "@/lib/utils";

export default function MapProducerCard({ producer, active, onClick }) {
  const t = useTranslations("map.producer_card");
  const { city: userCity } = useUserCity();
  const p = producer;
  const imgSrc = optimizeCloudinary(p.images?.[0]);
  const baseHref = p.slug ? `/${p.slug}` : `/producer/${p.id}`;
  const category = p.categories?.[0];
  const priceLabel = p.starting_price_label || p.price_range;
  const isVerified = p.is_verified;
  const rating = Number(p.avg_rating || 0);
  const reviewsCount = p.reviews_count || 0;
  const { color: categoryColor } = styleForProducer(p);

  const deliveryMatch = userCity && Array.isArray(p.delivery_areas)
    ? p.delivery_areas.find((d) => d.city === userCity)
    : null;

  const trustItems = [];
  if (isVerified) trustItems.push(t("verified"));
  if (rating > 0) trustItems.push(`⭐ ${rating.toFixed(1)} (${reviewsCount})`);

  const handleRootClick = (e) => {
    if (onClick) {
      if (e.target.closest("a, button")) return;
      onClick(p);
    }
  };

  const waPhone = p.phone?.replace(/\D/g, "");

  return (
    <article
      onClick={handleRootClick}
      className={[
        "flex gap-3 bg-white border rounded-[12px] overflow-hidden transition",
        "hover:shadow-[0_4px_16px_rgba(46,104,83,0.08)]",
        active ? "border-primary border-2" : "border-border",
        onClick ? "cursor-pointer" : "",
      ].join(" ")}
      style={{ direction: "rtl" }}
    >
      {/* Thumbnail — RIGHT in RTL (first child) */}
      <div
        className="shrink-0 w-[88px] min-[1180px]:w-[88px] max-[1179px]:w-[72px] relative"
        style={{ backgroundColor: "#EAF3DE" }}
      >
        {imgSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imgSrc}
            alt={p.name || ""}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl" aria-hidden="true">🌿</div>
        )}
        {/* Category color dot — bottom-end corner of thumbnail */}
        <span
          className="absolute bottom-1 end-1 w-2.5 h-2.5 rounded-full border-[1.5px] border-white pointer-events-none"
          style={{ background: categoryColor }}
          aria-hidden="true"
        />
      </div>

      {/* Text content — LEFT in RTL */}
      <div className="flex-1 py-2 pe-3 min-w-0 flex flex-col justify-between">
        <div>
          <h3 className="font-headline font-bold text-site-text line-clamp-1" style={{ fontSize: "17px" }}>
            {p.name}
          </h3>
          {/* Category name in muted, price in Cormorant italic gold — separate lines */}
          {category?.name && (
            <p className="text-fg-muted line-clamp-1 mt-0.5" style={{ fontSize: "12px" }}>
              {category.name}
            </p>
          )}
          {priceLabel && (
            <p className="font-english italic line-clamp-1 mt-0.5" style={{ fontSize: "13px", color: "#8B6914" }}>
              {priceLabel}
            </p>
          )}
        </div>

        {/* Pills row */}
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {deliveryMatch && (
            <span className="text-[11px] bg-green-50 text-primary rounded-full px-2 py-0.5 inline-flex items-center gap-0.5">
              🚚 {t("distance_prefix")}{deliveryMatch.city} {deliveryMatch.delivery_day || ""}
            </span>
          )}
        </div>

        {/* Trust strip — max 2 items */}
        {trustItems.length > 0 && (
          <p className="text-[12px] text-fg-muted mt-1">
            {trustItems.slice(0, 2).join(" · ")}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 mt-1.5">
          <a
            href={waPhone ? getWhatsAppHref(waPhone, t("wa_message", { name: p.name || "" })) : baseHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => { e.stopPropagation(); if (waPhone) { try { navigator.sendBeacon?.(`/api/producers/${p.id}/whatsapp-click`); } catch {} } }}
            className="bg-whatsapp w-7 h-7 rounded-full flex items-center justify-center shrink-0"
            aria-label="WhatsApp"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M20.52 3.48A11.9 11.9 0 0012.04 0C5.45 0 .1 5.35.1 11.94c0 2.1.55 4.15 1.6 5.96L0 24l6.27-1.64a11.9 11.9 0 005.77 1.47h.01c6.59 0 11.94-5.35 11.94-11.94 0-3.19-1.24-6.19-3.47-8.41z"/></svg>
          </a>
          <Link
            href={baseHref}
            className="text-primary text-[13px] font-medium hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
{t("full_profile")} ←
          </Link>
        </div>
      </div>
    </article>
  );
}
