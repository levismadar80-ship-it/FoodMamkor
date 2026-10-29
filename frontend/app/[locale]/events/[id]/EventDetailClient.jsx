"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
// next-intl's Link keeps the /en prefix (next/link drops it under
// localePrefix: as-needed — MEH-2403 review).
import { Link } from "@/i18n/navigation";
import {
  Calendar,
  CalendarBlank,
  CalendarPlus,
  CaretLeft,
  Coins,
  Leaf,
  MapPin,
  UsersThree,
} from "@phosphor-icons/react";
import { useTranslations, useLocale } from "next-intl";
import api from "@/lib/api";
import { formatEventDate } from "@/lib/format-date";
import { formatTimeRange } from "@/lib/time-range";
// MEH-1140: canonical shekel format ("35₪") — one owner in lib/utils.
import { formatPrice } from "@/lib/utils";
import { cssUrl } from "@/lib/css-url";
import { optimizeCloudinary, IMAGE_RATIOS } from "@/lib/cloudinary";
import Breadcrumb from "@/components/Breadcrumb";
import ShareButton from "@/components/ShareButton";
import SaveButton from "@/components/SaveButton";
import OwnerRow from "@/components/OwnerRow";
import EventEntryRow, { CATEGORY_ICON } from "@/components/EventEntryRow";
import { toEventEntry } from "@/lib/event-entry";
import { eventWhen, addressNavLinks } from "@/lib/event-when";
import { downloadIcs } from "@/lib/event-ics";

// MEH-1404: reuse the producer-detail static map + Waze/Gmaps block on events
// that carry coords. ssr:false — leaflet touches window at module eval.
const MiniMap = dynamic(() => import("@/components/MiniMap"), { ssr: false });

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
  // MEH-2548: the owner's upcoming events — «עוד אירועים של…» and, on a
  // past event, «the next one». Best effort: a failure just hides them.
  const [moreEvents, setMoreEvents] = useState([]);
  const tMap = useTranslations("map.mini");

  useEffect(() => {
    api
      .get(`/events/${id}`)
      .then((r) => setEvent(r.data))
      .catch(() => setEvent(null))
      .finally(() => setLoading(false));
  }, [id]);

  const ownerId = event?.producer_id;
  useEffect(() => {
    // A new owner (client-side navigation) never shows the previous owner's list.
    setMoreEvents([]);
    if (!ownerId) return;
    let live = true;
    api
      // Upcoming only, date-ascending (list_events) — so others[0] is the next one.
      .get("/events", { params: { producer_id: ownerId } })
      .then((r) => live && setMoreEvents(Array.isArray(r.data) ? r.data : []))
      .catch(() => live && setMoreEvents([]));
    return () => {
      live = false;
    };
  }, [ownerId]);

  if (loading) {
    // MEH-858 F7: geometry-matched skeleton (was a bare centered line) — mirrors
    // the detail layout so it doesn't jump on hydrate. Cream-toned bg-border/60
    // pulse per ADR-019, same idiom as the list SkeletonRows. aria-label keeps
    // the SR "loading" announcement.
    return (
      // MEH-1957: same fix as the list skeleton — aria-label needs a role to be
      // permitted; without it axe reports aria-prohibited-attr (serious).
      <div role="status" aria-busy="true" aria-label={t("loading")}>
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

  // MEH-2461: who owns this event — a business or an organizer (ADR-036).
  const isOrganizerEvent = event.owner_kind === "organizer";
  const ownerHref = isOrganizerEvent
    ? event.owner_slug
      ? `/organizers/${event.owner_slug}`
      : null
    : `/producer/${event.producer_id}`;
  const ownerLabel = isOrganizerEvent
    ? t("organizer_line", { name: event.producer_name })
    : `${t("organized_by")} ${event.producer_name}`;

  // The canonical page address for share + the calendar entry. Client-only
  // component past the loading gate, so window is defined here.
  const pageUrl = typeof window === "undefined" ? "" : `${window.location.origin}${window.location.pathname}`;

  // MEH-2548: «היום» / «מחר» / «השבוע» beside the date, or the past-event
  // notice (Israel calendar — lib/event-when.js).
  const when = eventWhen(event.event_date);
  const isPast = when === "past";
  const CatIcon = CATEGORY_ICON[event.category] ?? CalendarBlank;
  const hasCoords = event.lat != null && event.lng != null;
  // Waze / Google from the address when there is no map point (organizer
  // events have none) — MiniMap carries its own buttons when there is one.
  const nav = hasCoords ? null : addressNavLinks(event.location, event.city);
  // Upcoming events of the same owner, this one excluded. On a past event the
  // first of them is «the next one» (shown under the notice, not repeated).
  const others = moreEvents.filter((e) => String(e.id) !== String(event.id));
  const nextEvent = isPast ? others[0] : null;
  const moreList = (isPast ? others.slice(1) : others).slice(0, 3);

  const day = formatEventDate(event.event_date, locale, { day: "numeric" });
  const month = formatEventDate(event.event_date, locale, { month: "long" });
  const weekday = formatEventDate(event.event_date, locale, { weekday: "long" });

  const ctaClass =
    "flex items-center justify-center min-h-[48px] w-full bg-primary text-white px-6 rounded-[10px] font-semibold hover:bg-primary-dark transition focus-ring";
  const cta = isPast ? null : event.registration_url ? (
    <a href={event.registration_url} target="_blank" rel="noopener noreferrer" className={ctaClass}>
      {t("register")}
    </a>
  ) : isOrganizerEvent ? null : (
    // MEH-2461: «יצירת קשר עם בית העסק» names a business; an organizer is
    // reached through the «מארגן:» link instead.
    <Link href={`/producer/${event.producer_id}`} className={ctaClass}>
      {t("contact_producer")}
    </Link>
  );

  const infoRow = "flex items-center gap-3 px-4 py-3";
  const infoIcon = "shrink-0 w-9 h-9 rounded-[10px] bg-green-50 text-primary grid place-items-center";

  return (
    <div className="pb-12" data-testid="event-detail">
      {/* MEH-2548: cover — the event's photo, else a green band carrying the
          category icon (never an empty frame). The date tile overlaps its
          edge on mobile (Luma's calendar-page tile); on desktop it heads the
          side card instead. */}
      <div className="relative max-w-[1100px] mx-auto lg:px-4 lg:pt-6">
        {/* MEH-2559: the save heart on the cover's corner — the corner the recipe
            and business pages use. Not in the share/calendar row: a third
            button there wraps «הוספה ליומן» onto two lines below 375px. */}
        <div className="absolute top-3 start-3 lg:top-9 lg:start-7 z-10" data-testid="event-cover-actions">
          <SaveButton itemType="event" itemId={event.id} />
        </div>
        {event.image_url ? (
          <div
            data-testid="event-cover"
            className="h-[210px] md:h-[300px] lg:h-[380px] bg-cover bg-center lg:rounded-[18px] bg-border"
            style={{ backgroundImage: cssUrl(optimizeCloudinary(event.image_url, { aspectRatio: IMAGE_RATIOS.banner, width: 1280 })) }}
            role="img"
            aria-label={event.title}
          />
        ) : (
          <div
            data-testid="event-cover-band"
            aria-hidden="true"
            className="h-[150px] lg:h-[200px] bg-primary lg:rounded-[18px] grid place-items-center"
          >
            <CatIcon size={54} weight="duotone" className="text-white/85" />
          </div>
        )}
        <div
          aria-hidden="true"
          data-testid="event-date-tile"
          className="lg:hidden absolute start-4 -bottom-7 w-16 rounded-[12px] bg-white shadow-lg text-center overflow-hidden"
        >
          <span className="block bg-primary text-white text-[11px] font-bold py-0.5">{month}</span>
          <span className="block font-headline-display font-black text-[28px] leading-tight pt-1 numeric">{day}</span>
          <span className="block text-[10px] text-fg-muted pb-1.5">{weekday}</span>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-4 pt-11 lg:pt-8 lg:grid lg:grid-cols-[1fr_360px] lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:items-start">
        <div className="lg:col-start-1">
          <Breadcrumb
            items={[
              { href: "/", label: t("breadcrumb_home") },
              { href: "/events", label: t("breadcrumb_events") },
              { label: event.title },
            ]}
            className="mb-3"
          />
          {event.category && (
            <span className="inline-flex items-center gap-1 bg-green-50 text-primary text-xs px-3 py-1 rounded-full mb-3">
              <CatIcon size={12} weight="bold" aria-hidden="true" />
              {event.category}
            </span>
          )}
          <h1 className="font-headline-display text-4xl md:text-5xl font-black text-text mb-3">
            {event.title}
          </h1>
          {/* MEH-2548: who runs it, right under the title (Eventbrite / Luma
              byline) — the full owner card stays at the bottom. */}
          {event.producer_name && (
            ownerHref ? (
              <Link
                href={ownerHref}
                data-testid="event-byline"
                className="inline-flex items-center gap-2 min-h-[44px] text-[15px] text-text hover:text-primary rounded transition focus-ring"
              >
                <span aria-hidden="true" className="w-7 h-7 rounded-full bg-green-50 text-primary text-sm font-bold grid place-items-center">
                  {Array.from(event.producer_name.trim())[0] ?? ""}
                </span>
                <span>{ownerLabel}</span>
                <CaretLeft size={14} className="text-primary ltr:rotate-180" aria-hidden="true" />
              </Link>
            ) : (
              <p data-testid="event-byline" className="text-[15px] text-text">{ownerLabel}</p>
            )
          )}

          {/* MEH-2548: an old link (a share, a search result) to a finished
              event points at the owner's next one instead of a dead end. */}
          {isPast && (
            <div className={`mt-5 rounded-[12px] bg-surface-card overflow-hidden px-4 pt-3 ${nextEvent ? "" : "pb-3"}`} data-testid="event-past-notice">
              <p className="text-sm text-text">
                {t("past_notice")}
                {nextEvent && event.producer_name && <> {t("past_next", { name: event.producer_name })}</>}
              </p>
              {nextEvent && (
                <div className="mt-3 -mx-4 border-t border-border" data-testid="event-past-next">
                  <EventEntryRow entry={toEventEntry({ ...nextEvent, producer_name: null }, "events", t)} freeLabel={t("free")} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Details card: below the title on mobile, a sticky side card on
            desktop (Airbnb / Eventbrite). */}
        <aside className="mt-6 lg:mt-0 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-24 space-y-4">
          <div className="bg-white border border-border rounded-[14px] overflow-hidden lg:shadow-md" data-testid="event-info">
            <div aria-hidden="true" className="hidden lg:block text-center border-b border-border">
              <span className="block bg-primary text-white text-sm font-bold py-1.5">
                {formatEventDate(event.event_date, locale, { month: "long", year: "numeric" })}
              </span>
              <span className="block font-headline-display font-black text-5xl leading-tight pt-2 numeric">{day}</span>
              <span className="block text-sm text-fg-muted pb-3">{weekday}</span>
            </div>
            <div className={infoRow}>
              <span className={infoIcon}><Calendar size={18} aria-hidden="true" /></span>
              <p className="flex-1 min-w-0 font-semibold text-text">
                {formatEventDate(event.event_date, locale, DETAIL_DATE_OPTIONS)}
                {event.event_time && (
                  // MEH-2469: «09:30–15:00» when there is an end time. The «·»
                  // stays outside the LTR isolate so it keeps following the date.
                  <>
                    {" · "}
                    <span dir="ltr">{formatTimeRange(event.event_time, event.end_time)}</span>
                  </>
                )}
              </p>
              {when && when !== "past" && (
                <span data-testid="event-when" className="shrink-0 text-xs font-bold px-2.5 py-1 rounded-full bg-surface-card text-accent">
                  {t(`when_${when}`)}
                </span>
              )}
            </div>
            {(event.location || event.city) && (
              <div className="border-t border-border">
                <div className={infoRow}>
                  <span className={infoIcon}><MapPin size={18} aria-hidden="true" /></span>
                  <div className="min-w-0">
                    <p className="font-semibold text-text">{event.location || event.city}</p>
                    {event.location && event.city && <p className="text-sm text-fg-muted">{event.city}</p>}
                  </div>
                </div>
                {nav && (
                  <div className="flex gap-2 px-4 pb-3" data-testid="event-nav-links">
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
              <span className={infoIcon}><Coins size={18} aria-hidden="true" /></span>
              {/* MEH-1031: bidi-isolate the price (currency+number) so it can't flip in RTL */}
              <p className="font-semibold text-accent">
                {event.price > 0 ? <span dir="ltr">{formatPrice(event.price)}</span> : t("free")}
              </p>
            </div>
            {event.max_participants && (
              <div className={`${infoRow} border-t border-border`}>
                <span className={infoIcon}><UsersThree size={18} aria-hidden="true" /></span>
                <p className="text-text">{t("participants_limit", { n: event.max_participants })}</p>
              </div>
            )}
            <div className="border-t border-border p-4 space-y-3">
              {cta}
              {/* MEH-2468 share + add-to-calendar; MEH-2548 as two equal
                  buttons with icons (Luma, Eventbrite). */}
              <div className="flex gap-3" data-testid="event-actions">
                <ShareButton
                  variant="outline"
                  subject="event"
                  url={pageUrl}
                  title={event.title}
                  city={event.city}
                  category={event.category}
                />
                {!isPast && (
                  <button
                    type="button"
                    onClick={() => downloadIcs(event, { url: pageUrl })}
                    data-testid="event-add-to-calendar"
                    className="flex-1 inline-flex items-center justify-center gap-2 min-h-[46px] px-3 rounded-[10px] border border-primary text-primary text-sm font-semibold hover:bg-green-50 transition focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    <CalendarPlus size={18} aria-hidden="true" />
                    {t("add_to_calendar")}
                  </button>
                )}
              </div>
            </div>
          </div>
        </aside>

        <div className="lg:col-start-1 mt-8 lg:mt-8 space-y-8">
          {/* MEH-1404: map + navigation buttons when the event has coordinates. */}
          {hasCoords && <MiniMap lat={event.lat} lng={event.lng} name={event.title} />}

          {event.description && (
            <div className="bg-white border border-border rounded-[16px] p-6 leading-relaxed whitespace-pre-line text-text/90">
              {event.description}
            </div>
          )}

          {/* MEH-2548: the owner's other upcoming events (Meetup «more events
              from this group»). Absent when there are none. */}
          {moreList.length > 0 && event.producer_name && (
            <section aria-labelledby="event-more-heading" data-testid="event-more">
              <h2 id="event-more-heading" className="text-xl font-bold text-text mb-3">
                {t("more_from", { name: event.producer_name })}
              </h2>
              <ul className="border-t border-border">
                {moreList.map((ev) => (
                  <li key={ev.id}>
                    <EventEntryRow entry={toEventEntry({ ...ev, producer_name: null }, "events", t)} freeLabel={t("free")} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* MEH-2461: the owner card — an organizer's event links to
              /organizers/{slug} (its business page 404s since MEH-2459).
              Full-width card with initial avatar + forward chevron. */}
          {event.producer_name && isOrganizerEvent && (
            <div data-testid="event-organizer-line">
              <OwnerRow href={ownerHref || undefined} name={event.producer_name}>
                {t("organizer_line", { name: event.producer_name })}
              </OwnerRow>
            </div>
          )}
          {event.producer_name && !isOrganizerEvent && (
            <div data-testid="event-business-line">
              <OwnerRow href={ownerHref} name={event.producer_name}>
                {t("organized_by")} <span className="font-semibold">{event.producer_name}</span>
              </OwnerRow>
            </div>
          )}

          <Link href="/events" className="inline-flex items-center min-h-[44px] text-primary font-medium hover:underline">
            {t("all_events")}
          </Link>
        </div>
      </div>
    </div>
  );
}
