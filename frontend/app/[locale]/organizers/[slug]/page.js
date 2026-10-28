/**
 * Module:   organizers/[slug]/page
 * Purpose:  The public page of a markets / events organizer (kind='organizer',
 *           ADR-036): who they are, how to reach them, and their upcoming
 *           events. The only public surface an organizer has besides the
 *           events themselves.
 * Touches:  GET /organizers/{slug} (server fetch, revalidate 60).
 * Does NOT: render a business page — no products, categories, delivery,
 *           badges or reviews (those live on /producer/{id} and /{slug}, which
 *           404 an organizer since MEH-2459). Never listed under /producers.
 * Related:  app/[locale]/[slug]/page.js (the business twin whose fetch / 404 /
 *           metadata contract this mirrors), backend/app/routers/organizers.py.
 * History:  MEH-2461 (creation; review #3712: Rule 19 probe, safe links,
 *           setRequestLocale); MEH-2475 (owner story, preferred channel first,
 *           email / WhatsApp group / order form, founding year).
 */
import { notFound } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { API_URL } from "@/lib/env";
import { serverFetch } from "@/lib/server-fetch";
import { buildAlternates, buildEntityTitle, OG_LOCALE } from "@/lib/i18n-seo";
import { isSlugShaped } from "@/lib/slug";
import { optimizeCloudinary } from "@/lib/cloudinary";
import { formatTimeRange } from "@/lib/time-range";
import { getWhatsAppHref, normalizePhone } from "@/lib/utils";
import { instagramUrl } from "@/lib/social-links";
import { OrganizerPageSchema } from "@/lib/schemas";
import { getPrimaryMethod } from "@/lib/contact-method";
import OwnerCard from "@/app/[locale]/producer/[id]/components/OwnerCard";

const ROUTE = "/[locale]/organizers/[slug]";

// REUSES: app/[locale]/[slug]/page.js:25 (MEH-1754) — `null` means ONE thing,
// "no such public organizer". Every other failure throws to error.js, so a
// backend wobble is a 5xx (retry later), never a de-indexing 404.
async function getOrganizer(slug) {
  if (!isSlugShaped(slug)) return null;
  const url = `${API_URL}/organizers/${encodeURIComponent(slug)}`;
  const res = await serverFetch(url, { next: { revalidate: 60 } });
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = new Error(
      `organizer lookup failed: ${res.status} ${res.statusText} (slug=${slug})`,
    );
    err.status = res.status;
    err.slug = slug;
    throw err;
  }
  const data = await res.json();
  // REUSES: app/[locale]/events/[id]/page.js (MEH-1885) — Rule 19 as a probe:
  // a contract break is reported, and the raw payload still renders (never
  // `parsed.data`, never a throw or notFound()).
  const parsed = OrganizerPageSchema.safeParse(data);
  if (!parsed.success) {
    Sentry.captureMessage("SSR payload failed schema validation", {
      level: "warning",
      extra: { route: ROUTE, slug, issues: parsed.error.issues },
    });
  }
  return data;
}

// REUSES: app/[locale]/producer/[id]/components/ContactCard.jsx:124 — httpUrl.
// A stored website / facebook value without a scheme becomes an https link
// (and never an in-site relative path).
function httpUrl(raw) {
  const v = (raw || "").trim();
  if (!v) return null;
  return v.startsWith("http") ? v : `https://${v}`;
}

export async function generateMetadata(props) {
  const { slug, locale } = await props.params;
  if (!isSlugShaped(slug)) notFound();
  const organizer = await getOrganizer(slug);
  const alternates = buildAlternates(`/organizers/${slug}`, locale);
  if (!organizer) {
    return {
      title: { absolute: buildEntityTitle(null, locale) },
      robots: { index: false, follow: false },
      alternates,
    };
  }
  const description = organizer.short_description || organizer.description || undefined;
  return {
    title: { absolute: buildEntityTitle(organizer.name, locale) },
    description,
    openGraph: {
      title: organizer.name,
      description,
      locale: OG_LOCALE[locale],
      images: organizer.images?.[0] ? [{ url: organizer.images[0] }] : undefined,
    },
    alternates,
  };
}

/** A date-only "YYYY-MM-DD" rendered in the reader's locale. Pinned to UTC so
 *  the server's zone can never shift the calendar day of a date-only value. */
function formatEventDate(isoDate, locale) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "he-IL", {
    weekday: "short",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

// MEH-2475: every channel the organizer can fill (dashboard «קשר» group), in
// one list. Each builder returns null when its field is empty, so 0 / 1 / many
// filled channels render 0 / 1 / many links with no placeholder.
// REUSES: lib/contact-method.js getPrimaryContactHref — the same href per key,
// so a channel links identically here and on a business page.
const CHANNELS = [
  { key: "whatsapp", href: (o) => (normalizePhone(o.phone) ? getWhatsAppHref(normalizePhone(o.phone)) : null) },
  { key: "phone", href: (o) => (o.phone?.trim() ? `tel:${o.phone.trim()}` : null) },
  { key: "email", href: (o) => (o.contact_email?.trim() ? `mailto:${o.contact_email.trim()}` : null) },
  { key: "instagram", href: (o) => instagramUrl(o.instagram) },
  { key: "website", href: (o) => httpUrl(o.website) },
  { key: "facebook", href: (o) => httpUrl(o.facebook) },
  { key: "whatsapp_group", href: (o) => httpUrl(o.whatsapp_group) },
  { key: "external_order", href: (o) => httpUrl(o.external_order_form) },
];

/** The channels to show, preferred first. One number backs both WhatsApp and
 *  a call: the call link appears only when phone is the preferred channel,
 *  and then the WhatsApp link built from that number does not (MEH-2475 —
 *  the page used to offer WhatsApp whatever the organizer chose). */
function contactChannels(organizer) {
  const primary = getPrimaryMethod(organizer);
  const shown = CHANNELS.filter((c) =>
    c.key === "phone" ? primary === "phone" : c.key === "whatsapp" ? primary !== "phone" : true,
  )
    .map((c) => ({ key: c.key, href: c.href(organizer), primary: c.key === primary }))
    .filter((c) => c.href);
  return [...shown.filter((c) => c.primary), ...shown.filter((c) => !c.primary)];
}

const LINK_BASE =
  "inline-flex items-center min-h-[44px] px-4 rounded-full border text-sm transition focus-ring";

function ContactLinks({ organizer, t }) {
  const links = contactChannels(organizer);
  if (links.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" data-testid="organizer-contact">
      {links.map((l) => (
        <li key={l.key}>
          <a
            href={l.href}
            {...(l.key === "phone" || l.key === "email"
              ? {}
              : { target: "_blank", rel: "noopener noreferrer" })}
            data-testid={`organizer-contact-${l.key}`}
            data-primary={l.primary ? "true" : undefined}
            className={
              l.primary
                ? `${LINK_BASE} border-primary bg-primary text-white font-medium hover:bg-primary-dark`
                : `${LINK_BASE} border-border text-primary hover:bg-primary/5`
            }
          >
            {t(l.key)}
          </a>
        </li>
      ))}
    </ul>
  );
}

export default async function OrganizerPage(props) {
  const { slug, locale } = await props.params;
  setRequestLocale(locale);
  const organizer = await getOrganizer(slug);
  if (!organizer) notFound();
  const t = await getTranslations({ locale, namespace: "organizers.page" });
  const events = organizer.upcoming_events || [];
  const image = organizer.images?.[0];

  return (
    <main className="max-w-3xl mx-auto px-4 py-10 space-y-8" data-testid="organizer-page">
      <header className="space-y-4">
        {image && (
          // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL, sized by the helper
          <img
            src={optimizeCloudinary(image, { width: 960 })}
            alt={organizer.name}
            className="w-full aspect-[16/9] object-cover rounded-[16px] bg-border"
          />
        )}
        <h1 className="font-headline-lg text-3xl font-bold text-text">{organizer.name}</h1>
        {organizer.city && <p className="text-sm text-fg-muted">{organizer.city}</p>}
        {/* MEH-2475: the quiet «since» line, as on a business masthead
            (ProducerHeader established-year). Absent when unset. */}
        {organizer.established_year ? (
          <p className="text-sm text-fg-muted" data-testid="organizer-since">
            {t("since_prefix")}{" "}
            <span dir="ltr" className="numeric">{organizer.established_year}</span>
          </p>
        ) : null}
        {organizer.description && (
          <p className="text-base leading-relaxed text-text whitespace-pre-line">
            {organizer.description}
          </p>
        )}
        <ContactLinks organizer={organizer} t={t} />
      </header>

      {/* MEH-2475: the person behind the events — the business page's
          OwnerCard (data-gated: renders nothing without a name, bio or
          photo), under the organizer's own heading. */}
      <OwnerCard producer={organizer} heading={t("owner_heading")} />

      <section aria-labelledby="organizer-events-heading" className="space-y-3">
        <h2 id="organizer-events-heading" className="text-xl font-bold text-text">
          {t("events_heading")}
        </h2>
        {events.length === 0 ? (
          <p className="text-fg-muted" data-testid="organizer-events-empty">
            {t("empty")}
          </p>
        ) : (
          <ul className="space-y-3" data-testid="organizer-events">
            {events.map((ev) => (
              <li key={ev.id}>
                <Link
                  href={`/events/${ev.id}`}
                  data-testid="organizer-event"
                  className="flex items-center gap-4 rounded-[12px] border border-border bg-white p-4 hover:border-primary transition focus-ring"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-fg-muted">
                      {formatEventDate(ev.event_date, locale)}
                      {/* MEH-2469: start, or «09:30–15:00» with an end time. */}
                      {ev.event_time && (
                        <>
                          {" · "}
                          <span dir="ltr">{formatTimeRange(ev.event_time, ev.end_time)}</span>
                        </>
                      )}
                      {ev.city ? ` · ${ev.city}` : ""}
                    </span>
                    <span className="block font-medium text-text mt-1">{ev.title}</span>
                  </span>
                  {/* MEH-2468: the event's cover image when it has one;
                      decorative — the link is named by the title. */}
                  {ev.image_url && (
                    <span
                      aria-hidden="true"
                      data-testid="organizer-event-image"
                      className="shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-[10px] bg-border bg-cover bg-center"
                      style={{
                        backgroundImage: `url(${optimizeCloudinary(ev.image_url, { aspectRatio: "1:1", width: 160 })})`,
                      }}
                    />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
