"use client";

import Image from "next/image";
import Tooltip from "./ui/Tooltip";
import StarRating from "./StarRating";
import WhatsAppButton from "./WhatsAppButton";

export default function HomeProductCard({ product, onWhatsAppClick }) {
  const imgSrc = product.photo || "https://placehold.co/400x300?text=ביתי";

  return (
    <div className="bg-white rounded-[12px] overflow-hidden hover:shadow-md transition">
      <div className="relative h-48 bg-gray-100">
        <Image
          src={imgSrc}
          alt={product.title}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 33vw"
        />
        <Tooltip content="מוצר ביתי שמוכר ישירות על ידי שכן — האחריות על המוכר" position="bottom">
          <span className="absolute top-3 left-3 bg-secondary text-white text-xs px-2 py-1 rounded-full cursor-help">
            ביתי 🏠
          </span>
        </Tooltip>
        {product.avg_rating !== null && product.avg_rating < 3 && (
          <span className="absolute top-3 right-3 bg-yellow-400 text-yellow-900 text-xs px-2 py-1 rounded-full">
            ⚠️ דירוג נמוך
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-lg mb-1">{product.title}</h3>
        <div className="flex items-center justify-between mb-2">
          <p className="text-text-secondary text-sm">{product.neighborhood || product.city}</p>
          {product.price && (
            <span className="text-primary font-semibold">₪{Number(product.price).toFixed(0)}</span>
          )}
        </div>
        {product.seller_name && (
          <p className="text-xs text-text-secondary mb-2">מוכר: {product.seller_name}</p>
        )}
        <StarRating avg={product.avg_rating} count={product.rating_count} />
        <div className="mt-3">
          <WhatsAppButton phone={product.phone} productTitle={product.title} onClick={onWhatsAppClick} />
        </div>
      </div>
    </div>
  );
}
