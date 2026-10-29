"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
// next-intl's Link keeps the /en prefix (next/link drops it).
import { Link } from "@/i18n/navigation";
import {
  ArrowsClockwise,
  Calendar,
  CalendarBlank,
  CalendarPlus,
  CaretLeft,
  Clock,
  CurrencyCircleDollar,
  Leaf,
  MapPin,
  Users,
} from "@phosphor-icons/react";
import { useTranslations, useLocale } from "next-intl";
import { formatEventDate } from "@/lib/format-date";
// MEH-1140: canonical shekel format ("35₪") — one owner in lib/utils.
import { formatPrice, getWhatsAppHref, normalizePhone } from "@/lib/utils";
import { formatDuration } from "@/lib/experience-format";
import api from "@/lib/api";
import Breadcrumb from "@/components/Breadcrumb";
import OwnerRow from "@/components/OwnerRow";
import ShareButton from "@/components/ShareButton";
import { CATEGORY_ICON } from "@/components/EventEntryRow";
import { cssUrl } from "@/lib/css-url";
import { optimizeCloudinary, IMAGE_RATIOS } from "@/lib/cloudinary";
import { downloadIcs } from "@/lib/event-ics";
import { eventWhen, addressNavLinks } from "@/lib/event-when";

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

/** "HH:MM" start + minutes → "HH:MM" end for the calendar entry; null when
 *  either is missing or the end would cross midnight (the .ics then carries
 *  the start alone rather than a wrong end). */
function endTimeFrom(start, minutes) {
  if (!start || !minutes) return null;
  const [h, m] = start.split(":").map(Number);
  const total = h * 60 + m + Number(minutes);
  if (!Number.isFinite(total) || total >= 24 * 60) return null;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export default function ExperienceDetailClient() {
  const t = useTranslations("experiences.detail");
  // MEH-2476: the place-type labels are the form's own («בבית פרטי» / «מקום ציבורי»).
  const tForm = useTranslations("experiences.new");
  // MEH-2549: the event page's shared strings (time chip, calendar) and the
  // map block's Waze / Google labels.
  const tEv = useTranslations("events.detail");
  const tMap = useTranslations("map.mini");
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
  const hostName = hostBiz?.producer_name || ex.host?.name;
  // normalizePhone accepts Israeli MOBILE numbers only, so a landline (which
  // WhatsApp cannot reach) falls back to the recipient-less link below.
  const hostPhone = normalizePhone(hostBiz?.producer_phone);
  const waText = t("whatsapp_message", { title: ex.title });
  const waHref = hostPhone
    ? getWhatsAppHref(hostPhone, waText)
    : `https://wa.me/?text=${encodeURIComponent(waText)}`;

  // MEH-2549: the event page's structure (MEH-2548) in the experience's
  // gold — cover + date tile, host byline, one details card with share +
  // calendar, then description / requirements / host card.
  const pageUrl = typeof window === "undefined" ? "" : `${window.location.origin}${window.location.pathname}`;
  const CatIcon = CATEGORY_ICON[ex.category] ?? CalendarBlank;
  // A recurring experience's date is its first occasion — no «מחר» chip, and
  // no single-date calendar entry that would read as the only one.
  const when = ex.is_recurring ? null : eventWhen(ex.event_date);
  const isPast = when === "past";
  const hasCoords = ex.lat != null && ex.lng != null;
  // Address-built Waze / Google only for a public venue: a home address is
  // gated (MEH-1417) and must not leak through a link either.
  const nav = !hasCoords && ex.location_type === "public" ? addressNavLinks(ex.address, ex.city) : null;
  const day = formatEventDate(ex.event_date, locale, { day: "numeric" });
  const month = formatEventDate(ex.event_date, locale, { month: "long" });
  const weekday = formatEventDate(ex.event_date, locale, { weekday: "long" });
  const showCta = isApproved && ex.spots_left !== 0 && !isPast;
  const canCalendar = isApproved && !ex.is_recurring && !isPast;
  const icsEvent = {
    id: `experience-${ex.id}`,
    title: ex.title,
    event_date: ex.event_date,
    event_time: ex.event_time,
    end_time: endTimeFrom(ex.event_time, ex.duration_minutes),
    location: ex.location_type === "public" ? ex.address : null,
    city: ex.city,
    description: ex.description,
  };
  const infoRow = "flex items-center gap-3 px-4 py-3";
  const infoIcon = "shrink-0 w-9 h-9 rounded-[10px] bg-surface-card text-accent grid place-items-center";
  const actionBtn =
    "flex-1 inline-flex items-center justify-center gap-2 min-h-[46px] px-3 rounded-[10px] border border-primary text-primary text-sm font-semibold hover:bg-green-50 transition focus-visible:ring-2 focus-visible:ring-primary/40";

  return (
    <div className="pb-12" data-testid="experience-detail">
      <div className="relative max-w-[1100px] mx-auto lg:px-4 lg:pt-6">
        {ex.image_url ? (
          <div
            data-testid="experience-cover"
            className="h-[210px] md:h-[300px] lg:h-[380px] bg-cover bg-center lg:rounded-[18px] bg-border"
            style={{ backgroundImage: cssUrl(optimizeCloudinary(ex.image_url, { aspectRatio: IMAGE_RATIOS.banner, width: 1280 })) }}
            role="img"
            aria-label={ex.title}
          />
        ) : (
          <div
            data-testid="experience-cover-band"
            aria-hidden="true"
            className="h-[150px] lg:h-[200px] bg-accent lg:rounded-[18px] grid place-items-center"
          >
            <CatIcon size={54} weight="duotone" className="text-white/85" />
          </div>
        )}
        <div
          aria-hidden="true"
          className="lg:hidden absolute start-4 -bottom-7 w-16 rounded-[12px] bg-white shadow-lg text-center overflow-hidden"
        >
          <span className="block bg-accent text-white text-[11px] font-bold py-0.5">{month}</span>
          <span className="block font-headline-display font-black text-[28px] leading-tight pt-1 numeric">{day}</span>
          <span className="block text-[10px] text-fg-muted pb-1.5">{weekday}</span>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-4 pt-11 lg:pt-8 lg:grid lg:grid-cols-[1fr_360px] lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:items-start">
        <div className="lg:col-start-1">
          <Breadcrumb
            items={[
              { href: "/", label: t("breadcrumb_home") },
              { href: "/experiences", label: t("breadcrumb_experiences") },
              { label: ex.title },
            ]}
            className="mb-3"
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
            <span className="inline-flex items-center gap-1 bg-surface-card text-accent text-xs px-3 py-1 rounded-full mb-3">
              <CatIcon size={12} weight="bold" aria-hidden="true" />
              {ex.category}
            </span>
          )}

          <h1 className="font-headline-display text-4xl md:text-5xl font-bold text-text mb-3">
            {ex.title}
          </h1>

          {/* MEH-2549: the host right under the title, as on the event page. */}
          {hostName && (
            hostHref ? (
              <Link
                href={hostHref}
                data-testid="experience-byline"
                className="inline-flex items-center gap-2 min-h-[44px] text-[15px] text-text hover:text-primary rounded transition focus-ring"
              >
                <span aria-hidden="true" className="w-7 h-7 rounded-full bg-surface-card text-accent text-sm font-bold grid place-items-center">
                  {Array.from(hostName.trim())[0] ?? ""}
                </span>
                <span>{t("host_label")} {hostName}</span>
                <CaretLeft size={14} className="text-primary ltr:rotate-180" aria-hidden="true" />
              </Link>
            ) : (
              <p data-testid="experience-byline" className="text-[15px] text-text">
                {t("host_label")} {hostName}
              </p>
            )
          )}
        </div>

        <aside className="mt-6 lg:mt-0 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-24">
          <div className="bg-white border border-border rounded-[14px] overflow-hidden lg:shadow-md" data-testid="experience-info">
            <div aria-hidden="true" className="hidden lg:block text-center border-b border-border">
              <span className="block bg-accent text-white text-sm font-bold py-1.5">
                {formatEventDate(ex.event_date, locale, { month: "long", year: "numeric" })}
              </span>
              <span className="block font-headline-display font-black text-5xl leading-tight pt-2 numeric">{day}</span>
              <span className="block text-sm text-fg-muted pb-3">{weekday}</span>
            </div>
            {/* MEH-2476: a recurring experience leads with its schedule, so the
                date below reads as a start, not as the only occasion. */}
            {ex.is_recurring && (
              <div className={infoRow}>
                <span className={infoIcon}><ArrowsClockwise size={18} aria-hidden="true" /></span>
                <p className="text-text font-semibold" data-testid="experience-recurring">
                  {ex.recurring_schedule?.trim()
                    ? t("recurring", { schedule: ex.recurring_schedule.trim() })
                    : t("recurring_bare")}
                </p>
              </div>
            )}
            <div className={`${infoRow} ${ex.is_recurring ? "border-t border-border" : ""}`}>
              <span className={infoIcon}><Calendar size={18} aria-hidden="true" /></span>
              <p className="flex-1 min-w-0 font-semibold text-text" data-testid="experience-date">
                {ex.is_recurring
                  ? t("starts_from", { date: formatDate(ex.event_date, locale) })
                  : formatDate(ex.event_date, locale)}
                {ex.event_time && ` · ${formatTime(ex.event_time)}`}
              </p>
              {when && when !== "past" && (
                <span data-testid="experience-when" className="shrink-0 text-xs font-bold px-2.5 py-1 rounded-full bg-surface-card text-accent">
                  {tEv(`when_${when}`)}
                </span>
              )}
            </div>
            {duration && (
              <div className={`${infoRow} border-t border-border`}>
                <span className={infoIcon}><Clock size={18} aria-hidden="true" /></span>
                <p className="text-text" data-testid="experience-duration">{duration}</p>
              </div>
            )}
            {(ex.city || placeLabel) && (
              <div className="border-t border-border">
                <div className={infoRow}>
                  <span className={infoIcon}><MapPin size={18} aria-hidden="true" /></span>
                  <p className="text-text" data-testid="experience-place">
                    {[ex.city, ex.address, placeLabel].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {nav && (
                  <div className="flex gap-2 px-4 pb-3" data-testid="experience-nav-links">
                    <a href={nav.waze} target="_blank" rel="noopener noreferrer" aria-label={tMap("open_in_waze_aria")}
                      className="flex-1 inline-flex items-center justify-center min-h-[44px] rounded-[10px] border border-border text-sm font-medium text-primary hover:bg-green-50 transition focus-ring">
                      {tMap("open_in_waze")}
                    </a>
                    <a href={nav.google} target="_blank" rel="noopener noreferrer" aria-label={tMap("open_in_google_aria")}
                      className="flex-1 inline-flex items-center justify-center min-h-[44px] rounded-[10px] border border-border text-sm font-medium text-primary hover:bg-green-50 transition focus-ring">
                      {tMap("open_in_google")}
                    </a>
                  </div>
                )}
              </div>
            )}
            <div className={`${infoRow} border-t border-border`}>
              <span className={infoIcon}><CurrencyCircleDollar size={18} aria-hidden="true" /></span>
              <p className="font-semibold text-accent">{priceDisplay(ex.price_per_person)}</p>
            </div>
            {ex.max_participants != null && (
              <div className={`${infoRow} border-t border-border`}>
                <span className={infoIcon}><Users size={18} aria-hidden="true" /></span>
                <p className="text-text">
                  {ex.spots_left === 0
                    ? t("sold_out")
                    : t("spots_count", {
                        spots: ex.spots_left ?? ex.max_participants,
                        max: ex.max_participants,
                      })}
                </p>
              </div>
            )}
            {isApproved && (
              <div className="border-t border-border p-4 space-y-3">
                {showCta && (
                  <a
                    href={waHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center min-h-[48px] w-full bg-primary text-white px-6 rounded-[10px] font-semibold hover:bg-primary-dark transition focus-ring"
                  >
                    {t("whatsapp_cta")}
                  </a>
                )}
                {/* MEH-2549: share + add-to-calendar, as on the event page. */}
                <div className="flex gap-3" data-testid="experience-actions">
                  <ShareButton
                    variant="outline"
                    subject="experience"
                    url={pageUrl}
                    title={ex.title}
                    city={ex.city}
                    category={ex.category}
                  />
                  {canCalendar && (
                    <button
                      type="button"
                      onClick={() => downloadIcs(icsEvent, { url: pageUrl, filename: `experience-${ex.id}.ics` })}
                      data-testid="experience-add-to-calendar"
                      className={actionBtn}
                    >
                      <CalendarPlus size={18} aria-hidden="true" />
                      {tEv("add_to_calendar")}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>

        <div className="lg:col-start-1 mt-8 space-y-6">
          {/* MEH-1404 / MEH-1417: the map only when the backend sends coords —
              it nulls them for a home experience, so no residential pin leaks. */}
          {hasCoords && <MiniMap lat={ex.lat} lng={ex.lng} name={ex.title} />}

          {ex.description && (
            <div className="bg-white border border-border rounded-[16px] p-6 leading-relaxed whitespace-pre-line text-text/90">
              {ex.description}
            </div>
          )}

          {ex.requirements && (
            <div className="bg-green-50 border border-border rounded-[16px] p-6">
              <h2 className="font-headline-md text-lg font-bold text-text mb-2">
                {t("requirements_title")}
              </h2>
              <p className="text-text/85 whitespace-pre-line">
                {ex.requirements}
              </p>
            </div>
          )}

          {/* MEH-2539: the host as a tappable card (OwnerRow), same as the
              event page's organizer row (MEH-2538). Without a business the
              row renders with no link and no chevron. */}
          {ex.host?.name && (
            <div data-testid="experience-host">
              <OwnerRow href={hostHref} name={hostName} testId="experience-host-link">
                {t("host_label")} <span className="font-semibold">{hostName}</span>
              </OwnerRow>
            </div>
          )}

          <Link href="/experiences" className="inline-flex items-center min-h-[44px] text-primary font-medium hover:underline">
            {t("all_experiences")}
          </Link>
        </div>
      </div>
    </div>
  );
}
