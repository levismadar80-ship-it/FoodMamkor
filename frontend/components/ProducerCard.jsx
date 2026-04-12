"use client";

import Link from "next/link";
import Image from "next/image";
import { Seal, Leaf, Cow } from "@phosphor-icons/react";
import CategoryTag from "./CategoryTag";
import { optimizeCloudinary } from "@/lib/cloudinary";
import { normalizePhone } from "@/lib/utils";

function WhatsAppIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M20.52 3.48A11.9 11.9 0 0012.04 0C5.45 0 .1 5.35.1 11.94c0 2.1.55 4.15 1.6 5.96L0 24l6.27-1.64a11.9 11.9 0 005.77 1.47h.01c6.59 0 11.94-5.35 11.94-11.94 0-3.19-1.24-6.19-3.47-8.41zM12.04 21.8a9.86 9.86 0 01-5.03-1.38l-.36-.21-3.72.97.99-3.62-.23-.37a9.84 9.84 0 01-1.51-5.25c0-5.45 4.44-9.88 9.9-9.88a9.87 9.87 0 017 2.89 9.83 9.83 0 012.9 7c-.01 5.45-4.45 9.85-9.94 9.85zm5.43-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15s-.77.97-.94 1.17c-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.65-2.04-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.34z"/>
    </svg>
  );
}

function PhoneIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  );
}

function InstagramIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
    </svg>
  );
}

export default function ProducerCard({ producer, active, onClick, referrer }) {
  // FINAL_AUDIT: Cloudinary f_auto,q_auto — WebP/AVIF automatic delivery.
  const imgSrc = optimizeCloudinary(producer.images?.[0]);
  // tasks_for_claude_code.md task 17: shared normalizer replaces the
  // previous inline logic that had an order-of-operations bug on inputs
  // with leading whitespace. See lib/utils.js.
  const whatsappNumber = normalizePhone(producer.phone) || null;
  // feature/producer-analytics — append ?from={referrer} so the producer
  // dashboard's search_appearances metric can tell search-referred views
  // apart from direct / bookmark views. Callers: ProducersGrid on the
  // homepage passes "home"; /map passes "map"; the category pill filter
  // passes "category". No referrer → direct/unknown view.
  const baseHref = producer.slug ? `/${producer.slug}` : `/producer/${producer.id}`;
  const producerHref = referrer ? `${baseHref}?from=${referrer}` : baseHref;

  const priceLabel = producer.price_range || producer.starting_price_label;

  const handleRootClick = (e) => {
    if (onClick) {
      // Don't hijack clicks on child interactive elements
      if (e.target.closest("a, button")) return;
      onClick(producer);
    }
  };

  return (
    <article
      onClick={handleRootClick}
      className={[
        "bg-background overflow-hidden border transition flex flex-col",
        "hover:shadow-[0_8px_32px_rgba(46,104,83,0.12)] hover:-translate-y-0.5",
        active ? "border-primary ring-2 ring-primary" : "border-border",
        onClick ? "cursor-pointer" : "",
      ].join(" ")}
      style={{ borderRadius: "16px" }}
    >
      <Link href={producerHref}>
        <div className="relative w-full bg-light h-[140px] md:h-[200px]" style={{ borderRadius: "16px 16px 0 0", overflow: "hidden" }}>
          {imgSrc ? (
            <Image
              src={imgSrc}
              alt={producer.name}
              fill
              className="object-cover transition duration-300 hover:scale-105"
              sizes="(max-width: 768px) 50vw, (max-width: 1200px) 50vw, 25vw"
            />
          ) : (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center text-primary"
              aria-label={`${producer.name} — תמונה חסרה`}
            >
              <Leaf size={56} weight="duotone" aria-hidden="true" />
              <span className="font-headline text-sm mt-1 opacity-70">מהמקור</span>
            </div>
          )}
          {producer.is_verified && (
            <span className="absolute top-3 left-3 bg-primary text-white text-xs px-2 py-1 rounded-full inline-flex items-center gap-1">
              <Seal size={14} weight="fill" aria-hidden="true" />
              מאומת
            </span>
          )}
          {producer.plan === "premium" && (
            <span className="absolute top-3 right-3 bg-accent text-white text-xs px-2 py-1 rounded-full">
              פרמיום
            </span>
          )}
          {producer.is_available_today && (
            <span className="absolute bottom-3 right-3 bg-secondary text-white text-xs px-2 py-1 rounded-full font-semibold">
              זמין היום
            </span>
          )}
        </div>
      </Link>

      <div className="p-4 flex-1 flex flex-col">
        <Link href={producerHref}>
          <h3 className="font-headline font-bold text-site-text hover:text-primary transition leading-snug truncate" style={{ fontSize: "18px" }}>
            {producer.name}
          </h3>
        </Link>

        <p className="text-[13px] text-site-muted mt-1 truncate">
          {producer.city}
          {producer.categories?.[0] && (
            <> · {producer.categories[0].emoji} {producer.categories[0].name}</>
          )}
        </p>

        {producer.reviews_count > 0 && (
          <p className="text-xs text-site-muted mt-1">
            ⭐ {Number(producer.avg_rating).toFixed(1)}
            <span className="mr-1">({producer.reviews_count})</span>
          </p>
        )}

        {producer.top_product_name && (
          <p className="text-sm text-site-text/85 mt-2 truncate">{producer.top_product_name}</p>
        )}

        {/* Pill badges */}
        <div className="flex flex-wrap mt-2" style={{ gap: "6px" }}>
          {producer.organic_certified && (
            <span className="bg-light text-primary inline-flex items-center gap-1" style={{ borderRadius: "20px", padding: "3px 10px", fontSize: "12px" }}>
              <Leaf size={14} weight="duotone" aria-hidden="true" />
              אורגני
            </span>
          )}
          {producer.grass_fed && (
            <span className="bg-light text-primary inline-flex items-center gap-1" style={{ borderRadius: "20px", padding: "3px 10px", fontSize: "12px" }}>
              <Cow size={14} weight="duotone" aria-hidden="true" />
              גראס פד
            </span>
          )}
          {producer.kosher && (
            <span className="bg-light text-primary" style={{ borderRadius: "20px", padding: "3px 10px", fontSize: "12px" }}>
              ✡️ {producer.kosher}
            </span>
          )}
          {producer.categories?.slice(0, 1).map((cat) => (
            <CategoryTag key={cat.id} category={cat} />
          ))}
        </div>

        {/* Footer row: price + icons + CTA */}
        <div
          className="mt-auto flex items-center justify-between border-t border-border"
          style={{ padding: "12px 0 0 0", marginTop: "16px" }}
        >
          <div className="flex items-center" style={{ gap: "6px" }}>
            {whatsappNumber && (
              <a
                href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`היי! מצאתי אותך במהמקור — ${producer.name}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                title="WhatsApp"
                aria-label="שלח הודעה בווטסאפ"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center justify-center rounded-full hover:bg-light transition text-primary"
                style={{ width: "44px", height: "44px" }}
              >
                <WhatsAppIcon className="w-5 h-5" />
              </a>
            )}
            {producer.phone && (
              <a
                href={`tel:${producer.phone}`}
                title="טלפון"
                aria-label="התקשר לבית העסק"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center justify-center rounded-full hover:bg-light transition text-primary"
                style={{ width: "44px", height: "44px" }}
              >
                <PhoneIcon className="w-5 h-5" />
              </a>
            )}
            {producer.instagram && (
              <a
                href={`https://instagram.com/${producer.instagram}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Instagram"
                aria-label="עמוד אינסטגרם"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center justify-center rounded-full hover:bg-light transition text-primary"
                style={{ width: "44px", height: "44px" }}
              >
                <InstagramIcon className="w-5 h-5" />
              </a>
            )}
          </div>
          <div className="flex items-center gap-3">
            {priceLabel && (
              <span className="font-body font-semibold text-accent text-sm">
                {priceLabel}
              </span>
            )}
            <Link
              href={producerHref}
              className="border border-primary text-primary text-[13px] hover:bg-primary hover:text-white transition"
              style={{ borderRadius: "8px", padding: "10px 14px" }}
            >
              מידע נוסף
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
