"use client";

import Link from "next/link";
import Image from "next/image";
import CategoryTag from "./CategoryTag";

export default function ProducerCard({ producer }) {
  const imgSrc = producer.images?.[0] || "https://placehold.co/400x300?text=מהמקור";
  const phone = producer.phone;
  const whatsappNumber = phone ? phone.replace(/^0/, "972").replace(/[-\s]/g, "") : null;

  return (
    <div className="bg-white rounded-[12px] overflow-hidden hover:shadow-md transition group">
      <Link href={`/producer/${producer.id}`}>
        <div className="relative h-56 bg-gray-100">
          <Image
            src={imgSrc}
            alt={producer.name}
            fill
            className="object-cover group-hover:scale-105 transition duration-300"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
          />
          {producer.is_verified && (
            <span className="absolute top-3 left-3 bg-primary text-white text-xs px-2 py-1 rounded-full">
              מאומת ✓
            </span>
          )}
          {producer.plan === "premium" && (
            <span className="absolute top-3 right-3 bg-accent-warm text-white text-xs px-2 py-1 rounded-full">
              פרמיום
            </span>
          )}
        </div>
      </Link>
      <div className="p-4">
        <Link href={`/producer/${producer.id}`}>
          <h3 className="font-bold text-lg mb-1 hover:text-primary transition">{producer.name}</h3>
        </Link>
        <p className="text-text-secondary text-sm mb-3">{producer.city}</p>
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
          </div>
          <Link
            href={`/producer/${producer.id}`}
            className="text-primary text-sm font-medium hover:underline"
          >
            מידע נוסף ←
          </Link>
        </div>
      </div>
    </div>
  );
}
