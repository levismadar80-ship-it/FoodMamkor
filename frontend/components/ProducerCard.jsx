"use client";

import Link from "next/link";
import Image from "next/image";
import CategoryTag from "./CategoryTag";
import Tooltip from "./ui/Tooltip";

export default function ProducerCard({ producer }) {
  const imgSrc = producer.images?.[0] || "https://placehold.co/400x300?text=מהמקור";
  const phone = producer.phone;
  const whatsappNumber = phone ? phone.replace(/^0/, "972").replace(/[-\s]/g, "") : null;
  const producerHref = producer.slug ? `/${producer.slug}` : `/producer/${producer.id}`;

  return (
    <div className="bg-white rounded-[12px] overflow-hidden hover:shadow-md transition group">
      <Link href={producerHref}>
        <div className="relative h-56 bg-gray-100">
          <Image
            src={imgSrc}
            alt={producer.name}
            fill
            className="object-cover group-hover:scale-105 transition duration-300"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
          />
          {producer.is_verified && (
            <Tooltip content="עסק שאומת על ידי צוות מהמקור — נפגשנו איתם ובדקנו את המוצרים" position="bottom">
              <span className="absolute top-3 left-3 bg-primary text-white text-xs px-2 py-1 rounded-full cursor-help">
                מאומת ✓
              </span>
            </Tooltip>
          )}
          {producer.plan === "premium" && (
            <Tooltip content="בית עסק בתוכנית הפרמיום — תמיכה מורחבת ותכונות נוספות" position="bottom">
              <span className="absolute top-3 right-3 bg-accent-warm text-white text-xs px-2 py-1 rounded-full cursor-help">
                פרמיום
              </span>
            </Tooltip>
          )}
        </div>
      </Link>
      <div className="p-4">
        <Link href={producerHref}>
          <h3 className="font-bold text-lg mb-1 hover:text-primary transition">{producer.name}</h3>
        </Link>
        <p className="text-text-secondary text-sm mb-2">{producer.city}</p>
        {(producer.top_product_name || producer.starting_price_label) && (
          <p className="text-sm mb-3">
            {producer.top_product_name && (
              <span className="text-text-primary">{producer.top_product_name}</span>
            )}
            {producer.top_product_name && producer.starting_price_label && (
              <span className="text-text-secondary"> · </span>
            )}
            {producer.starting_price_label && (
              <span className="text-primary font-semibold">{producer.starting_price_label}</span>
            )}
          </p>
        )}
        <div className="flex flex-wrap gap-1 mb-3">
          {producer.categories?.slice(0, 3).map((cat) => (
            <CategoryTag key={cat.id} category={cat} />
          ))}
        </div>
        {/* Contact icons + CTA */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <div className="flex items-center gap-2">
            {whatsappNumber && (
              <a
                href={`https://wa.me/${whatsappNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-lg p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:scale-110 transition"
                title="WhatsApp"
                onClick={(e) => e.stopPropagation()}
              >
                💬
              </a>
            )}
            {phone && (
              <a
                href={`tel:${phone}`}
                className="text-lg p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:scale-110 transition"
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
                className="text-lg p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:scale-110 transition"
                title="Instagram"
                onClick={(e) => e.stopPropagation()}
              >
                📷
              </a>
            )}
          </div>
          <Link
            href={producerHref}
            className="text-primary text-sm font-medium hover:underline"
          >
            מידע נוסף ←
          </Link>
        </div>
      </div>
    </div>
  );
}
