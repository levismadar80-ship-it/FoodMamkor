"use client";

import Link from "next/link";
import Image from "next/image";
import CategoryTag from "./CategoryTag";

export default function ProducerCard({ producer }) {
  const imgSrc = producer.images?.[0] || "https://placehold.co/400x300?text=מהמקור";

  return (
    <Link href={`/producer/${producer.id}`}>
      <div className="bg-white rounded-[12px] overflow-hidden hover:shadow-md transition group">
        <div className="relative h-48 bg-gray-100">
          <Image
            src={imgSrc}
            alt={producer.name}
            fill
            className="object-cover group-hover:scale-105 transition duration-300"
            sizes="(max-width: 768px) 100vw, 33vw"
          />
          {producer.is_verified && (
            <span className="absolute top-3 left-3 bg-primary text-white text-xs px-2 py-1 rounded-full">
              מאומת ✓
            </span>
          )}
          {producer.plan === "premium" && (
            <span className="absolute top-3 right-3 bg-accent text-white text-xs px-2 py-1 rounded-full">
              פרמיום
            </span>
          )}
        </div>
        <div className="p-4">
          <h3 className="font-semibold text-lg mb-1">{producer.name}</h3>
          <p className="text-text-secondary text-sm mb-2">{producer.city}</p>
          <div className="flex flex-wrap gap-1">
            {producer.categories?.slice(0, 3).map((cat) => (
              <CategoryTag key={cat.id} category={cat} />
            ))}
          </div>
        </div>
      </div>
    </Link>
  );
}
