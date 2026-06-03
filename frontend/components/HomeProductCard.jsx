"use client";

import Image from "next/image";
import { CalendarBlank, House, Leaf, MagnifyingGlass, MapPin, Warning } from "@phosphor-icons/react";
import StarRating from "./StarRating";
import WhatsAppButton from "./WhatsAppButton";
import { optimizeCloudinary } from "@/lib/cloudinary";
import { BRAND_NAME } from "@/lib/constants";

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "short" });
  } catch {
    return iso;
  }
}

// TODO MEH-543: i18n after /neighbor activation post-launch
function storageEmoji(type) {
  if (type === "מקרר") return "❄️";
  if (type === "מקפיא") return "🧊";
  if (type === "טמפרטורת חדר") return "🌡️";
  return "";
}

export default function HomeProductCard({ product, onWhatsAppClick }) {
  // FINAL_AUDIT: Cloudinary f_auto,q_auto for automatic WebP/AVIF.
  const imgSrc = optimizeCloudinary(
    (product.images && product.images[0]) || product.photo
  );
  const priceNum = product.price != null ? Number(product.price) : null;
  const isFree = priceNum === 0;

  return (
    <div className="bg-white rounded-[16px] overflow-hidden hover:shadow-md transition border border-border h-full flex flex-col">
      {/* MEH-25 Pattern 2 — explicit #F5F0E8 so empty-image state is
          consistent with ProducerCard + ImageGallery. House Phosphor
          icon replaces the 🍲 emoji for cross-platform consistency. */}
      <div className="relative h-48" style={{ background: "#F5F0E8" }}>
        {imgSrc ? (
          <Image
            src={imgSrc}
            alt={product.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 33vw"
          />
        ) : (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-primary"
            aria-label={`${product.title} — תמונה חסרה`}
            data-testid="homeproduct-empty-image"
          >
            <House size={36} weight="duotone" aria-hidden="true" />
            <span className="font-headline-md text-sm opacity-70">מהמטבח של השכן</span>
          </div>
        )}
        <span className="absolute top-3 end-3 bg-primary text-white text-xs px-2 py-1 rounded-full inline-flex items-center gap-1">
          ביתי
          <House size={14} weight="fill" aria-hidden="true" />
        </span>
        {product.moderation_status === "FLAGGED" && (
          <span
            className="absolute top-3 start-3 bg-green-50 text-accent border border-accent/30 text-xs px-2 py-1 rounded-full"
            title={product.moderation_reason || "המודעה בבדיקת אדמין"}
          >
            <MagnifyingGlass size={14} weight="bold" aria-hidden="true" className="inline" /> בבדיקה
          </span>
        )}
        {product.moderation_status !== "FLAGGED" && product.avg_rating !== null && product.avg_rating < 3 && (
          <span className="absolute top-3 start-3 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
            <Warning size={14} weight="fill" aria-hidden="true" className="inline" /> דירוג נמוך
          </span>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-headline-md font-bold text-lg mb-1 text-text">{product.title}</h3>

        {/* Trust badges */}
        <div className="flex flex-wrap gap-1 mb-2">
          {product.is_organic && (
            <span className="bg-green-50 text-primary text-[11px] px-2 py-0.5 rounded-full border border-primary/20 inline-flex items-center gap-0.5">
              <Leaf size={13} weight="duotone" aria-hidden="true" />
              אורגני
            </span>
          )}
          {product.kosher && product.kosher !== "לא ידוע" && (
            <span className="bg-green-50 text-primary text-[11px] px-2 py-0.5 rounded-full border border-primary/20">
              ✡️ {product.kosher}
            </span>
          )}
          {product.storage_type && (
            <span className="bg-green-50 text-primary text-[11px] px-2 py-0.5 rounded-full border border-primary/20">
              {storageEmoji(product.storage_type)} {product.storage_type}
            </span>
          )}
          {product.category && (
            <span className="bg-green-50 text-primary text-[11px] px-2 py-0.5 rounded-full border border-primary/20">
              {product.category}
            </span>
          )}
        </div>

        {/* Dates */}
        {(product.prep_date || product.expiry_date) && (
          <p className="text-xs text-fg-muted mb-2">
            {product.prep_date && <><CalendarBlank size={13} weight="duotone" aria-hidden="true" className="inline align-[-2px]" /> הוכן: {formatDate(product.prep_date)}</>}
            {product.prep_date && product.expiry_date && " · "}
            {product.expiry_date && <>עד: {formatDate(product.expiry_date)}</>}
          </p>
        )}

        {/* Allergens warning */}
        {product.allergens && (
          <p className="text-xs text-fg-muted mb-2" title={product.allergens}>
            <Warning size={13} weight="fill" aria-hidden="true" className="inline align-[-2px]" /> אלרגנים: {product.allergens.length > 50 ? product.allergens.slice(0, 50) + "…" : product.allergens}
          </p>
        )}

        {/* Location + price */}
        <div className="flex items-center justify-between mb-2">
          <p className="text-fg-muted text-sm">
            <MapPin size={14} weight="duotone" aria-hidden="true" className="inline align-[-2px]" /> {product.neighborhood || product.city}
          </p>
          <span className="font-semibold text-accent">
            {isFree
              ? "🎁 במתנה"
              : priceNum != null
                ? `₪${priceNum.toFixed(0)}${product.unit ? ` / ${product.unit}` : ""}`
                : ""}
          </span>
        </div>

        {product.quantity && (
          <p className="text-xs text-fg-muted mb-2">
            כמות זמינה: {product.quantity} {product.unit || ""}
          </p>
        )}

        {product.seller_name && (
          <p className="text-xs text-fg-muted mb-2">מוכר: {product.seller_name}</p>
        )}

        <StarRating avg={product.avg_rating} count={product.rating_count} />

        {/* WhatsApp CTA pinned to the bottom of the flex column so cards
            of different content lengths line up in the grid */}
        <div className="mt-auto pt-3">
          <WhatsAppButton phone={product.phone} productTitle={product.title} onClick={onWhatsAppClick} />
        </div>

        {/* Directory-only disclaimer — required by Israeli consumer
            protection law on every home-listing card. */}
        <p className="mt-3 text-[11px] text-fg-muted leading-snug border-t border-border pt-2">
          <span className="font-semibold text-text">{BRAND_NAME}</span> היא
          פלטפורמה בלבד. האחריות על המוצרים ורישוי המוכר חלה על המוכר
          בלבד.
        </p>
      </div>
    </div>
  );
}
