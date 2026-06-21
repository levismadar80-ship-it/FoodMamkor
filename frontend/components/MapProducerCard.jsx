"use client";

import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Star, Truck, Leaf, Clock, WhatsappLogo, Phone, Globe, EnvelopeSimple } from "@phosphor-icons/react";
import { optimizeCloudinary } from "@/lib/cloudinary";
import { useUserCity } from "@/lib/use-user-city";
import { styleForProducer } from "@/lib/map-categories";
import { getPrimaryContactHref, getPrimaryMethod, getPrimaryContactLabel, isPrimaryExternal } from "@/lib/contact-method";
import { parseHours, computeStatus } from "@/lib/hours";
import { useUserLocation } from "@/lib/user-location";
import { haversineKm, formatDistance } from "@/lib/distance";

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
  // MEH-798: also pull the Phosphor `icon` for the category chip below.
  const { color: categoryColor, icon: CategoryIcon } = styleForProducer(p);

  // MEH-826: open/closed-now status from the shared lib/hours parser.
  const th = useTranslations("opening_hours");
  const hoursMap = parseHours(p.opening_hours);
  const hoursStatus = hoursMap ? computeStatus(hoursMap) : null;

  // MEH-826: client-side distance — haversine(user GPS, producer lat/lng).
  // GPS is read from sessionStorage (useUserLocation); no fetch, no radius
  // param, no backend. Shows only for GPS users (null otherwise). Mirrors
  // ProducerCard.jsx:191-197.
  const userLoc = useUserLocation();
  const distanceLabel =
    userLoc && p.lat != null && p.lng != null
      ? formatDistance(haversineKm(userLoc.lat, userLoc.lng, p.lat, p.lng))
      : null;

  const deliveryMatch = userCity && Array.isArray(p.delivery_areas)
    ? p.delivery_areas.find((d) => d.city === userCity)
    : null;

  // MEH-296/MEH-17: dynamic CTA — href + icon follow the producer's chosen
  // primary_contact_method (whatsapp/phone/website/email). Null href → hide
  // the button (the "full profile" link below still reaches the producer).
  const primaryHref = getPrimaryContactHref(p);
  const primaryMethod = getPrimaryMethod(p);
  const ctaExternal = primaryMethod === "whatsapp" || isPrimaryExternal(p);
  const CtaIcon =
    { whatsapp: WhatsappLogo, phone: Phone, website: Globe, email: EnvelopeSimple }[primaryMethod] ||
    WhatsappLogo;

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
      // MEH-763: card-click is a mouse-only select-on-map affordance (handleCardClick →
      // highlight + flyTo, NOT navigation). The <article> is deliberately non-focusable
      // (no role/tabIndex/key handler) so it doesn't wrap its inner profile Link + CTA in a
      // nested-interactive button — those two links are the keyboard targets. The keyboard
      // path to select-on-map from the list is tracked in MEH-765.
      className={[
        "flex gap-3 bg-white border rounded-md overflow-hidden transition",
        active ? "border-primary border-2" : "border-border",
        onClick ? "cursor-pointer" : "",
      ].join(" ")}
      style={{ direction: "rtl" }}
    >
      {/* Thumbnail — RIGHT in RTL (first child) */}
      <div
        className="shrink-0 w-[88px] min-[1180px]:w-[88px] max-[1179px]:w-[72px] relative bg-green-50"
      >
        {imgSrc ? (
          <Image
            src={imgSrc}
            alt={p.name || ""}
            fill
            sizes="(max-width: 1179px) 72px, 88px"
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" aria-hidden="true"><Leaf size={24} className="text-primary/40" /></div>
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
          <h3 className="font-headline-md font-bold text-text line-clamp-1" style={{ fontSize: "17px" }}>
            {p.name}
          </h3>
          {/* MEH-798: category chip — icon-in-wash pill replaces the plain
              muted name line. Wash convention mirrors the legend rows.
              REUSES: frontend/app/[locale]/map/components/MapPane.jsx:170-176
              (20px wash + 12px icon, F1 flat — no shadow). */}
          {category?.name && CategoryIcon && (
            <div className="mt-0.5">
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs max-w-full"
                style={{ backgroundColor: `${categoryColor}1A`, color: categoryColor }}
              >
                <CategoryIcon size={12} weight="fill" aria-hidden="true" />
                <span className="line-clamp-1">{category.name}</span>
              </span>
            </div>
          )}
          {priceLabel && (
            <p className="font-english italic line-clamp-1 mt-0.5 text-accent numeric" style={{ fontSize: "13px" }}>
              {priceLabel}
            </p>
          )}
        </div>

        {/* MEH-826: open/closed-now line with clock — numerals LTR-isolated */}
        {hoursStatus && (
          <p className={`text-[12px] mt-1 inline-flex items-center gap-1 flex-wrap ${hoursStatus.isOpen ? "text-primary" : "text-fg-muted"}`}>
            <Clock size={12} weight="regular" aria-hidden="true" />
            {hoursStatus.isOpen ? (
              <>
                <span>{th("open_now")}</span>
                <span aria-hidden="true">·</span>
                <span dir="ltr">{hoursStatus.openTime}–{hoursStatus.closeTime}</span>
              </>
            ) : (
              <span>
                {th("closed_now")}
                {hoursStatus.nextDayKey
                  ? ` ${th("opens_at", { day: hoursStatus.nextIsTomorrow ? th("tomorrow") : th(`weekdays.${hoursStatus.nextDayKey}`), time: hoursStatus.nextTime })}`
                  : ""}
              </span>
            )}
          </p>
        )}

        {/* MEH-826: distance from the GPS user — full label LTR-isolated (bidi) */}
        {distanceLabel && (
          <p className="text-[12px] text-fg-muted mt-1">
            <span dir="ltr" data-testid="map-distance-pill">{distanceLabel}</span>
          </p>
        )}

        {/* Pills row */}
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {deliveryMatch && (
            <span className="text-[11px] bg-green-50 text-primary rounded-full px-2 py-0.5 inline-flex items-center gap-1">
              <Truck size={12} className="text-current" aria-hidden="true" />{t("distance_prefix")}{deliveryMatch.city} {deliveryMatch.delivery_day || ""}
            </span>
          )}
        </div>

        {/* Trust strip — verified + rating (Star icon; number LTR-isolated) */}
        {(isVerified || rating > 0) && (
          <p className="text-[12px] text-fg-muted mt-1 inline-flex items-center gap-1 flex-wrap">
            {isVerified && <span>{t("verified")}</span>}
            {isVerified && rating > 0 && <span aria-hidden="true">·</span>}
            {rating > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <Star size={12} weight="fill" className="text-accent" aria-hidden="true" />
                <span dir="ltr">{rating.toFixed(1)} ({reviewsCount})</span>
              </span>
            )}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 mt-1.5">
          {primaryHref && (
            <a
              href={primaryHref}
              target={ctaExternal ? "_blank" : undefined}
              rel={ctaExternal ? "noopener noreferrer" : undefined}
              onClick={(e) => { e.stopPropagation(); if (primaryMethod === "whatsapp" && waPhone) { try { navigator.sendBeacon?.(`/api/producers/${p.id}/whatsapp-click`); } catch {} } }}
              className={`${primaryMethod === "whatsapp" ? "bg-whatsapp" : "bg-primary"} text-white w-7 h-7 rounded-full flex items-center justify-center shrink-0`}
              aria-label={getPrimaryContactLabel(p)}
            >
              <CtaIcon size={14} weight="fill" aria-hidden="true" />
            </a>
          )}
          <Link
            href={baseHref}
            className="text-primary text-[13px] font-medium hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
{t("full_profile")} →
          </Link>
        </div>
      </div>
    </article>
  );
}
