"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import Breadcrumb from "@/components/Breadcrumb";

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("he-IL", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function EventDetailPage() {
  const { id } = useParams();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get(`/events/${id}`)
      .then((r) => setEvent(r.data))
      .catch(() => setEvent(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-site-muted">
        טוענת את האירוע...
      </div>
    );
  }

  if (!event) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-5xl mb-4">🌱</p>
        <p className="text-site-muted mb-6">לא מצאנו את האירוע הזה</p>
        <Link href="/events" className="text-primary hover:underline">
          ← חזרה לכל האירועים
        </Link>
      </div>
    );
  }

  return (
    <div>
      {event.image_url && (
        <div
          className="h-[360px] bg-cover bg-center"
          style={{ backgroundImage: `url(${event.image_url})` }}
          role="img"
          aria-label={event.title}
        />
      )}

      <div className="max-w-3xl mx-auto px-4 py-12">
        <Breadcrumb
          items={[
            { href: "/", label: "בית" },
            { href: "/events", label: "אירועים" },
            { label: event.title },
          ]}
          className="mb-4"
        />

        <span className="inline-block bg-light text-primary text-xs px-3 py-1 rounded-full mb-3">
          {event.category}
        </span>

        <h1 className="font-headline text-4xl md:text-5xl font-bold text-site-text mb-4">
          {event.title}
        </h1>

        <div className="flex flex-wrap gap-4 text-site-text/85 mb-6">
          <p className="flex items-center gap-2">
            <span aria-hidden>📅</span>
            {formatDate(event.event_date)}
            {event.event_time && ` · ${event.event_time.slice(0, 5)}`}
          </p>
          {event.location && (
            <p className="flex items-center gap-2">
              <span aria-hidden>📍</span>
              {event.location}{event.city && `, ${event.city}`}
            </p>
          )}
          <p className="flex items-center gap-2 text-accent font-semibold">
            <span aria-hidden>💰</span>
            {event.price > 0 ? `₪${event.price}` : "חינם"}
          </p>
          {event.max_participants && (
            <p className="flex items-center gap-2">
              <span aria-hidden>👥</span>
              עד {event.max_participants} משתתפים
            </p>
          )}
        </div>

        {event.description && (
          <div className="bg-white border border-border rounded-[16px] p-6 mb-6 leading-relaxed whitespace-pre-line text-site-text/90">
            {event.description}
          </div>
        )}

        <div className="flex flex-col md:flex-row flex-wrap gap-3">
          {event.registration_url ? (
            <a
              href={event.registration_url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full md:w-auto text-center bg-primary text-white px-6 py-3 rounded-[8px] font-medium hover:bg-primary-light transition"
            >
              להרשמה →
            </a>
          ) : (
            <Link
              href={`/producer/${event.producer_id}`}
              className="w-full md:w-auto text-center bg-primary text-white px-6 py-3 rounded-[8px] font-medium hover:bg-primary-light transition"
            >
              צור קשר עם בית העסק
            </Link>
          )}
          <Link
            href="/events"
            className="w-full md:w-auto text-center border border-primary text-primary px-6 py-3 rounded-[8px] font-medium hover:bg-light transition"
          >
            ← כל האירועים
          </Link>
        </div>

        {event.producer_name && (
          <p className="text-sm text-site-muted mt-8">
            מאורגן על ידי{" "}
            <Link href={`/producer/${event.producer_id}`} className="text-primary hover:underline">
              {event.producer_name}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
