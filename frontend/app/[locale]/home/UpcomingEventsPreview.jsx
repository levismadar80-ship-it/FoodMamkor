"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import api from "@/lib/api";

/**
 * Small inline component for "upcoming events" homepage preview.
 * Pulls from GET /events/upcoming?limit=3. Hides itself if backend returns
 * nothing (e.g. before any events exist).
 */
export function UpcomingEventsPreview() {
  const t = useTranslations();
  const [events, setEvents] = useState([]);
  useEffect(() => {
    api
      .get("/events/upcoming", { params: { limit: 3 } })
      .then((r) => setEvents(r.data || []))
      .catch(() => setEvents([]));
  }, []);

  if (!events.length) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 section-y border-t border-border">
      <div className="flex items-baseline justify-between mb-8">
        <h2 className="font-headline font-bold text-site-text" style={{ fontSize: "clamp(28px, 3.5vw, 40px)" }}>
          {t("home.events.heading")}
        </h2>
        <Link href="/events" className="text-primary hover:underline text-sm">
          {t("home.events.all_events")}
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {events.map((ev) => (
          <Link
            key={ev.id}
            href={`/events/${ev.id}`}
            className="bg-background border border-border rounded-[16px] overflow-hidden hover:shadow-md transition"
          >
            {ev.image_url && (
              <div
                className="h-40 bg-cover bg-center"
                style={{ backgroundImage: `url(${ev.image_url})` }}
              />
            )}
            <div className="p-4">
              <p className="text-primary text-sm font-semibold mb-1">
                {formatEventDate(ev.event_date)} {ev.event_time && `· ${ev.event_time.slice(0, 5)}`}
              </p>
              <h3 className="font-headline text-xl font-bold text-site-text mb-1">{ev.title}</h3>
              <p className="text-sm text-site-muted mb-2">
                {ev.producer_name} · {ev.city}
              </p>
              <p className="text-sm text-accent font-semibold">
                {ev.price > 0 ? `₪${ev.price}` : t("home.events.free")}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function formatEventDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("he-IL", { day: "numeric", month: "long" });
  } catch {
    return iso;
  }
}
