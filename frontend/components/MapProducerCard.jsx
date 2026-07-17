"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Star, CaretRight } from "@phosphor-icons/react";
import { optimizeCloudinary } from "@/lib/cloudinary";
import { styleForProducer } from "@/lib/map-categories";
import { useUserLocation } from "@/lib/user-location";
import { haversineKm, formatDistance } from "@/lib/distance";

// MEH-1133: aspect at/above which a thumbnail source is treated as "logo-like"
// (wide banner/logo) and letterboxed (object-contain) instead of cropped
// (object-cover). 2.0 (≥2:1) catches wide logos while leaving normal landscape
// food photos (≤16:9 ≈ 1.78) filling the box as before.
const LOGO_ASPECT_MIN = 2;

// MEH-1243 (🔒 Pin-Echo): the selected card washes its background with 6% of the
// category color. Hex → rgba so any 6-digit CATEGORY_STYLES color works; falls
// back to brand green for a malformed value.
function categoryTint(hex, alpha) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return `rgba(46, 104, 83, ${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Module:   MapProducerCard
 * Purpose:  /map list "selection card" — image · name · rating-if-exists · meta
 *           line, plus ONE end-corner chevron as the only navigation affordance.
 *           Card = select (pin-sync), page = act.
 * Does NOT: hold a contact CTA / "full profile" link / verified seal / delivery
 *           pill — those live in MobileSheetSelectedCard + /producer (MEH-1243).
 * Related:  frontend/app/[locale]/map/components/MapCardList.jsx (useMapSync,
 *           active/hover wiring); frontend/lib/map-categories.js (CATEGORY_STYLES).
 * History:  MEH-826 (client distance); MEH-1133 (logo letterbox); MEH-1178
 *           (uniform template); MEH-1210 (price removed); MEH-1211 (broken-img
 *           fallback); MEH-1243 (Direction B + 🔒 Pin-Echo redesign).
 */
export default function MapProducerCard({ producer, active, onClick }) {
  const t = useTranslations("map.producer_card");
  const router = useRouter();
  const p = producer;
  const imgSrc = optimizeCloudinary(p.images?.[0]);
  // MEH-1133: default to cover (SSR/first paint) and flip to contain only once
  // the loaded image proves logo-like.
  const [thumbIsWide, setThumbIsWide] = useState(false);
  // MEH-1211: fall back to the category-glyph placeholder when a present-but-dead
  // image URL fails to load (avoids the browser broken-glyph + alt overflow).
  const [imgError, setImgError] = useState(false);
  const baseHref = p.slug ? `/${p.slug}` : `/producer/${p.id}`;
  const category = p.categories?.[0];
  // MEH-798/MEH-1243: category color + Phosphor glyph drive the meta line + the
  // pin-echo selected state + the no-photo placeholder.
  const { color: categoryColor, icon: CategoryIcon } = styleForProducer(p);

  // MEH-1243 (🔒 rating): Google format ★ X.X (N), shown only at ≥3 reviews. Below
  // the threshold the row still reserves its height so every card is equal-height.
  const reviewsCount = p.reviews_count || 0;
  const rating = Number(p.avg_rating || 0);
  const showRating = reviewsCount >= 3 && Number.isFinite(rating) && rating > 0;

  // MEH-826: client-side distance — haversine(user GPS, producer lat/lng). GPS is
  // read from sessionStorage (useUserLocation); shows only for GPS users (null
  // otherwise). Mirrors ProducerCard.jsx.
  const userLoc = useUserLocation();
  // MEH-1243 (🔒 §3): Hebrew unit, digits-first, no "ממך" suffix — rendered
  // inside the <bdi dir="ltr"> below. e.g. "1.2 ק"מ".
  const distanceLabel =
    userLoc && p.lat != null && p.lng != null
      ? formatDistance(haversineKm(userLoc.lat, userLoc.lng, p.lat, p.lng), { unit: "he", suffix: false })
      : null;

  // MEH-1243 (Direction B): body tap SELECTS an unselected card (pin-sync,
  // MEH-1010 — two-way, via onClick) and NAVIGATES a card that is already
  // selected (second-tap, no dblclick handler). The end-corner chevron <Link>
  // is the always-visible, screen-reader nav path; the `a, button` guard lets it
  // (and any inner link) own its own click.
  const handleRootClick = (e) => {
    if (e.target.closest("a, button")) return;
    if (active) {
      router.push(baseHref);
    } else if (onClick) {
      onClick(p);
    }
  };

  return (
    <article
      onClick={handleRootClick}
      data-testid="map-card"
      className={[
        // min-h + fixed rows = the uniform-template equal-height guarantee.
        "flex gap-3 bg-white border border-border rounded-md overflow-hidden transition-colors min-h-[112px] p-2",
        onClick || active ? "cursor-pointer" : "",
      ].join(" ")}
      // MEH-1243 (🔒 Pin-Echo): selected = 2px category-color border + 6% tint +
      // padding 8→7px, so the 1px→2px border swap keeps border+padding = 9px on
      // every side (border-box) → identical content box, zero layout jump.
      style={{
        direction: "rtl",
        ...(active && {
          borderWidth: "2px",
          borderColor: categoryColor,
          backgroundColor: categoryTint(categoryColor, 0.06),
          padding: "7px",
        }),
      }}
    >
      {/* Thumbnail — START (right in RTL, first child). #EAF3DE placeholder tile. */}
      <div
        className="shrink-0 self-stretch w-[88px] min-[1180px]:w-[88px] max-[1179px]:w-[72px] relative rounded overflow-hidden"
        style={{ backgroundColor: "#EAF3DE" }}
        data-testid="map-thumb"
      >
        {imgSrc && !imgError ? (
          <Image
            src={imgSrc}
            alt={p.name || ""}
            fill
            sizes="(max-width: 1179px) 72px, 88px"
            // MEH-1133: a logo-like wide image letterboxes (object-contain) on the
            // #EAF3DE tile; a normal photo keeps object-cover (full bleed).
            onLoad={(e) => {
              const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
              if (w && h) setThumbIsWide(w / h >= LOGO_ASPECT_MIN);
            }}
            onError={() => setImgError(true)}
            className={thumbIsWide ? "object-contain" : "object-cover"}
          />
        ) : (
          // MEH-1243 (🔒 placeholder): category glyph at 70% of the pin color.
          <div className="w-full h-full flex items-center justify-center" aria-hidden="true">
            <CategoryIcon size={32} weight="light" style={{ color: categoryColor, opacity: 0.7 }} />
          </div>
        )}
      </div>

      {/* Text content — center column. Three fixed-height rows → uniform cards. */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
        <h3 className="font-headline-md font-bold text-text line-clamp-1" style={{ fontSize: "17px" }}>
          {p.name}
        </h3>

        {/* Meta line — category FIRST (muted glyph + truncating text), distance
            LAST (flex-shrink-0, never truncates). MEH-1296: sits directly under
            the name, above the rating row. The distance <bdi> has no dir override
            so it auto-resolves to RTL and reads digits-first ("1.2 ק"מ"). 🔒 §3. */}
        <p className="text-[13px] leading-5 text-fg-muted flex items-center min-w-0" data-testid="map-meta-line">
          {category?.name && (
            <span className="inline-flex items-center gap-1 min-w-0">
              <CategoryIcon size={14} weight="regular" aria-hidden="true" className="shrink-0 text-fg-muted" />
              <span className="truncate">{category.name}</span>
            </span>
          )}
          {distanceLabel && (
            <span className="shrink-0 whitespace-nowrap">
              {category?.name && <span className="mx-1" aria-hidden="true">·</span>}
              <bdi data-testid="map-distance-pill">{distanceLabel}</bdi>
            </span>
          )}
        </p>

        {/* Rating row — reserves its height ALWAYS; renders content only at ≥3
            reviews (uniform-height guarantee, 🔒 §5). MEH-1296: below the meta line. */}
        <div className="h-[18px] flex items-center" data-testid="map-rating-row">
          {showRating && (
            <span className="inline-flex items-center gap-0.5 text-[12px] text-fg-muted" data-testid="map-rating">
              <Star size={12} weight="fill" className="text-accent" aria-hidden="true" />
              {/* 🔒 §7: ★ X.X (N), whole numeric block dir="ltr". */}
              <bdi dir="ltr">{rating.toFixed(1)} ({reviewsCount})</bdi>
            </span>
          )}
        </div>
      </div>

      {/* End-corner chevron — the ONLY nav affordance. Full-height 44px column →
          ≥44×44 hit area (§V). MEH-938: CaretRight + rtl:rotate-180 = forward in he.
          MEH-1296: border-s hairline divider separates it from the text; softer
          CaretRight glyph. Recolors to the pin color when selected (🔒 §1). */}
      <Link
        href={baseHref}
        onClick={(e) => e.stopPropagation()}
        aria-label={t("full_profile")}
        data-testid="map-chevron"
        className="shrink-0 self-stretch w-11 flex items-center justify-center rounded border-s border-border text-fg-muted hover:text-primary focus-visible:text-primary transition-colors focus-ring"
        style={active ? { color: categoryColor } : undefined}
      >
        <CaretRight size={18} weight="regular" aria-hidden="true" className="rtl:rotate-180" />
      </Link>
    </article>
  );
}
