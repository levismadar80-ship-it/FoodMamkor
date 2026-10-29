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
 *           email / WhatsApp group / order form, founding year); MEH-2547
 *           (cover + avatar masthead, EventEntryRow rows).
 */
import { notFound } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { API_URL } from "@/lib/env";
import { serverFetch } from "@/lib/server-fetch";
import { buildAlternates, buildEntityTitle, OG_LOCALE } from "@/lib/i18n-seo";
import { isSlugShaped } from "@/lib/slug";
import { optimizeCloudinary } from "@/lib/cloudinary";
import { toEventEntry } from "@/lib/event-entry";
import EventEntryRow from "@/components/EventEntryRow";
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

// MEH-2475: every channel the organizer can fill (dashboard «קשר» group), in
// one list. Each builder returns null when its field is empty, so 0 / 1 / many
// filled channels render 0 / 1 / many links with no placeholder.
// The WhatsApp prefill is the business page's (lib/contact-method.js
// getPrimaryContactHref, MEH-1559) so the organizer sees where a message came
// from; the other hrefs follow the same per-channel rules.
const waPrefill = (o) => `היי! הגעתי דרך מהמקור — ${o.name || ""}`;
const CHANNELS = [
  {
    key: "whatsapp",
    href: (o) => (normalizePhone(o.phone) ? getWhatsAppHref(normalizePhone(o.phone), waPrefill(o)) : null),
  },
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
  const tList = await getTranslations({ locale, namespace: "events.list" });
  const events = organizer.upcoming_events || [];
  const image = organizer.images?.[0];
  const initial = Array.from((organizer.name || "").trim())[0] ?? "";

  return (
    <main className="max-w-3xl mx-auto pb-10 space-y-8" data-testid="organizer-page">
      {/* MEH-2547: a masthead — the organizer's first photo as a cover (a
          green band when there is none), and a round initial overlapping its
          edge, the way Meetup and Luma head a group/calendar page. */}
      <header>
        <div className="relative md:px-4 md:pt-6">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL, sized by the helper
            <img
              src={optimizeCloudinary(image, { aspectRatio: "16:9", width: 1100 })}
              alt={organizer.name}
              data-testid="organizer-cover"
              className="w-full h-[170px] md:h-[320px] object-cover md:rounded-[18px] bg-border"
            />
          ) : (
            <div
              aria-hidden="true"
              data-testid="organizer-cover-band"
              className="w-full h-[96px] md:h-[140px] md:rounded-[18px] bg-green-50"
            />
          )}
          {initial && (
            <span
              aria-hidden="true"
              data-testid="organizer-avatar"
              className="absolute -bottom-10 start-4 md:start-14 w-20 h-20 rounded-full bg-primary text-white font-headline-md text-3xl font-bold grid place-items-center ring-4 ring-background"
            >
              {initial}
            </span>
          )}
        </div>
        <div className="px-4 pt-14 space-y-4 md:px-14">
          <h1 className="font-headline-lg text-3xl md:text-4xl font-bold text-text">{organizer.name}</h1>
          {(organizer.city || organizer.established_year) && (
            <p className="text-sm text-fg-muted">
              {organizer.city}
              {organizer.city && organizer.established_year ? " · " : null}
              {/* MEH-2475: the quiet «since» line, as on a business masthead
                  (ProducerHeader established-year). Absent when unset. */}
              {organizer.established_year ? (
                <span data-testid="organizer-since">
                  {t("since_prefix")}{" "}
                  <span dir="ltr" className="numeric">{organizer.established_year}</span>
                </span>
              ) : null}
            </p>
          )}
          {organizer.description && (
            <p className="text-base leading-relaxed text-text whitespace-pre-line">
              {organizer.description}
            </p>
          )}
          <ContactLinks organizer={organizer} t={t} />
        </div>
      </header>

      <div className="px-4 md:px-14 space-y-8">
        <section aria-labelledby="organizer-events-heading" className="space-y-3">
          <h2 id="organizer-events-heading" className="text-xl font-bold text-text">
            {t("events_heading")}
          </h2>
          {events.length === 0 ? (
            <p className="text-fg-muted" data-testid="organizer-events-empty">
              {t("empty")}
            </p>
          ) : (
            // MEH-2547: the same date-rail row as /events and the home preview.
            // The «who» line and the owner-photo fallback are dropped here —
            // every row is this organizer's, and its photo is the cover above.
            <ul className="border-t border-border" data-testid="organizer-events">
              {events.map((ev) => (
                <li key={ev.id} data-testid="organizer-event">
                  <EventEntryRow
                    entry={toEventEntry({ ...ev, producer_name: null, owner_image_url: null }, "events", tList)}
                    freeLabel={tList("free")}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
        {/* MEH-2475: the person behind the events — the business page's
            OwnerCard (data-gated: renders nothing without a name, bio or
            photo), under the organizer's own heading. MEH-2547: after the
            events, which are what a visitor came for. */}
        <OwnerCard producer={organizer} heading={t("owner_heading")} />
      </div>
    </main>
  );
}
