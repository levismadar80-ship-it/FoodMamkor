/**
 * Shared SEO helpers for producer pages (both /producer/[id] and /[slug]).
 *
 * Why this file exists:
 *   Before MEH-9, both routes duplicated generateMetadata + JSON-LD logic.
 *   Any SEO tweak that only updated one route silently drifted — exactly
 *   the pattern CLAUDE.md's Known Bug Patterns calls out ("fix one place,
 *   forget the sibling"). Consolidating here means one source of truth.
 *
 * All helpers are pure — no React, no side effects — so they can be unit
 * tested without a DOM.
 */

// MEH-454 Phase 3: SITE_URL helper centralized in lib/env.js (Zod-validated
// at build time). Re-exported here so existing consumers of @/lib/seo keep
// working unchanged.
import { SITE_URL } from "./env";
import {
  BRAND_FOUNDER_NAME,
  BRAND_NAME,
  BRAND_NAME_LATIN,
  BRAND_SAME_AS,
  CANONICAL_SENTENCE,
} from "./constants";
import { parseHours, resolveStoreHours } from "./hours";
import { primaryPoint } from "./producerPoints.js";
import { instagramUrl } from "./social-links";
// Review #3726: deadlines are naive UTC — parse as UTC, never as local time.
import { parseNaiveUtc } from "./dates";
export { SITE_URL };

// HOT-006 (MEH-778): JSON-LD must declare the page's actual locale instead of
// always claiming Hebrew. `inLanguage` uses hyphenated BCP-47 (schema.org
// convention) — mirrors lib/i18n-seo.js OG_LOCALE (underscore form) and
// format-date.js LOCALE_TAG. COUNTRY_LABEL localizes the one hardcoded
// breadcrumb constant ("ישראל"). Producer name/description and DB category
// names are user content with no message-key translation, so they stay as-is
// (locale-invariant), per the issue's "name/address unchanged" rule.
const IN_LANGUAGE = { he: "he-IL", en: "en-US" };
const COUNTRY_LABEL = { he: "ישראל", en: "Israel" };

/**
 * MEH-1069: single owner of JSON-LD serialization for every
 * `<script type="application/ld+json">` injection site (7 sites, all routed
 * through here — do NOT call raw JSON.stringify inside a script tag; that is
 * the `</script>` breakout the auto-review flagged on #1545, and a second
 * escaper would recreate the two-mechanism drift MEH-271 warns against).
 *
 * Escapes the three HTML-significant characters to their `\uXXXX` JSON string
 * escapes. `<` for `<` is the load-bearing one: it stops a `</script>`
 * inside any user-derived string (producer name, event title, review body)
 * from closing the tag early and injecting markup. `>` and `&` are escaped
 * too as defense-in-depth (breaks `]]>`, HTML entities). All three outputs
 * are valid JSON — a spec-compliant JSON parser decodes them back to `< > &`,
 * so the rendered schema.org data is byte-identical; only the wire bytes
 * change.
 *
 * NOTE: the source strings MUST be the 6-char sequences "\\u003c" etc. — a
 * bare "<" in JS source is the literal char `<` (a no-op). Verified by
 * the '</script>' breakout unit test.
 *
 * @param {unknown} obj the JSON-LD object (or @graph wrapper) to serialize
 * @returns {string} HTML-safe JSON string for dangerouslySetInnerHTML
 */
export function serializeJsonLd(obj) {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

/**
 * Build the <title> per the MEH-9 spec:
 *   [name] — [category] ב[city] | מהמקור
 *
 * With graceful fallbacks when category or city is missing.
 */
export function buildTitle(producer) {
  if (!producer?.name) return BRAND_NAME;

  const category = producer.categories?.[0]?.name || "";
  const city = producer.city || "";

  let prefix = producer.name;
  if (category && city) {
    prefix = `${producer.name} — ${category} ב${city}`;
  } else if (city) {
    prefix = `${producer.name} ב${city}`;
  } else if (category) {
    prefix = `${producer.name} — ${category}`;
  }
  return `${prefix} | מהמקור`;
}

/**
 * Build the meta description: «tagline — description» (either alone when the
 * other is empty), truncated to 160 chars — Google's rough display limit —
 * over a generated fallback.
 */
export function buildDescription(producer) {
  if (!producer) return "";
  // MEH-2474: the card tagline is the owner's own one-line summary — it leads
  // when present, joined to the description (audit MEH-2470 finding 11).
  const tagline = producer.short_description?.trim() || "";
  const text = [tagline, producer.description?.trim() || ""].filter(Boolean).join(" — ");
  if (text) {
    return text.length > 160 ? text.slice(0, 157) + "..." : text;
  }
  const category = producer.categories?.[0]?.name || "";
  const city = producer.city || "";
  let desc = `${producer.name} — בית עסק מקומי`;
  if (city) desc += ` מ${city}`;
  if (category) desc += `. ${category}`;
  return desc;
}

/**
 * Cloudinary OG image transform: 1200x630 crop, auto quality, < 300KB.
 * Passes through non-Cloudinary URLs untouched.
 */
export function ogImage(url) {
  if (!url || typeof url !== "string") return null;
  if (!url.includes("res.cloudinary.com")) return url;
  return url.replace("/upload/", "/upload/w_1200,h_630,c_fill,f_auto,q_auto/");
}

/**
 * Canonical page URL. Prefers slug (SEO-friendly) over numeric id.
 */
export function buildPageUrl(producer) {
  if (!producer) return SITE_URL;
  return producer.slug
    ? `${SITE_URL}/${producer.slug}`
    : `${SITE_URL}/producer/${producer.id}`;
}

// MEH-452: day-axis mapping for openingHoursSpecification. DAY_FULL holds the
// schema.org canonical dayOfWeek values.
//
// MEH-1870: the parsing itself is NO LONGER copied here. It used to be, with
// the stated reason that the parser lived in the client component
// OpeningHours.jsx — but MEH-826 had already extracted it to lib/hours.js,
// which is pure (no React, no next-intl), so the reason was stale and what
// remained was two owners of one grammar. Extending the grammar for split
// hours would have silently dropped every split day from the JSON-LD, because
// this copy's anchored regex rejects the second range and `continue`s past the
// whole entry. One owner now: lib/hours.js::parseHours.
const DAY_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * MEH-452 Gap 1: parse the producer.opening_hours string into a schema.org
 * openingHoursSpecification array. Input format:
 *   "Sun-Thu 09:00-18:00, Fri 09:00-14:00"
 * Returns one entry per day that has hours (in Sun→Sat order), or null when
 * the input is empty/unparseable — the caller omits the field entirely
 * rather than emitting an empty array.
 */
function parseOpeningHoursSpec(raw) {
  if (typeof raw !== "string") return null;
  const map = parseHours(raw); // dayIndex → [{ open, close }, …]
  if (!map) return null;

  const spec = [];
  for (let i = 0; i < 7; i++) {
    // MEH-1870: a day can carry several ranges. schema.org models that as
    // several OpeningHoursSpecification entries sharing one dayOfWeek — there
    // is no "two windows in one entry" form — so a lunch break emits two.
    for (const range of map[i] ?? []) {
      spec.push({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: DAY_FULL[i],
        opens: range.open,
        closes: range.close,
      });
    }
  }
  return spec.length > 0 ? spec : null;
}

/**
 * MEH-1062: shared BreadcrumbList builder — the single owner of the
 * schema.org/BreadcrumbList shape across producer (buildJsonLd), event
 * (buildEventJsonLd), and recipe (buildRecipeBreadcrumbJsonLd) pages.
 * Extracted verbatim from buildJsonLd's inline construction (MEH-172) so the
 * existing producer JSON-LD output stays byte-identical (same keys, same
 * order). One owner per MEH-271 — do NOT inline a second breadcrumb literal.
 *
 * @param {{name: string, item: string}[]} crumbs ordered trail, no gaps
 * @param {string} id the "@id" value (e.g. `${url}#breadcrumb`)
 */
function buildBreadcrumbList(crumbs, id) {
  return {
    "@type": "BreadcrumbList",
    "@id": id,
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: c.item,
    })),
  };
}

/**
 * Build schema.org JSON-LD for a producer detail page. Returns a single
 * object with a `@graph` array that Google's parser splits into five
 * entities — FoodEstablishment, BreadcrumbList, WebPage, WebSite, and
 * Organization — from one <script type="application/ld+json"> tag.
 *
 * MEH-9  — baseline LocalBusiness + aggregateRating + priceRange + images.
 * MEH-172 — switch to FoodEstablishment subtype (still a LocalBusiness,
 *           tells Google the page is about food), add BreadcrumbList
 *           (ישראל → קטגוריה → עיר → שם), and a minimal WebPage wrapper.
 * MEH-452 — AEO enhancements: openingHoursSpecification + servesCuisine on
 *           the FoodEstablishment, plus WebSite + Organization graph nodes
 *           (closes the dangling WebPage.isPartOf → #website reference).
 */
export function buildJsonLd(producer, locale = "he") {
  if (!producer) return null;

  const isDeliveryOnly = producer.has_physical_location === false && producer.offers_delivery;
  const pageUrl = buildPageUrl(producer);
  const title = buildTitle(producer);
  const category = producer.categories?.[0]?.name || "";
  const city = producer.city || "";

  // FoodEstablishment ----------------------------------------------------
  // schema.org/FoodEstablishment is a valid subtype of LocalBusiness, so
  // any consumer that only understood LocalBusiness before still works.
  // The upgrade is purely additive for Google rich results.
  const business = {
    "@type": "FoodEstablishment",
    "@id": `${pageUrl}#business`,
    name: producer.name,
    description: producer.description || "",
    url: pageUrl,
  };

  // MEH-213: delivery-only producers have no physical address — use
  // areaServed instead so Google still understands the service area.
  if (!isDeliveryOnly) {
    business.address = {
      "@type": "PostalAddress",
      addressLocality: city,
      addressCountry: "IL",
    };
  } else if (producer.delivery_nationwide) {
    business.areaServed = "Israel";
  } else {
    // MEH-904: derive areaServed from the delivery_areas relation (the only
    // path the public POST /producers writer populates — the flat
    // delivery_cities column is empty for any registration-created producer).
    // REUSES: frontend/components/MapProducerCard.jsx (MEH-902 reads pattern).
    const deliveryCities = [...new Set(
      (producer.delivery_areas || []).map((da) => da.city).filter(Boolean),
    )];
    if (deliveryCities.length > 0) business.areaServed = deliveryCities;
  }

  // MEH-1938 chunk 3: read through producerPoints() instead of Producer.lat/lng
  // directly. Chunk 5a: the SAME rule as the API's own lat/lng — the
  // `is_primary` row or nothing (primaryPoint(); ruling 02/09, STRICT). The
  // `?? geoPoints[0]` that used to sit here was a third answer to "where is
  // the business" — arbitrary DB row order, possibly a pickup — and is gone.
  const geoPoint = isDeliveryOnly ? null : primaryPoint(producer);
  if (geoPoint) {
    business.geo = {
      "@type": "GeoCoordinates",
      latitude: geoPoint.lat,
      longitude: geoPoint.lng,
    };
  }

  if (producer.phone) business.telephone = producer.phone;

  if (producer.website) {
    // HOT-017 (MEH-782): the old `startsWith("http")` check let a typo that
    // merely starts with "http" (e.g. "httpfoo.co.il") through verbatim,
    // emitting a non-absolute URL into JSON-LD `sameAs`. Require a real
    // `http(s)://` protocol; a bare domain gets an https:// prefix. Valid URLs
    // pass through byte-for-byte (no URL re-normalization / trailing slash).
    const raw = producer.website.trim();
    if (raw) {
      business.sameAs = [/^https?:\/\//i.test(raw) ? raw : `https://${raw}`];
    }
  }
  // MEH-2474: the owner's social profiles are part of the entity's identity
  // (schema.org sameAs). Instagram is stored as a handle; Facebook as a URL
  // and only an http(s) one is emitted.
  const social = [
    instagramUrl(producer.instagram),
    /^https?:\/\//i.test(producer.facebook?.trim() || "") ? producer.facebook.trim() : null,
  ].filter(Boolean);
  // Deduped: an owner may enter the same URL as website and Facebook.
  if (social.length) business.sameAs = [...new Set([...(business.sameAs || []), ...social])];
  if (/^\d{4}$/.test(String(producer.established_year ?? ""))) {
    business.foundingDate = String(producer.established_year);
  }

  if (producer.images?.length > 0) business.image = producer.images;
  if (producer.price_range) business.priceRange = producer.price_range;

  if (producer.avg_rating != null && producer.reviews_count > 0) {
    business.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Number(producer.avg_rating),
      reviewCount: producer.reviews_count,
    };
  }

  // MEH-452 Gap 1: openingHoursSpecification — omitted entirely when
  // opening_hours is null/empty/unparseable (no empty array emitted).
  //
  // MEH-2142: resolved, not read off the column. Store hours became a
  // per-location fact, and this is a PUBLIC reader of that fact — the same
  // one MEH-1884 called "the visibility currency" precisely because it feeds
  // this block. Left on `producer.opening_hours` it would emit no hours at all
  // for exactly the businesses whose hours now live on their primary location,
  // which is a silent SEO regression: no error, no failing test, and the
  // structured data simply loses a field.
  const openingHoursSpec = parseOpeningHoursSpec(resolveStoreHours(producer));
  if (openingHoursSpec) business.openingHoursSpecification = openingHoursSpec;

  // MEH-452 Gap 2: servesCuisine from the producer's categories. Omitted
  // when there are no categories (or none with a name).
  if (producer.categories?.length > 0) {
    const cuisines = producer.categories.map((c) => c.name).filter(Boolean);
    if (cuisines.length > 0) business.servesCuisine = cuisines;
  }

  // BreadcrumbList -------------------------------------------------------
  // Structure per MEH-172: ישראל → קטגוריה → עיר → שם העסק.
  // Category and city items are skipped when the source data is missing,
  // so the list stays valid (Google rejects breadcrumbs with gaps).
  const crumbs = [
    { name: COUNTRY_LABEL[locale] ?? COUNTRY_LABEL.he, item: SITE_URL },
  ];
  if (category) {
    crumbs.push({
      name: category,
      item: `${SITE_URL}/producers?category=${encodeURIComponent(category)}`,
    });
  }
  if (city) {
    crumbs.push({
      name: city,
      item: `${SITE_URL}/producers?city=${encodeURIComponent(city)}`,
    });
  }
  crumbs.push({ name: producer.name, item: pageUrl });

  const breadcrumbList = buildBreadcrumbList(crumbs, `${pageUrl}#breadcrumb`);

  // WebPage --------------------------------------------------------------
  const webPage = {
    "@type": "WebPage",
    "@id": `${pageUrl}#webpage`,
    url: pageUrl,
    name: title,
    inLanguage: IN_LANGUAGE[locale] ?? "he-IL",
    isPartOf: { "@id": `${SITE_URL}#website` },
    primaryImageOfPage: producer.images?.[0] || undefined,
    breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
    about: { "@id": `${pageUrl}#business` },
  };

  // WebSite + Organization ----------------------------------------------
  // MEH-452 Gap 3: these two site-level entities close the dangling
  // WebPage.isPartOf → `${SITE_URL}#website` reference (previously pointing
  // at an entity defined nowhere). WebSite.publisher resolves to the
  // Organization node. logo path confirmed present in /public.
  const webSite = {
    "@type": "WebSite",
    "@id": `${SITE_URL}#website`,
    url: SITE_URL,
    name: BRAND_NAME,
    inLanguage: IN_LANGUAGE[locale] ?? "he-IL",
    publisher: { "@id": `${SITE_URL}#organization` },
  };

  const organization = buildOrganizationNode();

  return {
    "@context": "https://schema.org",
    "@graph": [webPage, breadcrumbList, business, webSite, organization],
  };
}

/**
 * MEH-2192: the single Organization node, shared by producer pages
 * (buildJsonLd) and the homepage (buildHomeJsonLd).
 *
 * It was written out twice, identically, in those two builders — two owners
 * for one entity, and the exact shape that lets a field land on one surface
 * and not the other. Extracted so `description` and `sameAs` could be added
 * once rather than twice.
 *
 * `Organization`, deliberately NOT `LocalBusiness`: mehamakor is a directory
 * of businesses, not a business with a storefront. The LocalBusiness subtype
 * carries address/geo/openingHours semantics that would be false here — the
 * producers each have their own FoodEstablishment node (see buildJsonLd).
 *
 * `description` is CANONICAL_SENTENCE (lib/constants.js) — the same sentence
 * public/llms.txt carries, so every machine-identity surface says one thing.
 * MEH-2192 AC; it previously read SITE_DESCRIPTION (the per-page meta
 * description), which left two brand sentences broadcasting side by side.
 */
export function buildOrganizationNode() {
  return {
    "@type": "Organization",
    "@id": `${SITE_URL}#organization`,
    name: BRAND_NAME,
    // MEH-2192: the Latin form answer engines and Google's entity graph key
    // on; same constant the sitemap/share surfaces already use (MEH-476).
    alternateName: BRAND_NAME_LATIN,
    url: SITE_URL,
    description: CANONICAL_SENTENCE,
    logo: {
      "@type": "ImageObject",
      url: `${SITE_URL}/logo.png`,
    },
    sameAs: BRAND_SAME_AS,
    // MEH-2192: a named founder is the E-E-A-T signal the card asked for —
    // the value is the /about signature, never a second spelling.
    founder: { "@type": "Person", name: BRAND_FOUNDER_NAME },
  };
}

/**
 * MEH-804: homepage site-level JSON-LD. Emits the Organization + WebSite
 * graph (the homepage previously carried no structured data at all) plus a
 * WebSite SearchAction so Google can surface the sitelinks search box keyed
 * to the site root. Shares the `#organization` / `#website` @ids with
 * buildJsonLd() (seo.js:297-315) so the cross-page entity graph stays
 * consistent. Standalone — the homepage has no producer FoodEstablishment to
 * describe. SearchAction target uses /producers?q= — the one results page since
 * MEH-819 (ProducersClient.jsx reads `q`; /search 308s there).
 */
export function buildHomeJsonLd(locale = "he") {
  // MEH-2192: was a second, hand-written copy of the same node. Now the one
  // builder, so the two surfaces cannot describe the entity differently.
  const organization = buildOrganizationNode();

  const webSite = {
    "@type": "WebSite",
    "@id": `${SITE_URL}#website`,
    url: SITE_URL,
    name: BRAND_NAME,
    inLanguage: IN_LANGUAGE[locale] ?? "he-IL",
    publisher: { "@id": `${SITE_URL}#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/producers?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return {
    "@context": "https://schema.org",
    "@graph": [organization, webSite],
  };
}

/**
 * Build Next.js metadata object. Used by generateMetadata on both routes.
 */
export function buildProducerMetadata(producer) {
  if (!producer) return { title: "בית עסק לא נמצא | מהמקור" };

  const description = buildDescription(producer);
  const pageUrl = buildPageUrl(producer);
  const img = ogImage(producer.images?.[0]);

  return {
    title: buildTitle(producer),
    description,
    openGraph: {
      title: producer.name,
      description,
      url: pageUrl,
      // MEH-2590: no image → the branded site image, never an omitted key.
      // HOT-017 (MEH-782) omitted it expecting the layout's og:image to be
      // inherited; it is not — a page-level `openGraph` replaces the layout's,
      // so imageless business pages shared with no preview image at all.
      images: [{ url: img || "/og-image.png", width: 1200, height: 630 }],
      type: "website",
      locale: "he_IL",
      siteName: BRAND_NAME,
    },
    // MEH-1062 (SEO-05): entity-specific Twitter/X card. Reuses the same
    // OG-transformed image + producer name so the card shows the producer,
    // not the layout's generic site image. MEH-2590: site image when none.
    twitter: {
      card: "summary_large_image",
      title: producer.name,
      description,
      images: [img || "/og-image.png"],
    },
  };
}

/** MEH-2461: the page of whoever runs the event. A business → /producer/{id};
 *  an organizer → /organizers/{slug} (its /producer/{id} 404s since MEH-2459),
 *  or no URL at all when the organizer has no slug yet. */
function eventOwnerUrl(event) {
  if (event.owner_kind === "organizer") {
    return event.owner_slug ? `${SITE_URL}/organizers/${event.owner_slug}` : null;
  }
  return event.producer_id ? `${SITE_URL}/producer/${event.producer_id}` : null;
}

/**
 * MEH-1062: schema.org/Event JSON-LD for the /events/[id] detail page (which
 * previously carried no structured data — only metadata + OG). Emits a
 * `@graph` of [Event, BreadcrumbList] from one <script>, mirroring the
 * producer buildJsonLd pattern. Only fields present in the event payload are
 * emitted — omit, never invent (MEH-741 precedent). Event shape: backend
 * EventOut (backend/app/schemas/schemas.py:1742). All values are serialized
 * by the caller via JSON.stringify — no raw interpolation into HTML.
 */
export function buildEventJsonLd(event, locale = "he") {
  if (!event) return null;
  const eventUrl = `${SITE_URL}/events/${event.id}`;

  // startDate: event_date (required on EventOut) + optional event_time (HH:MM).
  let startDate = event.event_date || undefined;
  if (startDate && event.event_time) {
    startDate = `${startDate}T${String(event.event_time).slice(0, 5)}`;
  }

  // MEH-2469: endDate (Google "recommended") — same day, only with a start
  // time (the API rejects an end without a start).
  const endDate =
    event.event_date && event.event_time && event.end_time
      ? `${event.event_date}T${String(event.end_time).slice(0, 5)}`
      : undefined;

  const ev = {
    "@type": "Event",
    "@id": `${eventUrl}#event`,
    name: event.title,
    url: eventUrl,
    eventStatus: "https://schema.org/EventScheduled",
  };
  if (startDate) ev.startDate = startDate;
  if (endDate) ev.endDate = endDate;
  if (event.description) ev.description = event.description;
  if (event.image_url) ev.image = event.image_url;

  // location — a Place, only when we actually have a venue name or city.
  // Attendance mode is asserted OFFLINE only alongside a real location.
  if (event.location || event.city) {
    const place = { "@type": "Place", name: event.location || event.city };
    if (event.city) {
      place.address = {
        "@type": "PostalAddress",
        addressLocality: event.city,
        addressCountry: "IL",
      };
    }
    if (event.lat && event.lng) {
      place.geo = {
        "@type": "GeoCoordinates",
        latitude: event.lat,
        longitude: event.lng,
      };
    }
    ev.location = place;
    ev.eventAttendanceMode = "https://schema.org/OfflineEventAttendanceMode";
  }

  if (event.producer_name) {
    ev.organizer = { "@type": "Organization", name: event.producer_name };
    const ownerUrl = eventOwnerUrl(event);
    if (ownerUrl) ev.organizer.url = ownerUrl;
  }

  // offers — price is a required int on EventOut (0 = free); emit the real
  // value. registration_url when present, else the event page.
  if (event.price != null) {
    ev.offers = {
      "@type": "Offer",
      price: String(event.price),
      priceCurrency: "ILS",
      url: event.registration_url || eventUrl,
    };
  }

  // Breadcrumb: ישראל → בית העסק (when named) → האירוע.
  const crumbs = [
    { name: COUNTRY_LABEL[locale] ?? COUNTRY_LABEL.he, item: SITE_URL },
  ];
  const ownerCrumbUrl = eventOwnerUrl(event);
  if (event.producer_name && ownerCrumbUrl) {
    crumbs.push({ name: event.producer_name, item: ownerCrumbUrl });
  }
  crumbs.push({ name: event.title, item: eventUrl });

  return {
    "@context": "https://schema.org",
    "@graph": [ev, buildBreadcrumbList(crumbs, `${eventUrl}#breadcrumb`)],
  };
}

/** MEH-2478: a Decimal from the API ("45.00") as a schema.org price ("45"),
 *  or null when it is not a non-negative number. */
function toPrice(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? String(n) : null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

/**
 * MEH-2478: schema.org/Event JSON-LD for /experiences/[id]. Google's event
 * docs ask for one Event per page with name + startDate + location, so this
 * returns null — no Event markup at all — unless the experience has a
 * concrete date AND a city to place it in. A recurring experience is
 * described by the dated occurrence the page itself shows (event_date).
 * Shape: backend ExperienceDetailOut, as served to a stranger (address and,
 * for a home experience, lat/lng already removed by the API).
 */
export function buildExperienceJsonLd(experience, locale = "he") {
  if (!experience?.id || !experience.title) return null;
  const date =
    typeof experience.event_date === "string" && ISO_DATE.test(experience.event_date)
      ? experience.event_date.slice(0, 10)
      : null;
  const city = typeof experience.city === "string" ? experience.city.trim() : "";
  if (!date || !city) return null;

  const url = `${SITE_URL}/experiences/${experience.id}`;
  const time = /^\d{2}:\d{2}/.test(String(experience.event_time ?? ""))
    ? String(experience.event_time).slice(0, 5)
    : null;

  const place = {
    "@type": "Place",
    name: city,
    address: { "@type": "PostalAddress", addressLocality: city, addressCountry: "IL" },
  };
  if (typeof experience.lat === "number" && typeof experience.lng === "number") {
    place.geo = { "@type": "GeoCoordinates", latitude: experience.lat, longitude: experience.lng };
  }

  const ev = {
    "@type": "Event",
    "@id": `${url}#event`,
    name: experience.title,
    url,
    startDate: time ? `${date}T${time}` : date,
    // MEH-1419: a host-cancelled experience stays reachable by link.
    eventStatus:
      experience.is_active === false
        ? "https://schema.org/EventCancelled"
        : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: place,
  };
  if (experience.description) ev.description = experience.description;
  if (experience.image_url) ev.image = experience.image_url;
  if (experience.host?.name) ev.organizer = { "@type": "Person", name: experience.host.name };
  // price_per_person NULL means free (ExperienceCreate), so it is a real 0.
  ev.offers = {
    "@type": "Offer",
    price: toPrice(experience.price_per_person) ?? "0",
    priceCurrency: "ILS",
    url,
  };

  const crumbs = [
    { name: COUNTRY_LABEL[locale] ?? COUNTRY_LABEL.he, item: SITE_URL },
    { name: experience.title, item: url },
  ];
  return {
    "@context": "https://schema.org",
    "@graph": [ev, buildBreadcrumbList(crumbs, `${url}#breadcrumb`)],
  };
}

/**
 * MEH-2478: the ONE rule for "this group buy can still be joined" — open AND
 * before its deadline. Nothing closes an open group buy when its deadline
 * passes (group_buys.py, OWNER_TRANSITIONS note), so status alone is not
 * enough. Shared by the sitemap and the Offer availability below.
 */
export function isGroupBuyLive(groupBuy, now = new Date()) {
  if (groupBuy?.status !== "open" || !groupBuy.deadline) return false;
  const deadline = parseNaiveUtc(groupBuy.deadline);
  return deadline != null && deadline > now;
}

/** The Israel calendar date ("YYYY-MM-DD") of an instant. */
function israelDate(d) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(d);
}

/** Review #3726: commits at the cap — joining is refused, so it is not InStock. */
function isGroupBuyFull(groupBuy) {
  const max = Number(groupBuy?.max_participants);
  return Number.isFinite(max) && max > 0 && Number(groupBuy?.commits_count ?? 0) >= max;
}

/**
 * MEH-2478: schema.org Product + Offer for /group-buys/[id]. The offer is the
 * GROUP price (the price the page is about), in ILS, InStock only while the
 * group buy can be joined, valid until the deadline's date. GroupBuyOut has
 * no image field, so no `image` is emitted — omit, never invent.
 */
export function buildGroupBuyJsonLd(groupBuy, locale = "he", now = new Date()) {
  const name = groupBuy?.product_name || groupBuy?.title;
  const price = toPrice(groupBuy?.price_per_unit_group);
  if (!groupBuy?.id || !name || price == null) return null;

  const url = `${SITE_URL}/group-buys/${groupBuy.id}`;
  const producerUrl = groupBuy.producer_id
    ? `${SITE_URL}/producer/${groupBuy.producer_id}`
    : null;

  const offer = {
    "@type": "Offer",
    price,
    priceCurrency: "ILS",
    availability: !isGroupBuyLive(groupBuy, now)
      ? "https://schema.org/OutOfStock"
      : isGroupBuyFull(groupBuy)
        ? "https://schema.org/SoldOut"
        : "https://schema.org/InStock",
    url,
  };
  // Review #3726: the deadline's ISRAEL date — a naive-UTC 22:30 on 1 Nov is
  // 2 Nov here, and slicing the string would state the day before.
  const deadline = parseNaiveUtc(groupBuy.deadline);
  if (deadline) offer.priceValidUntil = israelDate(deadline);
  if (groupBuy.producer_name) {
    offer.seller = { "@type": "Organization", name: groupBuy.producer_name };
    if (producerUrl) offer.seller.url = producerUrl;
  }

  const product = { "@type": "Product", "@id": `${url}#product`, name, url, offers: offer };
  if (groupBuy.description) product.description = groupBuy.description;

  const crumbs = [{ name: COUNTRY_LABEL[locale] ?? COUNTRY_LABEL.he, item: SITE_URL }];
  if (groupBuy.producer_name && producerUrl) {
    crumbs.push({ name: groupBuy.producer_name, item: producerUrl });
  }
  crumbs.push({ name: groupBuy.title || name, item: url });
  return {
    "@context": "https://schema.org",
    "@graph": [product, buildBreadcrumbList(crumbs, `${url}#breadcrumb`)],
  };
}

/**
 * MEH-1935: JSON-LD for a diet landing page (/producers/diet/[dietSlug]).
 *
 * Emits a `@graph` of [ItemList, FAQPage, BreadcrumbList] from ONE
 * <script type="application/ld+json">, mirroring the producer/event pattern.
 * Callers must render it through serializeJsonLd() like every other site —
 * this returns a plain object and never touches HTML itself.
 *
 * BreadcrumbList goes through the shared buildBreadcrumbList() owner (MEH-1062)
 * rather than a fourth inline literal, per MEH-271's one-owner rule.
 *
 * The ItemList carries the businesses ACTUALLY rendered on the page (the SSR'd
 * first page of the filtered grid), not the full filtered total — a structured
 * -data list that claims items a crawler cannot see on the page is exactly the
 * mismatch Google's Rich Results tests flag.
 *
 * @param {object}   args
 * @param {string}   args.label     the diet label (H1) — from ATTRIBUTE_LABELS
 * @param {string}   args.pageUrl   absolute, locale-correct page URL
 * @param {string}   args.intro     the editorial intro paragraph
 * @param {{question: string, answer: string}[]} args.faq
 * @param {{name: string, url: string}[]} args.items rendered businesses
 * @param {string}   args.locale
 * @param {string}   args.producersUrl absolute URL of the /producers hub
 * @param {string}   args.producersLabel breadcrumb label for the hub
 */
export function buildDietPageJsonLd({
  label,
  pageUrl,
  intro,
  faq = [],
  items = [],
  locale = "he",
  producersUrl,
  producersLabel,
}) {
  if (!label || !pageUrl) return null;

  // next-intl's t.raw() returns the KEY PATH (a string) when a message is
  // missing, not undefined — so a locale that lost its `faq` array would reach
  // `.map` on a string and throw at render time. Coerce non-arrays to empty;
  // the copy-contract test is what keeps a locale from silently losing it.
  const questions = Array.isArray(faq) ? faq : [];
  const entries = Array.isArray(items) ? items : [];

  const itemList = {
    "@type": "ItemList",
    "@id": `${pageUrl}#itemlist`,
    name: label,
    description: intro || undefined,
    numberOfItems: entries.length,
    itemListElement: entries.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      url: it.url,
    })),
  };

  // Google requires every FAQPage to carry at least one question; emitting an
  // empty mainEntity is an invalid-structured-data error, so drop the entity
  // entirely rather than shipping a hollow one.
  const faqPage =
    questions.length > 0
      ? {
          "@type": "FAQPage",
          "@id": `${pageUrl}#faq`,
          inLanguage: IN_LANGUAGE[locale] ?? IN_LANGUAGE.he,
          mainEntity: questions.map((f) => ({
            "@type": "Question",
            name: f.question,
            acceptedAnswer: { "@type": "Answer", text: f.answer },
          })),
        }
      : null;

  const crumbs = [
    { name: COUNTRY_LABEL[locale] ?? COUNTRY_LABEL.he, item: SITE_URL },
  ];
  if (producersUrl && producersLabel) {
    crumbs.push({ name: producersLabel, item: producersUrl });
  }
  crumbs.push({ name: label, item: pageUrl });

  return {
    "@context": "https://schema.org",
    "@graph": [
      itemList,
      ...(faqPage ? [faqPage] : []),
      buildBreadcrumbList(crumbs, `${pageUrl}#breadcrumb`),
    ],
  };
}

/**
 * MEH-1062: standalone schema.org/BreadcrumbList for the recipe detail page
 * (/[slug]/recipes/[recipe_id]). RecipeJsonLd.jsx (MEH-591) still owns the
 * Recipe entity, untouched; this adds the missing breadcrumb trail as a
 * second <script> tag. Trail: ישראל → בית העסק → המתכון.
 *
 * @param producer producer object (name, slug/id) from the recipe page
 * @param recipe recipe object (title)
 * @param canonicalUrl the page's relative canonical (e.g. `/slug/recipes/id`)
 */
export function buildRecipeBreadcrumbJsonLd(
  producer,
  recipe,
  canonicalUrl,
  locale = "he",
) {
  if (!producer || !recipe) return null;
  const recipeUrl = `${SITE_URL}${canonicalUrl}`;
  const crumbs = [
    { name: COUNTRY_LABEL[locale] ?? COUNTRY_LABEL.he, item: SITE_URL },
    { name: producer.name, item: buildPageUrl(producer) },
    { name: recipe.title, item: recipeUrl },
  ];
  return {
    "@context": "https://schema.org",
    ...buildBreadcrumbList(crumbs, `${recipeUrl}#breadcrumb`),
  };
}
