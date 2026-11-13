"use client";

import SeedMark from "@/components/brand/SeedMark";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
// next-intl's Link keeps the /en prefix (next/link drops it).
import { Link } from "@/i18n/navigation";
import {
  ArrowsClockwise,
  CalendarBlank,
  CalendarPlus,
  CaretLeft,
  Check,
  Clock,
  CurrencyCircleDollar,
  MapPin,
  Users,
} from "@phosphor-icons/react";
import { useTranslations, useLocale } from "next-intl";
import { formatEventDate } from "@/lib/format-date";
// MEH-1140: canonical shekel format ("35₪") — one owner in lib/utils.
import { formatPrice } from "@/lib/utils";
import { contactHref } from "@/lib/contact-method";
import { trackChannelClick } from "@/lib/contact-tracking";
import { formatDuration } from "@/lib/experience-format";
import api from "@/lib/api";
import Breadcrumb from "@/components/Breadcrumb";
import HistoryBackLink from "@/components/HistoryBackLink";
import DateTile from "@/components/DateTile";
import ShareButton from "@/components/ShareButton";
import SaveButton from "@/components/SaveButton";
import EntityCover from "@/components/EntityCover";
import { CATEGORY_ICON } from "@/components/EventEntryRow";
import { downloadIcs } from "@/lib/event-ics";
import { eventWhen, addressNavLinks } from "@/lib/event-when";
import { AddressNavLinks } from "@/components/NavAppGlyphs";
import { SkeletonDetail } from "@/components/Skeleton";
import { splitBringList } from "@/lib/bring-list";
import { findExperienceCategory, OTHER_CATEGORY } from "@/lib/event-categories";
import RegistrationCta from "@/components/RegistrationCta";
import SectionHeading from "@/components/ui/SectionHeading";

// MEH-1404: reuse the producer-detail static map + Waze/Gmaps block on
// experiences with coords. ssr:false — leaflet touches window at module eval.
const MiniMap = dynamic(() => import("@/components/MiniMap"), { ssr: false });

// MEH-3043: short, for the sticky phone bar beside the sign-up button.
const BAR_DATE_OPTIONS = { weekday: "short", day: "numeric", month: "numeric" };

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
          <SeedMark size={76} />
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
  const waitText = t("waitlist_message", { title: ex.title });
  // MEH-2991: the host's WhatsApp link comes from the one contact table
  // (lib/contact-method.js) — null for no number or a landline, which
  // WhatsApp cannot reach. MEH-2768: no recipient-less fallback.
  const waitlistHref = hostBiz ? contactHref("whatsapp", { phone: hostBiz.producer_phone }, waitText) : null;

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
  // MEH-2989: the tile is 44px wide — an English month name needs the short form.
  const month = formatEventDate(ex.event_date, locale, { month: locale === "he" ? "long" : "short" });
  // A full experience swaps the sign-up CTA for a WhatsApp waitlist message.
  const isFull = ex.max_participants != null && ex.spots_left === 0;
  const fewLeft = !isFull && ex.max_participants != null && ex.spots_left != null && ex.spots_left <= FEW_SPOTS;
  // A host-cancelled experience drops from the feed but its link still opens;
  // it must not offer sign-up or a waitlist.
  const showCta = isApproved && !isPast && ex.is_active !== false;
  // A minimum of 1 opens on any sign-up, so there is nothing to say (and
  // «ב-1 נרשמים» would read wrong).
  const showMin = ex.min_participants != null && ex.min_participants > 1 && !isPast;
  // MEH-2768: the host's own tally plus the on-site sign-ups.
  const signedUp = (ex.participants_count ?? 0) + (ex.registered_count ?? 0);
  const minReached = showMin && signedUp >= ex.min_participants;
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
      {/* MEH-2992: one shared masthead (was a byte-identical copy per page).
          MEH-2989: no date tile on the cover — the date row carries it. */}
      <EntityCover
        imageUrl={ex.image_url}
        alt={ex.title}
        tone="accent"
        Icon={CatIcon}
        actions={<SaveButton itemType="experience" itemId={ex.id} />}
        testIdPrefix="experience"
      />

      <div className="max-w-[1100px] mx-auto px-4 pt-5 lg:pt-8 lg:grid lg:grid-cols-[1fr_360px] lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:items-start">
        <div className="lg:col-start-1">
          {/* MEH-2857: «→ חזרה» to the page the visitor came from, when there
              is one inside the site. MEH-2989: the breadcrumb below is desktop
              only — on a phone it repeated «חזרה» and the bottom tab. */}
          <HistoryBackLink />
          <Breadcrumb
            items={[
              { href: "/", label: t("breadcrumb_home") },
              { href: "/experiences", label: t("breadcrumb_experiences") },
              { label: ex.title },
            ]}
            className="hidden lg:block mb-3"
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

          {/* MEH-2989: «אחר» tells the visitor nothing — no chip for it. */}
          {cat && cat.key !== OTHER_CATEGORY && (
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
                className="inline-flex items-center gap-2 min-h-touch text-base text-text hover:text-primary rounded transition focus-ring"
              >
                <span aria-hidden="true" className="w-7 h-7 rounded-full bg-surface-card text-accent text-sm font-bold grid place-items-center">
                  {Array.from(hostName.trim())[0] ?? ""}
                </span>
                <span>{t("host_label")} {hostName}</span>
                <CaretLeft size={14} className="text-primary ltr:rotate-180" aria-hidden="true" />
              </Link>
            ) : (
              <p data-testid="experience-byline" className="text-base text-text">
                {t("host_label")} {hostName}
              </p>
            )
          )}
        </div>

        <aside className="mt-6 lg:mt-0 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-24">
          <div className="bg-surface border border-border rounded-lg overflow-hidden lg:shadow-md" data-testid="experience-info">
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
              {/* MEH-2989: the date tile is this row's icon (Luma) — the
                  date used to repeat on the cover and in a desktop header. */}
              <DateTile month={month} day={day} bandClass="bg-accent" testId="experience-date-tile" />
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
                  {/* spots_left counts the host's own tally and the on-site
                      sign-ups (MEH-2763). The page names the spots only when few are left
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
                {/* MEH-2768: the CTA follows the host's «איך נרשמים?» choice.
                    A full workshop keeps the WhatsApp waitlist, but only when
                    there is a mobile to reach. */}
                {showCta && (
                  <RegistrationCta
                    kind="experiences"
                    itemId={ex.id}
                    title={ex.title}
                    method={ex.registration_method}
                    phone={hostBiz?.producer_phone}
                    url={ex.registration_url}
                    isFull={isFull}
                    waitlistHref={waitlistHref}
                    onWaitlistClick={() => trackChannelClick(hostBiz?.producer_id, "whatsapp")}
                    waitlistLabel={t("waitlist_cta")}
                    barNote={[
                      formatEventDate(ex.event_date, locale, BAR_DATE_OPTIONS),
                      ex.event_time ? formatTime(ex.event_time) : null,
                    ].filter(Boolean).join(" · ")}
                  />
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
          {/* «מה להביא» as a short checklist above the description, the way
              experience sites list it: the host's free text, one item per line
              (or per comma when she wrote one line). White like the
              description — the old green box read as a warning. */}
          {bringItems.length > 0 && (
            <div className="bg-surface border border-border rounded-lg p-6" data-testid="experience-bring">
              <SectionHeading size="content" className="mb-3">
                {t("requirements_title")}
              </SectionHeading>
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
            <div className="bg-surface border border-border rounded-lg p-6 leading-relaxed whitespace-pre-line text-text/90">
              {ex.description}
            </div>
          )}

          {/* MEH-2989: «about» and «מה להביא» before the map (Luma / Eventbrite). */}
          {/* MEH-1404 / MEH-1417: the map only when the backend sends coords —
              it nulls them for a home experience, so no residential pin leaks. */}
          {hasCoords && <MiniMap lat={ex.lat} lng={ex.lng} name={ex.title} />}

          {/* MEH-2989: no host card and no «כל החוויות» link at the end — both
              repeated the byline under the title and the bottom tab. */}
        </div>
      </div>
    </div>
  );
}
