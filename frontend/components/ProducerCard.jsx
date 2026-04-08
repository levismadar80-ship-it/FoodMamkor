"use client";

import Link from "next/link";
import Image from "next/image";
import CategoryTag from "./CategoryTag";

export default function ProducerCard({ producer }) {
  const imgSrc = producer.images?.[0] || "https://placehold.co/400x300?text=מהמקור";
  const phone = producer.phone;
  const whatsappNumber = phone ? phone.replace(/^0/, "972").replace(/[-\s]/g, "") : null;
  const producerHref = producer.slug ? `/${producer.slug}` : `/producer/${producer.id}`;

  const priceLabel = producer.price_range || producer.starting_price_label;

  return (
    <div className="bg-background rounded-[16px] overflow-hidden border border-border hover:shadow-md transition group flex flex-col">
      <Link href={producerHref}>
        {/* Image is 55% of top */}
        <div className="relative h-56 bg-border/40">
          <Image
            src={imgSrc}
            alt={producer.name}
            fill
            className="object-cover group-hover:scale-105 transition duration-300"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
          />
          {producer.is_verified && (
            <span className="absolute top-3 left-3 bg-primary text-white text-xs px-2 py-1 rounded-full">
              ✅ מאומת
            </span>
          )}
          {producer.plan === "premium" && (
            <span className="absolute top-3 right-3 bg-accent text-white text-xs px-2 py-1 rounded-full">
              פרמיום
            </span>
          )}
        </div>
      </Link>

      <div className="p-4 flex-1 flex flex-col">
        <Link href={producerHref}>
          <h3 className="font-serif font-bold text-lg mb-1 text-site-text hover:text-primary transition leading-snug">
            {producer.name}
          </h3>
        </Link>

        <p className="text-site-text/60 text-[13px] mb-2">
          {producer.city}
          {producer.categories?.[0] && (
            <> · {producer.categories[0].emoji} {producer.categories[0].name}</>
          )}
        </p>

        {producer.top_product_name && (
          <p className="text-sm text-site-text/80 mb-2">{producer.top_product_name}</p>
        )}

        {/* Badges */}
        <div className="flex flex-wrap gap-1 mb-3">
          {producer.organic_certified && (
            <span className="bg-light text-primary text-[11px] px-2 py-0.5 rounded-full border border-primary/20">
              🌿 אורגני
            </span>
          )}
          {producer.grass_fed && (
            <span className="bg-light text-primary text-[11px] px-2 py-0.5 rounded-full border border-primary/20">
              🐄 גראס פד
            </span>
          )}
          {producer.kosher && (
            <span className="bg-light text-primary text-[11px] px-2 py-0.5 rounded-full border border-primary/20">
              ✡️ {producer.kosher}
            </span>
          )}
          {producer.categories?.slice(0, 2).map((cat) => (
            <CategoryTag key={cat.id} category={cat} />
          ))}
        </div>

        {/* Contact row + CTA */}
        <div className="mt-auto flex items-center justify-between pt-3 border-t border-border">
          <div className="flex items-center gap-3">
            {whatsappNumber && (
              <a
                href={`https://wa.me/${whatsappNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-lg hover:scale-110 transition"
                title="WhatsApp"
                onClick={(e) => e.stopPropagation()}
              >
                💬
              </a>
            )}
            {phone && (
              <a
                href={`tel:${phone}`}
                className="text-lg hover:scale-110 transition"
                title="טלפון"
                onClick={(e) => e.stopPropagation()}
              >
                📞
              </a>
            )}
            {producer.instagram && (
              <a
                href={`https://instagram.com/${producer.instagram}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-lg hover:scale-110 transition"
                title="Instagram"
                onClick={(e) => e.stopPropagation()}
              >
                📷
              </a>
            )}
            {priceLabel && (
              <span className="text-sm font-semibold" style={{ color: "#8B6914" }}>
                {priceLabel}
              </span>
            )}
          </div>
          <Link
            href={producerHref}
            className="text-primary text-sm font-medium border border-primary px-3 py-1 rounded-[12px] hover:bg-primary hover:text-white transition"
          >
            מידע נוסף
          </Link>
        </div>
      </div>
    </div>
  );
}
