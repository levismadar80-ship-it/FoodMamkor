"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Leaf, MapPin } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
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

// MEH-476 PR 3b2: extracted from app/[locale]/events/[id]/page.js so the
// route can export generateMetadata (Client Components cannot). page.js
// renders this component; logic + state unchanged from pre-3b2 behavior.
export default function EventDetailClient() {
  const t = useTranslations("events.detail");
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
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-fg-muted">
        {t("loading")}
      </div>
    );
  }

  if (!event) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="mb-4 flex justify-center">
          <Leaf size={56} weight="duotone" className="text-primary" aria-hidden="true" />
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
            <span aria-hidden>📅</span>
            {formatDate(event.event_date)}
            {event.event_time && ` · ${event.event_time.slice(0, 5)}`}
          </p>
          {event.location && (
            <p className="flex items-center gap-2">
              <MapPin size={16} weight="duotone" className="text-primary inline align-[-3px]" aria-hidden="true" />
              {event.location}{event.city && `, ${event.city}`}
            </p>
          )}
          <p className="flex items-center gap-2 text-accent font-semibold">
            <span aria-hidden>💰</span>
            {event.price > 0 ? `₪${event.price}` : t("free")}
          </p>
          {event.max_participants && (
            <p className="flex items-center gap-2">
              <span aria-hidden>👥</span>
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
              className="bg-primary text-white px-6 py-3 rounded-[8px] font-medium hover:bg-primary-dark transition"
            >
              {t("register")}
            </a>
          ) : (
            <Link
              href={`/producer/${event.producer_id}`}
              className="bg-primary text-white px-6 py-3 rounded-[8px] font-medium hover:bg-primary-dark transition"
            >
              {t("contact_producer")}
            </Link>
          )}
          <Link
            href="/events"
            className="border border-primary text-primary px-6 py-3 rounded-[8px] font-medium hover:bg-green-50 transition"
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
