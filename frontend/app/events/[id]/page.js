"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import api from "@/lib/api";

const TYPE_LABELS = { event: "אירוע", experience: "חוויה" };
const LOCATION_LABELS = {
  producer_farm: "בחווה / בית עסק",
  home: "בבית פרטי",
  public: "מקום ציבורי",
};

const STATUS_BADGE = {
  pending: { label: "ממתין לאישור 🌿", className: "bg-yellow-100 text-yellow-800" },
  approved: { label: "מאושר ✓", className: "bg-primary text-white" },
  rejected: { label: "נדחה", className: "bg-red-100 text-red-700" },
  changes_requested: {
    label: "נדרשים שינויים",
    className: "bg-orange-100 text-orange-700",
  },
};

function formatDateTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("he-IL", {
      weekday: "long",
      day: "2-digit",
      month: "long",
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
  return `₪${Number(p).toLocaleString("he-IL")} לאדם`;
}

export default function EventDetailPage() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const showPendingBanner = searchParams.get("pending") === "1";

  const [event, setEvent] = useState(null);
  const [error, setError] = useState("");
  const [activeImg, setActiveImg] = useState(0);

  useEffect(() => {
    if (!id) return;
    api
      .get(`/events/${id}`)
      .then((r) => setEvent(r.data))
      .catch((e) =>
        setError(e.response?.data?.detail || "האירוע לא נמצא")
      );
  }, [id]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-[12px] p-4">
          {error}
        </div>
        <Link
          href="/events"
          className="inline-block mt-4 text-primary hover:underline"
        >
          ← חזרה לאירועים
        </Link>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-text-secondary">
        טוען...
      </div>
    );
  }

  const typeLabel = TYPE_LABELS[event.type] || event.type;
  const locationLabel = LOCATION_LABELS[event.location_type] || "";
  const statusBadge = STATUS_BADGE[event.status];
  const images = event.images?.length ? event.images : [
    "https://placehold.co/800x500?text=אירוע",
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Link
        href="/events"
        className="text-text-secondary text-sm hover:text-primary"
      >
        ← חזרה לאירועים
      </Link>

      {showPendingBanner && event.status === "pending" && (
        <div className="mt-4 bg-green-50 border border-primary text-primary rounded-[12px] p-4">
          ✅ האירוע נשלח לאישור! תקבלי מייל כשהוא יתפרסם. 🌿
        </div>
      )}

      {event.status !== "approved" && statusBadge && (
        <div
          className={`mt-4 px-3 py-2 rounded-[12px] text-sm inline-block ${statusBadge.className}`}
        >
          {statusBadge.label}
        </div>
      )}

      {event.status === "changes_requested" && event.admin_feedback && (
        <div className="mt-4 bg-orange-50 border border-orange-200 rounded-[12px] p-4">
          <p className="font-medium mb-1 text-orange-800">הערות מהצוות:</p>
          <p className="text-sm text-orange-900 whitespace-pre-wrap">
            {event.admin_feedback}
          </p>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 md:grid-cols-[1.6fr_1fr] gap-6">
        {/* Left: gallery + description */}
        <div>
          <div className="relative h-72 md:h-96 bg-gray-100 rounded-[12px] overflow-hidden">
            <Image
              src={images[activeImg]}
              alt={event.title}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 66vw"
            />
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 mt-3 overflow-x-auto">
              {images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImg(i)}
                  className={`relative h-16 w-24 flex-shrink-0 rounded-[12px] overflow-hidden border-2 ${
                    i === activeImg ? "border-primary" : "border-transparent"
                  }`}
                >
                  <Image src={img} alt="" fill className="object-cover" />
                </button>
              ))}
            </div>
          )}

          <h1 className="text-3xl md:text-4xl font-bold mt-6">{event.title}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-3 text-sm">
            <span className="bg-primary text-white px-2 py-1 rounded-full">
              {typeLabel}
            </span>
            {event.category && (
              <span className="bg-accent text-text-primary px-2 py-1 rounded-full">
                {event.category}
              </span>
            )}
            {event.is_recurring && (
              <span className="bg-accent-warm text-white px-2 py-1 rounded-full">
                🔁 חוזר
              </span>
            )}
          </div>

          <h2 className="text-xl font-semibold mt-6 mb-2">תיאור</h2>
          <p className="whitespace-pre-wrap text-text-primary leading-relaxed">
            {event.description}
          </p>

          {event.requirements && (
            <>
              <h2 className="text-xl font-semibold mt-6 mb-2">
                מה להביא / דרישות מוקדמות
              </h2>
              <p className="whitespace-pre-wrap text-text-primary leading-relaxed">
                {event.requirements}
              </p>
            </>
          )}
        </div>

        {/* Right: booking sidebar */}
        <aside className="bg-white border border-border rounded-[12px] p-5 h-fit md:sticky md:top-20">
          <p className="text-2xl font-bold text-primary mb-1">
            {formatPrice(event.price_per_person)}
          </p>
          <div className="space-y-3 text-sm mt-4">
            <InfoRow icon="📅" label="מועד">
              {formatDateTime(event.starts_at)}
            </InfoRow>
            {event.ends_at && (
              <InfoRow icon="⏰" label="סיום">
                {formatDateTime(event.ends_at)}
              </InfoRow>
            )}
            {event.is_recurring && event.recurring_schedule && (
              <InfoRow icon="🔁" label="תדירות">
                {event.recurring_schedule}
              </InfoRow>
            )}
            <InfoRow icon="📍" label="מיקום">
              {[event.city, event.address, locationLabel]
                .filter(Boolean)
                .join(" · ")}
            </InfoRow>
            {event.max_participants != null && (
              <InfoRow icon="👥" label="מקומות">
                {event.spots_left === 0
                  ? "אזל"
                  : `נשארו ${event.spots_left} מתוך ${event.max_participants}`}
              </InfoRow>
            )}
            <InfoRow icon="🌿" label="מארגן/ת">
              {event.producer?.name || event.host?.name || "—"}
            </InfoRow>
          </div>

          {event.status === "approved" && event.spots_left !== 0 && (
            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                `היי! אני רוצה להירשם ל-${event.title}`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center bg-primary text-white py-3 rounded-[12px] mt-5 font-medium hover:bg-primary-light transition"
            >
              פני למארגן ב-WhatsApp
            </a>
          )}
        </aside>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, children }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-base leading-6">{icon}</span>
      <div className="flex-1">
        <p className="text-xs text-text-secondary">{label}</p>
        <p className="text-text-primary">{children}</p>
      </div>
    </div>
  );
}
