"use client";

import Link from "next/link";
import Image from "next/image";

const TYPE_LABELS = {
  event: "אירוע",
  experience: "חוויה",
};

const LOCATION_LABELS = {
  producer_farm: "בחווה",
  home: "בבית",
  public: "מקום ציבורי",
};

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatPrice(p) {
  if (p == null || Number(p) === 0) return "חינם";
  return `₪${Number(p).toLocaleString("he-IL")}`;
}

export default function EventCard({ event }) {
  const img = event.images?.[0] || "https://placehold.co/400x300?text=אירוע";
  const typeLabel = TYPE_LABELS[event.type] || "אירוע";
  const locationLabel = LOCATION_LABELS[event.location_type] || "";
  const spotsLeft = event.spots_left;

  return (
    <Link
      href={`/events/${event.id}`}
      className="block bg-white rounded-[12px] overflow-hidden hover:shadow-md transition group"
    >
      <div className="relative h-56 bg-gray-100">
        <Image
          src={img}
          alt={event.title}
          fill
          className="object-cover group-hover:scale-105 transition duration-300"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
        <span className="absolute top-3 right-3 bg-primary text-white text-xs px-2 py-1 rounded-full">
          {typeLabel}
        </span>
        {event.is_recurring && (
          <span className="absolute top-3 left-3 bg-accent-warm text-white text-xs px-2 py-1 rounded-full">
            🔁 חוזר
          </span>
        )}
        {spotsLeft != null && spotsLeft <= 5 && spotsLeft > 0 && (
          <span className="absolute bottom-3 right-3 bg-accent-warm text-white text-xs px-2 py-1 rounded-full">
            נשארו {spotsLeft} מקומות
          </span>
        )}
        {spotsLeft === 0 && (
          <span className="absolute bottom-3 right-3 bg-gray-800 text-white text-xs px-2 py-1 rounded-full">
            אזל
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-bold text-lg mb-1 group-hover:text-primary transition">
          {event.title}
        </h3>
        <p className="text-text-secondary text-sm mb-1">
          📅 {formatDate(event.starts_at)}
        </p>
        {(event.city || locationLabel) && (
          <p className="text-text-secondary text-sm mb-2">
            📍 {[event.city, locationLabel].filter(Boolean).join(" · ")}
          </p>
        )}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <span className="text-primary font-semibold">
            {formatPrice(event.price_per_person)}
            {event.price_per_person > 0 && (
              <span className="text-text-secondary text-xs"> / לאדם</span>
            )}
          </span>
          {event.host?.name && (
            <span className="text-xs text-text-secondary">
              {event.producer?.name || event.host.name}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
