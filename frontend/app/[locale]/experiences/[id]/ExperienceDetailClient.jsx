"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Leaf, MapPin, Calendar, CurrencyCircleDollar, Users, Clock, ArrowsClockwise } from "@phosphor-icons/react";
import { useTranslations, useLocale } from "next-intl";
import { formatEventDate } from "@/lib/format-date";
// MEH-1140: canonical shekel format ("35₪") — one owner in lib/utils.
import { formatPrice, getWhatsAppHref, normalizePhone } from "@/lib/utils";
import { formatDuration } from "@/lib/experience-format";
import api from "@/lib/api";
import Breadcrumb from "@/components/Breadcrumb";

// MEH-1404: reuse the producer-detail static map + Waze/Gmaps block on
// experiences with coords. ssr:false — leaflet touches window at module eval.
const MiniMap = dynamic(() => import("@/components/MiniMap"), { ssr: false });

function formatDate(iso, locale) {
  if (!iso) return "";
  return formatEventDate(iso, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function formatTime(t) {
  if (!t) return "";
  return t.slice(0, 5);
}

export default function ExperienceDetailClient() {
  const t = useTranslations("experiences.detail");
  // MEH-2476: the place-type labels are the form's own («בבית פרטי» / «מקום ציבורי»).
  const tForm = useTranslations("experiences.new");
  const locale = useLocale();
  const { id } = useParams();
  const search = useSearchParams();
  const justSubmitted = search.get("pending") === "1";

  const [ex, setEx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .get(`/experiences/${id}`)
      .then((r) => setEx(r.data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  // MEH-1140: free semantics stay here; numeric formatting is lib/utils canon.
  const priceDisplay = (p) => {
    if (p == null || Number(p) === 0) return t("free");
    return formatPrice(p);
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-fg-muted">
        {t("loading")}
      </div>
    );
  }

  if (notFound || !ex) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="mb-4 flex justify-center">
          <Leaf size={56} className="text-primary" aria-hidden="true" />
        </div>
        <p className="text-fg-muted mb-6">{t("not_found")}</p>
        <Link href="/experiences" className="text-primary hover:underline">
          {t("back_to_all")}
        </Link>
      </div>
    );
  }

  const STATUS_BANNER = {
    pending: {
      className: "bg-yellow-50 border-yellow-300 text-yellow-900",
      label: t("status_pending"),
    },
    changes_requested: {
      className: "bg-orange-50 border-orange-300 text-orange-900",
      label: t("status_changes_requested"),
    },
    rejected: {
      className: "bg-red-50 border-red-300 text-red-900",
      label: t("status_rejected"),
    },
  };

  const banner = STATUS_BANNER[ex.status];
  const isApproved = ex.status === "approved";
  const duration = formatDuration(ex.duration_minutes, t);
  const PLACE_KEY = { home: "location_home", public: "location_public" };
  const placeLabel = PLACE_KEY[ex.location_type] ? tForm(PLACE_KEY[ex.location_type]) : null;
  // MEH-2476: the host's approved business (null otherwise). The WhatsApp CTA
  // used to open wa.me with no recipient — it reached nobody.
  const hostBiz = ex.host?.producer_id ? ex.host : null;
  const hostHref = hostBiz
    ? hostBiz.producer_slug
      ? `/${hostBiz.producer_slug}`
      : `/producer/${hostBiz.producer_id}`
    : null;
  const hostPhone = normalizePhone(hostBiz?.producer_phone);
  const waText = t("whatsapp_message", { title: ex.title });
  const waHref = hostPhone
    ? getWhatsAppHref(hostPhone, waText)
    : `https://wa.me/?text=${encodeURIComponent(waText)}`;

  return (
    <div>
      {ex.image_url && (
        <div
          className="h-[360px] bg-cover bg-center"
          style={{ backgroundImage: `url(${ex.image_url})` }}
          role="img"
          aria-label={ex.title}
        />
      )}

      <div className="max-w-3xl mx-auto px-4 py-10">
        <Breadcrumb
          items={[
            { href: "/", label: t("breadcrumb_home") },
            { href: "/experiences", label: t("breadcrumb_experiences") },
            { label: ex.title },
          ]}
          className="mb-4"
        />

        {justSubmitted && ex.status === "pending" && (
          <div className="bg-green-50 border border-primary text-primary rounded-[12px] p-4 mb-4">
            {t("just_submitted")}
          </div>
        )}

        {banner && !justSubmitted && (
          <div className={`border rounded-[12px] p-4 mb-4 ${banner.className}`}>
            <p className="font-medium">{banner.label}</p>
            {ex.status === "changes_requested" && ex.admin_feedback && (
              <p className="text-sm mt-2 whitespace-pre-wrap">
                <span className="font-medium">{t("team_notes")}</span>{" "}
                {ex.admin_feedback}
              </p>
            )}
            {ex.status === "rejected" && ex.rejection_reason && (
              <p className="text-sm mt-2 whitespace-pre-wrap">
                <span className="font-medium">{t("reason")}</span> {ex.rejection_reason}
              </p>
            )}
          </div>
        )}

        {ex.category && (
          <span className="inline-block bg-green-50 text-primary text-xs px-3 py-1 rounded-full mb-3">
            {ex.category}
          </span>
        )}

        <h1 className="font-headline-display text-4xl md:text-5xl font-bold text-text mb-4">
          {ex.title}
        </h1>

        <div className="flex flex-wrap gap-4 text-text/85 mb-6">
          {/* MEH-2476: a recurring experience leads with its schedule, so the
              date below reads as a start, not as the only occasion. */}
          {ex.is_recurring && (
            <p className="flex items-center gap-2" data-testid="experience-recurring">
              <ArrowsClockwise size={16} className="text-primary" aria-hidden="true" />
              {ex.recurring_schedule?.trim()
                ? t("recurring", { schedule: ex.recurring_schedule.trim() })
                : t("recurring_bare")}
            </p>
          )}
          <p className="flex items-center gap-2" data-testid="experience-date">
            <Calendar size={16} className="text-primary" aria-hidden="true" />
            {ex.is_recurring
              ? t("starts_from", { date: formatDate(ex.event_date, locale) })
              : formatDate(ex.event_date, locale)}
            {ex.event_time && ` · ${formatTime(ex.event_time)}`}
          </p>
          {duration && (
            <p className="flex items-center gap-2">
              <Clock size={16} className="text-primary" aria-hidden="true" />
              <span data-testid="experience-duration">{duration}</span>
            </p>
          )}
          {(ex.city || placeLabel) && (
            <p className="flex items-center gap-2" data-testid="experience-place">
              <MapPin size={16} className="text-primary inline align-[-3px]" aria-hidden="true" />
              {[ex.city, ex.address, placeLabel].filter(Boolean).join(" · ")}
            </p>
          )}
          <p className="flex items-center gap-2 text-accent font-semibold">
            <CurrencyCircleDollar size={16} aria-hidden="true" />
            {priceDisplay(ex.price_per_person)}
          </p>
          {ex.max_participants != null && (
            <p className="flex items-center gap-2">
              <Users size={16} className="text-primary" aria-hidden="true" />
              {ex.spots_left === 0
                ? t("sold_out")
                : t("spots_count", {
                    spots: ex.spots_left ?? ex.max_participants,
                    max: ex.max_participants,
                  })}
            </p>
          )}
        </div>

        {/* MEH-1404: map + navigation buttons when the experience has coords.
            Without coords the city/address line above stays text-only.
            MEH-1417: for a HOME experience the backend now nulls lat/lng for
            strangers (mirroring the gated street address, experiences.py:188),
            so this block simply doesn't render — no residential pin leaks.
            `public` venues keep their coords, so their pin still shows. */}
        {ex.lat != null && ex.lng != null && (
          <div className="mb-6">
            <MiniMap lat={ex.lat} lng={ex.lng} name={ex.title} />
          </div>
        )}

        {ex.description && (
          <div className="bg-white border border-border rounded-[16px] p-6 mb-6 leading-relaxed whitespace-pre-line text-text/90">
            {ex.description}
          </div>
        )}

        {ex.requirements && (
          <div className="bg-green-50 border border-border rounded-[16px] p-6 mb-6">
            <h2 className="font-headline-md text-lg font-bold text-text mb-2">
              {t("requirements_title")}
            </h2>
            <p className="text-text/85 whitespace-pre-line">
              {ex.requirements}
            </p>
          </div>
        )}

        {isApproved && ex.spots_left !== 0 && (
          <div className="flex flex-wrap gap-3 mt-6">
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-primary text-white px-6 py-3 rounded-[8px] font-medium hover:bg-primary-dark transition"
            >
              {t("whatsapp_cta")}
            </a>
            <Link
              href="/experiences"
              className="border border-primary text-primary px-6 py-3 rounded-[8px] font-medium hover:bg-green-50 transition"
            >
              {t("all_experiences")}
            </Link>
          </div>
        )}

        {ex.host?.name && (
          <p className="text-sm text-fg-muted mt-8">
            {t("host_label")}{" "}
            {hostHref ? (
              <Link
                href={hostHref}
                data-testid="experience-host-link"
                className="text-primary hover:underline"
              >
                {hostBiz.producer_name || ex.host.name}
              </Link>
            ) : (
              <span className="text-primary">{ex.host.name}</span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
