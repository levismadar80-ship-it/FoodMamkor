"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar } from "@phosphor-icons/react";
import { useTranslations, useLocale } from "next-intl";
import api from "@/lib/api";
// MEH-785: locale-aware dates via the shared helper — replaces the local
// formatEventDate that hardcoded "he-IL" (escaped the MEH-753/MEH-777 sweeps).
import { formatEventDate } from "@/lib/format-date";
import { optimizeCloudinary } from "@/lib/cloudinary";

/**
 * Small inline component for "upcoming events" homepage preview.
 * Pulls from GET /events/upcoming?limit=3. Hides itself if backend returns
 * nothing (e.g. before any events exist).
 */
export function UpcomingEventsPreview() {
  const t = useTranslations();
  const locale = useLocale();
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
        <h2 className="font-headline-lg text-headline-lg text-text flex items-center gap-2">
          <Calendar size={16} className="text-current" />
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
            className="bg-background border border-border rounded-[16px] overflow-hidden transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
          >
            {ev.image_url && (
              <div
                className="h-40 bg-cover bg-center"
                style={{ backgroundImage: `url(${optimizeCloudinary(ev.image_url)})` }}
              />
            )}
            <div className="p-4">
              <p className="text-primary text-sm font-semibold mb-1">
                {formatEventDate(ev.event_date, locale, { day: "numeric", month: "long" })} {ev.event_time && `· ${ev.event_time.slice(0, 5)}`}
              </p>
              <h3 className="font-headline-md text-xl font-bold text-text mb-1">{ev.title}</h3>
              <p className="text-sm text-fg-muted mb-2">
                {ev.producer_name} · {ev.city}
              </p>
              <p className="text-sm text-accent font-semibold">
                {/* MEH-1031: bidi-isolate the price (currency+number) so it can't flip in RTL */}
                {ev.price > 0 ? <span dir="ltr">{`₪${ev.price}`}</span> : t("home.events.free")}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
