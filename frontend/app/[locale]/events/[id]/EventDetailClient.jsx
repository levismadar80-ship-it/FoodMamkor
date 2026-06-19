"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Calendar, Coins, Leaf, MapPin, UsersThree } from "@phosphor-icons/react";
import { useTranslations, useLocale } from "next-intl";
import api from "@/lib/api";
import { formatEventDate } from "@/lib/format-date";
import Breadcrumb from "@/components/Breadcrumb";

const DETAIL_DATE_OPTIONS = {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
};

// MEH-476 PR 3b2: extracted from app/[locale]/events/[id]/page.js so the
// route can export generateMetadata (Client Components cannot). page.js
// renders this component; logic + state unchanged from pre-3b2 behavior.
export default function EventDetailClient() {
  const t = useTranslations("events.detail");
  const locale = useLocale();
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
    // MEH-858 F7: geometry-matched skeleton (was a bare centered line) — mirrors
    // the detail layout so it doesn't jump on hydrate. Cream-toned bg-border/60
    // pulse per ADR-019, same idiom as the list SkeletonRows. aria-label keeps
    // the SR "loading" announcement.
    return (
      <div aria-busy="true" aria-label={t("loading")}>
        <div className="h-[360px] bg-border/60 animate-pulse" />
        <div className="max-w-3xl mx-auto px-4 py-12">
          <span className="block w-24 h-6 rounded-full bg-border/60 animate-pulse mb-3" />
          <span className="block w-3/4 h-10 rounded bg-border/60 animate-pulse mb-4" />
          <div className="flex flex-wrap gap-4 mb-6">
            <span className="w-40 h-4 rounded bg-border/60 animate-pulse" />
            <span className="w-28 h-4 rounded bg-border/60 animate-pulse" />
            <span className="w-20 h-4 rounded bg-border/60 animate-pulse" />
          </div>
          <span className="block w-full h-32 rounded-[16px] bg-border/60 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="mb-4 flex justify-center">
          <Leaf size={56} className="text-primary" aria-hidden="true" />
        </div>
        <p className="text-fg-muted mb-6">{t("not_found")}</p>
        <Link href="/events" className="text-primary hover:underline">
          {t("back_to_all")}
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
            { href: "/", label: t("breadcrumb_home") },
            { href: "/events", label: t("breadcrumb_events") },
            { label: event.title },
          ]}
          className="mb-4"
        />

        <span className="inline-block bg-green-50 text-primary text-xs px-3 py-1 rounded-full mb-3">
          {event.category}
        </span>

        <h1 className="font-headline-display text-4xl md:text-5xl font-bold text-text mb-4">
          {event.title}
        </h1>

        <div className="flex flex-wrap gap-4 text-text/85 mb-6">
          <p className="flex items-center gap-2">
            {/* MEH-857: emoji to Phosphor, mirrors MapPin markup at :96 */}
            <Calendar size={16} className="text-primary inline align-[-3px]" aria-hidden="true" />
            {formatEventDate(event.event_date, locale, DETAIL_DATE_OPTIONS)}
            {event.event_time && ` · ${event.event_time.slice(0, 5)}`}
          </p>
          {event.location && (
            <p className="flex items-center gap-2">
              <MapPin size={16} className="text-primary inline align-[-3px]" aria-hidden="true" />
              {event.location}{event.city && `, ${event.city}`}
            </p>
          )}
          <p className="flex items-center gap-2 text-accent font-semibold">
            {/* MEH-857: emoji to Phosphor. text-accent (not text-primary) so the
                glyph leads in this row's accent color — same principle as MapPin
                leading its row in text-primary at :96. */}
            <Coins size={16} className="text-accent inline align-[-3px]" aria-hidden="true" />
            {event.price > 0 ? `₪${event.price}` : t("free")}
          </p>
          {event.max_participants && (
            <p className="flex items-center gap-2">
              {/* MEH-857: emoji to Phosphor, mirrors MapPin markup at :96 */}
              <UsersThree size={16} className="text-primary inline align-[-3px]" aria-hidden="true" />
              {t("participants_limit", { n: event.max_participants })}
            </p>
          )}
        </div>

        {event.description && (
          <div className="bg-white border border-border rounded-[16px] p-6 mb-6 leading-relaxed whitespace-pre-line text-text/90">
            {event.description}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          {event.registration_url ? (
            <a
              href={event.registration_url}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-primary text-white px-6 py-3 rounded-full font-medium hover:bg-primary-dark transition"
            >
              {t("register")}
            </a>
          ) : (
            <Link
              href={`/producer/${event.producer_id}`}
              className="bg-primary text-white px-6 py-3 rounded-full font-medium hover:bg-primary-dark transition"
            >
              {t("contact_producer")}
            </Link>
          )}
          <Link
            href="/events"
            className="border border-primary text-primary px-6 py-3 rounded-full font-medium hover:bg-green-50 transition"
          >
            {t("all_events")}
          </Link>
        </div>

        {event.producer_name && (
          <p className="text-sm text-fg-muted mt-8">
            {t("organized_by")}{" "}
            <Link href={`/producer/${event.producer_id}`} className="text-primary hover:underline">
              {event.producer_name}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
