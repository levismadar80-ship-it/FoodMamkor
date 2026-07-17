"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Star, Truck, Leaf, WhatsappLogo, Phone, Globe, EnvelopeSimple, SealCheck, ArrowRight } from "@phosphor-icons/react";
import { optimizeCloudinary } from "@/lib/cloudinary";
import { useUserCity } from "@/lib/use-user-city";
import { styleForProducer } from "@/lib/map-categories";
import { getPrimaryContactHref, getPrimaryMethod, getPrimaryContactLabel, isPrimaryExternal } from "@/lib/contact-method";
import { useUserLocation } from "@/lib/user-location";
import { haversineKm, formatDistance } from "@/lib/distance";

// MEH-1133: aspect at/above which a thumbnail source is treated as "logo-like"
// (wide banner/logo) and letterboxed (object-contain) instead of cropped
// (object-cover). 2.0 (≥2:1) catches wide logos like the MEHA MEKOR wordmark
// (~3:1, which object-cover cropped to "NEHA MEK") while leaving normal
// landscape food photos (≤16:9 ≈ 1.78) filling the box as before.
const LOGO_ASPECT_MIN = 2;

export default function MapProducerCard({ producer, active, onClick }) {
  const t = useTranslations("map.producer_card");
  const { city: userCity } = useUserCity();
  const p = producer;
  const imgSrc = optimizeCloudinary(p.images?.[0]);
  // MEH-1133: default to cover (SSR/first paint) and flip to contain only once
  // the loaded image proves logo-like — so wide logos letterbox on the green-50
  // box instead of cropping, while photos keep the full-bleed cover look.
  const [thumbIsWide, setThumbIsWide] = useState(false);
  // MEH-1211: fall back to the leaf thumb placeholder when a present-but-dead
  // image URL fails to load (avoids the browser broken-glyph + alt overflow).
  const [imgError, setImgError] = useState(false);
  const baseHref = p.slug ? `/${p.slug}` : `/producer/${p.id}`;
  const category = p.categories?.[0];
  const priceLabel = p.starting_price_label || p.price_range;
  // MEH-934: split the price so only the numeric run renders Cormorant italic,
  // bidi-isolated — fixes "מ-35₪" reversing in RTL. The ₪ is excluded from the
  // prefix class so a shekel-first label ("₪35") keeps the currency with the
  // number in Cormorant rather than splitting it off.
  // 3-part split (prefix)(digitRun)(suffix): the old 2-part regex sent
  // everything after the first digit — including Hebrew unit words ("/בקבוק")
  // — into the Cormorant <bdi>; Cormorant has no Hebrew glyphs → fallback
  // garble. Brand LOCK: Cormorant = Latin/numerals ONLY. The digit run keeps
  // . , ₪ and - (ranges like "35-50") with the numerals; prefix + suffix stay
  // in the Hebrew body font. A label with no digits at all renders whole in
  // the body font (priceMatch null → prefix fallback).
  const priceMatch = priceLabel ? priceLabel.match(/^([^\d₪]*)([\d.,₪-]+)(.*)$/) : null;
  const pricePrefix = priceMatch ? priceMatch[1] : priceLabel || "";
  const priceNumber = priceMatch?.[2] ?? "";
  const priceSuffix = priceMatch?.[3] ?? "";
  const isVerified = p.verification_tier === "verified"; // MEH-766 ch1: doc-verification tier
  const rating = Number(p.avg_rating || 0);
  const reviewsCount = p.reviews_count || 0;
  // MEH-798: also pull the Phosphor `icon` for the category chip below.
  const { color: categoryColor, textColor: categoryTextColor, icon: CategoryIcon } = styleForProducer(p);

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
        // min-h keeps sparse cards (no chip / no meta) the same height as fully
        // populated ones — the uniform template's equal-height guarantee.
        "flex gap-3 bg-white border rounded-md overflow-hidden transition min-h-[128px]",
        active ? "border-primary border-2" : "border-border",
        onClick ? "cursor-pointer" : "",
      ].join(" ")}
      style={{ direction: "rtl" }}
    >
      {/* Thumbnail — RIGHT in RTL (first child) */}
      <div
        className="shrink-0 w-[88px] min-[1180px]:w-[88px] max-[1179px]:w-[72px] relative bg-green-50"
      >
        {imgSrc && !imgError ? (
          <Image
            src={imgSrc}
            alt={p.name || ""}
            fill
            sizes="(max-width: 1179px) 72px, 88px"
            // MEH-1133: measure the loaded source's intrinsic aspect; a logo-like
            // wide image letterboxes (object-contain) on the green-50 box so the
            // full wordmark shows, a normal photo keeps object-cover (full bleed).
            onLoad={(e) => {
              const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
              if (w && h) setThumbIsWide(w / h >= LOGO_ASPECT_MIN);
            }}
            onError={() => setImgError(true)}
            className={thumbIsWide ? "object-contain" : "object-cover"}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" aria-hidden="true"><Leaf size={24} className="text-primary/40" /></div>
        )}
      </div>

      {/* Text content — LEFT in RTL */}
      <div className="flex-1 py-2 pe-3 min-w-0 flex flex-col justify-between">
        <div>
          <h3 className="font-headline-md font-bold text-text line-clamp-1" style={{ fontSize: "17px" }}>
            {p.name}
          </h3>
          {/* MEH-798 */}
          {/* REUSES: frontend/app/[locale]/map/components/MapPane.jsx:170-176
              — 20px wash + 12px icon, F1 flat (no shadow). */}
          {/* Uniform-template slot 3 — category chip · rating · verified seal on ONE
              line. The separate trust strip is gone: rating (Star + LTR-isolated
              number) and the SealCheck (icon-only, aria-label carries t("verified"))
              moved up here so every card stacks the same slots. */}
          {(category?.name || rating > 0 || isVerified) && (
            <div className="mt-0.5 flex h-6 items-center gap-1.5 min-w-0">
              {category?.name && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs min-w-0"
                  style={{ backgroundColor: `${categoryColor}1A`, color: categoryTextColor || categoryColor }}
                >
                  <CategoryIcon size={12} weight="fill" aria-hidden="true" />
                  <span className="line-clamp-1">{category.name}</span>
                </span>
              )}
              {rating > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[12px] text-fg-muted shrink-0">
                  <Star size={12} weight="fill" className="text-accent" aria-hidden="true" />
                  <bdi dir="ltr">{rating.toFixed(1)} ({reviewsCount})</bdi>
                </span>
              )}
              {/* MEH-938: ✓ dingbat → Phosphor SealCheck (glyph-LOCK) */}
              {isVerified && (
                <SealCheck size={13} className="text-fg-muted shrink-0" role="img" aria-label={t("verified")} />
              )}
            </div>
          )}
          {/* Uniform-template slot 4 — ONE meta line: {city} · {distance} · {price}.
              Replaces the old standalone distance <p> and the separate price line. */}
          {(p.city || distanceLabel || priceLabel) && (
            <p className="text-[13px] leading-5 text-fg-muted line-clamp-1 mt-0.5" data-testid="map-meta-line">
              {p.city}
              {distanceLabel && (
                <>
                  {p.city ? " · " : ""}
                  <span dir="ltr" data-testid="map-distance-pill">{distanceLabel}</span>
                </>
              )}
              {priceLabel && (
                <>
                  {p.city || distanceLabel ? " · " : ""}
                  {pricePrefix && <span className="font-body-md">{pricePrefix}</span>}
                  {priceNumber && <bdi className="font-english italic numeric">{priceNumber}</bdi>}
                  {priceSuffix && <span className="font-body-md">{priceSuffix}</span>}
                </>
              )}
            </p>
          )}
        </div>

        {/* Delivery pill — the only conditional slot (user-relevant: renders
            solely when the producer delivers to the visitor's own city) */}
        {deliveryMatch && (
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="text-[11px] bg-green-50 text-primary rounded-full px-2 py-0.5 inline-flex items-center gap-1">
              <Truck size={12} className="text-current" aria-hidden="true" />{t("distance_prefix")}{deliveryMatch.city} {deliveryMatch.delivery_day || ""}
            </span>
          </div>
        )}

        {/* Actions — min-h reserves the 28px contact-button slot even when the
            producer has no primary CTA, so link-only cards stay the same height */}
        <div className="flex items-center gap-2 mt-1.5 min-h-[28px]">
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
            className="inline-flex items-center gap-0.5 text-primary text-[13px] font-medium hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {/* MEH-938: → dingbat → Phosphor ArrowRight; rtl:rotate-180 = reading-forward in he (MEH-867/877 pattern) */}
            {t("full_profile")}
            <ArrowRight size={13} weight="bold" aria-hidden="true" className="rtl:rotate-180" />
          </Link>
        </div>
      </div>
    </article>
  );
}
