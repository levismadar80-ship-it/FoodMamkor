"use client";

import Image from "next/image";
import StarRating from "./StarRating";
import WhatsAppButton from "./WhatsAppButton";
import { optimizeCloudinary } from "@/lib/cloudinary";

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "short" });
  } catch {
    return iso;
  }
}

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
      <div className="relative h-48 bg-light">
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
            className="absolute inset-0 flex flex-col items-center justify-center text-primary"
            aria-label={`${product.title} — תמונה חסרה`}
          >
            <span className="text-5xl" aria-hidden="true">🍲</span>
            <span className="font-headline text-sm mt-1 opacity-70">מהמטבח</span>
          </div>
        )}
        <span className="absolute top-3 left-3 bg-secondary text-white text-xs px-2 py-1 rounded-full">
          ביתי 🏠
        </span>
        {product.moderation_status === "FLAGGED" && (
          <span
            className="absolute top-3 right-3 text-xs px-2 py-1 rounded-full"
            style={{ background: "#FFF9E6", color: "#946A00", border: "1px solid #F0C040" }}
            title={product.moderation_reason || "המודעה בבדיקת אדמין"}
          >
            🔍 בבדיקה
          </span>
        )}
        {product.moderation_status !== "FLAGGED" && product.avg_rating !== null && product.avg_rating < 3 && (
          <span className="absolute top-3 right-3 bg-yellow-400 text-yellow-900 text-xs px-2 py-1 rounded-full">
            ⚠️ דירוג נמוך
          </span>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-headline font-bold text-lg mb-1 text-site-text">{product.title}</h3>

        {/* Trust badges */}
        <div className="flex flex-wrap gap-1 mb-2">
          {product.is_organic && (
            <span className="bg-light text-primary text-[11px] px-2 py-0.5 rounded-full border border-primary/20">
              🌿 אורגני
            </span>
          )}
          {product.kosher && product.kosher !== "לא ידוע" && (
            <span className="bg-light text-primary text-[11px] px-2 py-0.5 rounded-full border border-primary/20">
              ✡️ {product.kosher}
            </span>
          )}
          {product.storage_type && (
            <span className="bg-light text-primary text-[11px] px-2 py-0.5 rounded-full border border-primary/20">
              {storageEmoji(product.storage_type)} {product.storage_type}
            </span>
          )}
          {product.category && (
            <span className="bg-light text-primary text-[11px] px-2 py-0.5 rounded-full border border-primary/20">
              {product.category}
            </span>
          )}
        </div>

        {/* Dates */}
        {(product.prep_date || product.expiry_date) && (
          <p className="text-xs text-site-muted mb-2">
            {product.prep_date && <>📅 הוכן: {formatDate(product.prep_date)}</>}
            {product.prep_date && product.expiry_date && " · "}
            {product.expiry_date && <>עד: {formatDate(product.expiry_date)}</>}
          </p>
        )}

        {/* Allergens warning */}
        {product.allergens && (
          <p className="text-xs text-site-muted mb-2" title={product.allergens}>
            ⚠️ אלרגנים: {product.allergens.length > 50 ? product.allergens.slice(0, 50) + "…" : product.allergens}
          </p>
        )}

        {/* Location + price */}
        <div className="flex items-center justify-between mb-2">
          <p className="text-site-muted text-sm">
            📍 {product.neighborhood || product.city}
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
          <p className="text-xs text-site-muted mb-2">
            כמות זמינה: {product.quantity} {product.unit || ""}
          </p>
        )}

        {product.seller_name && (
          <p className="text-xs text-site-muted mb-2">מוכר: {product.seller_name}</p>
        )}

        <StarRating avg={product.avg_rating} count={product.rating_count} />

        {/* WhatsApp CTA pinned to the bottom of the flex column so cards
            of different content lengths line up in the grid */}
        <div className="mt-auto pt-3">
          <WhatsAppButton phone={product.phone} productTitle={product.title} onClick={onWhatsAppClick} />
        </div>
      </div>
    </div>
  );
}
