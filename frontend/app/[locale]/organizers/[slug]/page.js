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
import { BRAND_NAME } from "@/lib/constants";
import { optimizeCloudinary } from "@/lib/cloudinary";
import { toEventEntry } from "@/lib/event-entry";
import EventEntryRow from "@/components/EventEntryRow";
import { OrganizerPageSchema } from "@/lib/schemas";
import { contactHref, getPrimaryMethod } from "@/lib/contact-method";
import OrganizerPrimaryContact from "./OrganizerPrimaryContact";
import OrganizerContactLink from "./OrganizerContactLink";
import HistoryBackLink from "@/components/HistoryBackLink";
import ShareButton from "@/components/ShareButton";
import OwnerCard from "@/app/[locale]/producer/[id]/components/OwnerCard";
import SectionHeading from "@/components/ui/SectionHeading";

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
    // MEH-2853: plain title — the layout template `%s | <brand>` adds the brand.
    title: organizer.name,
    description,
    openGraph: {
      // MEH-2594: url/type/siteName, as on the event and business pages.
      type: "website",
      title: organizer.name,
      description,
      url: alternates.canonical,
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
      // MEH-2590: site image when none (an omitted key is not inherited).
      images: organizer.images?.[0] ? [{ url: organizer.images[0] }] : ["/og-image.png"],
    },
    alternates,
  };
}

// MEH-2475: every channel the organizer can fill (dashboard «קשר» group), in
// one list. An empty field gives a null href, so 0 / 1 / many filled channels
// render 0 / 1 / many links with no placeholder.
// MEH-2991: the hrefs come from the one table the business page reads
// (lib/contact-method.js contactHref) — this page used to carry its own copy.
const CHANNEL_KEYS = [
  "whatsapp",
  "phone",
  "email",
  "instagram",
  "website",
  "facebook",
  "whatsapp_group",
  "external_order",
];

/** The channels to show, preferred first. One number backs both WhatsApp and
 *  a call: the call link appears only when phone is the preferred channel,
 *  and then the WhatsApp link built from that number does not (MEH-2475 —
 *  the page used to offer WhatsApp whatever the organizer chose). */
function contactChannels(organizer, waMessage) {
  const primary = getPrimaryMethod(organizer);
  const shown = CHANNEL_KEYS.filter((key) =>
    key === "phone" ? primary === "phone" : key === "whatsapp" ? primary !== "phone" : true,
  )
    .map((key) => ({ key, href: contactHref(key, organizer, waMessage), primary: key === primary }))
    .filter((c) => c.href);
  return [...shown.filter((c) => c.primary), ...shown.filter((c) => !c.primary)];
}

const LINK_BASE =
  "inline-flex items-center min-h-touch px-4 rounded-full border text-sm transition focus-ring";

// MEH-2988: the preferred channel is drawn like the business page's primary
// button (icon + `contact_cta.<method>` label); the others stay quiet pills.
function ContactLinks({ organizer, t, tCta }) {
  // The WhatsApp prefill is the business page's `contact_cta.wa_greeting`
  // (MEH-2753) — it was a hard-coded Hebrew copy of it here, on /en too.
  const links = contactChannels(organizer, tCta("wa_greeting", { name: organizer.name || "" }));
  if (links.length === 0) return null;
  return (
    <ul className="flex flex-wrap items-center gap-2" data-testid="organizer-contact">
      {links.map((l) => (
        <li key={l.key}>
          {l.primary ? (
            <OrganizerPrimaryContact channel={l} label={tCta(l.key)} producerId={organizer.id} />
          ) : (
            <OrganizerContactLink
              channel={l}
              label={t(l.key)}
              producerId={organizer.id}
              className={`${LINK_BASE} border-border text-primary hover:bg-primary/5`}
            />
          )}
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
  const tCta = await getTranslations({ locale, namespace: "contact_cta" });
  const events = organizer.upcoming_events || [];
  const image = organizer.images?.[0];
  const initial = Array.from((organizer.name || "").trim())[0] ?? "";
  // MEH-3018: the canonical URL, built on the server, so the share button
  // carries the same value in the HTML and after hydration.
  const pageUrl = buildAlternates(`/organizers/${slug}`, locale).canonical;

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
              alt="" // decorative: the h1 below names the organizer (review #3812)
              data-testid="organizer-cover"
              className="w-full h-[170px] md:h-[320px] object-cover md:rounded-xl bg-border"
            />
          ) : (
            <div
              aria-hidden="true"
              data-testid="organizer-cover-band"
              className="w-full h-[96px] md:h-[140px] md:rounded-xl bg-green-50"
            />
          )}
          {/* MEH-3018: share, where the recipe and business pages put it — the
              white circle in the cover's inline-END corner (top-left in RTL,
              MEH-2671), on the green band too, so it never depends on a photo. */}
          <div className="absolute top-3 end-3 md:top-9 md:end-7 z-10">
            <ShareButton
              variant="overlay"
              subject="organizer"
              url={pageUrl}
              title={organizer.name}
              description={organizer.short_description || organizer.description}
              city={organizer.city}
            />
          </div>
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
          {/* MEH-3005: «→ חזרה» to the page the visitor came from, where the
              event and workshop pages put it — under the cover, above the
              name. Renders nothing on a direct arrival, so no reserved row. */}
          <HistoryBackLink className="-mb-2" />
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
          <ContactLinks organizer={organizer} t={t} tCta={tCta} />
        </div>
      </header>

      <div className="px-4 md:px-14 space-y-8">
        <section aria-labelledby="organizer-events-heading" className="space-y-3">
          <SectionHeading id="organizer-events-heading" size="content">
            {t("events_heading")}
          </SectionHeading>
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
