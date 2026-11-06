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
  Check,
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
import SaveButton from "@/components/SaveButton";
import { CATEGORY_ICON } from "@/components/EventEntryRow";
import { cssUrl } from "@/lib/css-url";
import { optimizeCloudinary, IMAGE_RATIOS } from "@/lib/cloudinary";
import { downloadIcs } from "@/lib/event-ics";
import { eventWhen, addressNavLinks } from "@/lib/event-when";
import { AddressNavLinks } from "@/components/NavAppGlyphs";
import { SkeletonDetail } from "@/components/Skeleton";
import { splitBringList } from "@/lib/bring-list";
import { findExperienceCategory } from "@/lib/event-categories";

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

// «נשארו N מקומות» shows at this many spots or fewer (approved 4/11).
const FEW_SPOTS = 3;

export default function ExperienceDetailClient() {
  const t = useTranslations("experiences.detail");
  // MEH-2476: the place-type labels are the form's own («בבית פרטי» / «מקום ציבורי»).
  const tForm = useTranslations("experiences.new");
  // MEH-2549: the event page's shared strings (time chip, calendar).
  const tEv = useTranslations("events.detail");
  const tCat = useTranslations("experiences.categories");
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
      <SkeletonDetail width="max-w-[1100px]" label={t("loading")} />
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
      className: "bg-danger-50 border-danger-300 text-danger-900",
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
  const waitText = t("waitlist_message", { title: ex.title });
  const waLink = (text) =>
    hostPhone ? getWhatsAppHref(hostPhone, text) : `https://wa.me/?text=${encodeURIComponent(text)}`;

  // MEH-2549: the event page's structure (MEH-2548) in the experience's
  // gold — cover + date tile, host byline, one details card with share +
  // calendar, then description / requirements / host card.
  const pageUrl = typeof window === "undefined" ? "" : `${window.location.origin}${window.location.pathname}`;
  // older rows store the English key («workshop») — resolve both
  // forms to the registry entry, so the chip and its icon read in Hebrew.
  const cat = findExperienceCategory(ex.category);
  const CatIcon = CATEGORY_ICON[cat?.key ?? ex.category] ?? CalendarBlank;
  const bringItems = splitBringList(ex.requirements);
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
  // A full experience swaps the sign-up CTA for a WhatsApp waitlist message.
  const isFull = ex.max_participants != null && ex.spots_left === 0;
  const fewLeft = !isFull && ex.max_participants != null && ex.spots_left != null && ex.spots_left <= FEW_SPOTS;
  // A host-cancelled experience drops from the feed but its link still opens;
  // it must not offer sign-up or a waitlist.
  const showCta = isApproved && !isPast && ex.is_active !== false;
  // A minimum of 1 opens on any sign-up, so there is nothing to say (and
  // «ב-1 נרשמים» would read wrong).
  const showMin = ex.min_participants != null && ex.min_participants > 1 && !isPast;
  const minReached = showMin && (ex.participants_count ?? 0) >= ex.min_participants;
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
  const infoIcon = "shrink-0 w-9 h-9 rounded-md bg-surface-card text-accent grid place-items-center";
  const actionBtn =
    "flex-1 inline-flex items-center justify-center gap-2 min-h-[46px] px-3 rounded-full border border-primary text-primary text-sm font-semibold hover:bg-green-50 transition focus-visible:ring-2 focus-visible:ring-primary/40";

  return (
    <div className="pb-12" data-testid="experience-detail">
      <div className="relative max-w-[1100px] mx-auto lg:px-4 lg:pt-6">
        {/* MEH-2559: the save heart on the cover's corner — the corner the recipe
            and business pages use. Not in the share/calendar row: a third
            button there wraps «הוספה ליומן» onto two lines below 375px. */}
        <div className="absolute top-3 end-3 lg:top-9 lg:end-7 z-10" data-testid="experience-cover-actions">
          <SaveButton itemType="experience" itemId={ex.id} />
        </div>
        {ex.image_url ? (
          <div
            data-testid="experience-cover"
            className="h-[210px] md:h-[300px] lg:h-[380px] bg-cover bg-center lg:rounded-xl bg-border"
            style={{ backgroundImage: cssUrl(optimizeCloudinary(ex.image_url, { aspectRatio: IMAGE_RATIOS.banner, width: 1280 })) }}
            role="img"
            aria-label={ex.title}
          />
        ) : (
          <div
            data-testid="experience-cover-band"
            aria-hidden="true"
            className="h-[150px] lg:h-[200px] bg-accent lg:rounded-xl grid place-items-center"
          >
            <CatIcon size={54} weight="duotone" className="text-white/85" />
          </div>
        )}
        <div
          aria-hidden="true"
          className="lg:hidden absolute start-4 -bottom-7 w-16 rounded-md bg-white shadow-lg text-center overflow-hidden"
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
            <div className="bg-green-50 border border-primary text-primary rounded-md p-4 mb-4">
              {t("just_submitted")}
            </div>
          )}

          {banner && !justSubmitted && (
            <div className={`border rounded-md p-4 mb-4 ${banner.className}`}>
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

          {cat && (
            // MEH-2675: the chip opens the experiences list filtered to its
            // type (?category= is the list's deep link, EventsClient.jsx).
            // Always the Hebrew wire key — an older row may store "food_tour".
            <Link
              href={`/experiences?category=${encodeURIComponent(cat.key)}`}
              data-testid="experience-category"
              className="inline-flex items-center gap-1 bg-surface-card text-accent text-xs px-3 py-1 rounded-full mb-3 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <CatIcon size={12} weight="bold" aria-hidden="true" />
              {tCat(cat.labelKey)}
            </Link>
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
                className="inline-flex items-center gap-2 min-h-touch text-[15px] text-text hover:text-primary rounded transition focus-ring"
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
          <div className="bg-white border border-border rounded-lg overflow-hidden lg:shadow-md" data-testid="experience-info">
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
                {nav && <AddressNavLinks links={nav} testId="experience-nav-links" />}
              </div>
            )}
            <div className={`${infoRow} border-t border-border`}>
              <span className={infoIcon}><CurrencyCircleDollar size={18} aria-hidden="true" /></span>
              <p className="font-semibold text-accent">{priceDisplay(ex.price_per_person)}</p>
            </div>
            {(ex.max_participants != null || showMin) && (
              <div className={`${infoRow} border-t border-border`}>
                <span className={infoIcon}><Users size={18} aria-hidden="true" /></span>
                <div>
                  {/* Sign-up is on WhatsApp; the host reports the count from her
                      dashboard. The page names the spots only when few are left
                      (Airbnb / Eventbrite do the same) and otherwise the cap. */}
                  {ex.max_participants != null && (
                    <p
                      className={`text-text ${isFull || fewLeft ? "font-semibold" : ""}`}
                      data-testid="experience-capacity"
                    >
                      {isFull
                        ? t("sold_out")
                        : fewLeft
                          ? t("spots_left_few", { n: ex.spots_left })
                          : tEv("participants_limit", { n: ex.max_participants })}
                    </p>
                  )}
                  {/* Stage B: the host's minimum to run it, read against the
                      count she reports. Small-workshop sites (ClassBento and
                      the like) show the same pair of states. */}
                  {showMin && (
                    <p
                      className={`text-sm ${minReached ? "font-semibold text-primary" : "text-fg-muted"}`}
                      data-testid="experience-min"
                    >
                      {minReached ? t("min_reached") : t("min_to_open", { n: ex.min_participants })}
                    </p>
                  )}
                </div>
              </div>
            )}
            {isApproved && (
              <div className="border-t border-border p-4 space-y-3">
                {showCta && (
                  <a
                    href={waLink(isFull ? waitText : waText)}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="experience-whatsapp-cta"
                    className="flex items-center justify-center min-h-[48px] w-full bg-primary text-white px-6 rounded-full font-semibold hover:bg-primary-dark transition focus-ring"
                  >
                    {isFull ? t("waitlist_cta") : t("whatsapp_cta")}
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
                    category={cat ? tCat(cat.labelKey) : undefined}
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

          {/* «מה להביא» as a short checklist above the description, the way
              experience sites list it: the host's free text, one item per line
              (or per comma when she wrote one line). White like the
              description — the old green box read as a warning. */}
          {bringItems.length > 0 && (
            <div className="bg-white border border-border rounded-lg p-6" data-testid="experience-bring">
              <h2 className="font-headline-md text-lg font-bold text-text mb-3">
                {t("requirements_title")}
              </h2>
              <ul className="space-y-2">
                {bringItems.map((item, i) => (
                  <li key={`${i}-${item}`} className="flex items-start gap-2 text-text/90">
                    <Check size={18} weight="bold" className="shrink-0 mt-0.5 text-primary" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {ex.description && (
            <div className="bg-white border border-border rounded-lg p-6 leading-relaxed whitespace-pre-line text-text/90">
              {ex.description}
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

          <Link href="/experiences" className="inline-flex items-center min-h-touch text-primary font-medium hover:underline">
            {t("all_experiences")}
          </Link>
        </div>
      </div>
    </div>
  );
}
