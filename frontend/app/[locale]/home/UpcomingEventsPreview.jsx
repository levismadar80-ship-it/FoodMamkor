"use client";

import { useEffect, useState } from "react";
// MEH-2497: next-intl's Link keeps /en on «לכל האירועים» (next/link dropped it).
import { Link } from "@/i18n/navigation";
import { Calendar } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import EventEntryRow, { toEventEntry } from "@/components/EventEntryRow";

/**
 * Small inline component for "upcoming events" homepage preview.
 * Pulls from GET /events/upcoming?limit=3. Hides itself if backend returns
 * nothing (e.g. before any events exist).
 */
export function UpcomingEventsPreview() {
  const t = useTranslations();
  const tList = useTranslations("events.list");
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
      {/* MEH-2497: the /events date-rail rows, not cards — a row without a
          photo has no image area at all (MEH-2468), so a photo-less event no
          longer fills a third of the card with a leaf placeholder. Phone: one
          list. Desktop: up to three rows side by side, so a 1280px-wide row
          doesn't strand the price at the far end. */}
      <div className="border-t border-border lg:border-t-0 lg:grid lg:grid-cols-3 lg:gap-x-8 lg:[&>*]:border-t">
        {events.map((ev) => (
          <EventEntryRow key={ev.id} entry={toEventEntry(ev, "events", tList)} freeLabel={t("home.events.free")} />
        ))}
      </div>
    </section>
  );
}
