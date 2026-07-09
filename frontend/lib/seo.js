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
import { BRAND_NAME } from "./constants";
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
 * Build the meta description. Prefer producer.description (truncated to
 * 160 chars — Google's rough display limit) over a generated fallback.
 */
export function buildDescription(producer) {
  if (!producer) return "";
  if (producer.description) {
    return producer.description.length > 160
      ? producer.description.slice(0, 157) + "..."
      : producer.description;
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

// MEH-452: day-axis mapping for openingHoursSpecification. DAY_ABBR matches
// the backend opening_hours string format ("Sun-Thu 09:00-18:00"); DAY_FULL
// holds the schema.org canonical dayOfWeek values. Logic is copied (not
// imported) from components/OpeningHours.jsx::parseHours — that file is a
// client component with React/next-intl deps and a different output shape
// (status map for the UI), so this stays a separate pure helper.
const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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
  if (!raw || typeof raw !== "string") return null;
  const map = {}; // dayIndex → { open, close }
  const entries = raw.split(",").map((s) => s.trim()).filter(Boolean);

  for (const entry of entries) {
    const match = entry.match(/^([A-Za-z]+)(?:-([A-Za-z]+))?\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/);
    if (!match) continue;
    const [, startDay, endDay, open, close] = match;
    const startIdx = DAY_ABBR.findIndex((d) => d.toLowerCase() === startDay.toLowerCase());
    if (startIdx === -1) continue;
    const endIdx = endDay
      ? DAY_ABBR.findIndex((d) => d.toLowerCase() === endDay.toLowerCase())
      : startIdx;
    if (endIdx === -1) continue;
    const indices = endIdx >= startIdx
      ? Array.from({ length: endIdx - startIdx + 1 }, (_, i) => startIdx + i)
      : [startIdx];
    for (const i of indices) map[i] = { open, close };
  }

  const spec = [];
  for (let i = 0; i < 7; i++) {
    if (map[i]) {
      spec.push({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: DAY_FULL[i],
        opens: map[i].open,
        closes: map[i].close,
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

  if (!isDeliveryOnly && producer.lat && producer.lng) {
    business.geo = {
      "@type": "GeoCoordinates",
      latitude: producer.lat,
      longitude: producer.lng,
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
  const openingHoursSpec = parseOpeningHoursSpec(producer.opening_hours);
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

  const organization = {
    "@type": "Organization",
    "@id": `${SITE_URL}#organization`,
    name: BRAND_NAME,
    url: SITE_URL,
    logo: {
      "@type": "ImageObject",
      url: `${SITE_URL}/logo.png`,
    },
  };

  return {
    "@context": "https://schema.org",
    "@graph": [webPage, breadcrumbList, business, webSite, organization],
  };
}

/**
 * MEH-804: homepage site-level JSON-LD. Emits the Organization + WebSite
 * graph (the homepage previously carried no structured data at all) plus a
 * WebSite SearchAction so Google can surface the sitelinks search box keyed
 * to the site root. Shares the `#organization` / `#website` @ids with
 * buildJsonLd() (seo.js:297-315) so the cross-page entity graph stays
 * consistent. Standalone — the homepage has no producer FoodEstablishment to
 * describe. SearchAction target uses /search?q= (the real param, SearchClient.jsx:50).
 */
export function buildHomeJsonLd(locale = "he") {
  const organization = {
    "@type": "Organization",
    "@id": `${SITE_URL}#organization`,
    name: BRAND_NAME,
    url: SITE_URL,
    logo: {
      "@type": "ImageObject",
      url: `${SITE_URL}/logo.png`,
    },
  };

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
        urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
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
      // HOT-017 (MEH-782): omit `images` when there's no image rather than
      // emitting an empty array — Next.js drops the undefined key, so no empty
      // `og:image` is rendered (omit, never null/empty — MEH-741 precedent).
      images: img ? [{ url: img, width: 1200, height: 630 }] : undefined,
      type: "website",
      locale: "he_IL",
      siteName: BRAND_NAME,
    },
    // MEH-1062 (SEO-05): entity-specific Twitter/X card. Reuses the same
    // OG-transformed image + producer name so the card shows the producer,
    // not the layout's generic site image. `undefined` images key is dropped
    // by Next.js (omit, never empty — HOT-017/MEH-741 precedent).
    twitter: {
      card: "summary_large_image",
      title: producer.name,
      description,
      images: img ? [img] : undefined,
    },
  };
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

  const ev = {
    "@type": "Event",
    "@id": `${eventUrl}#event`,
    name: event.title,
    url: eventUrl,
    eventStatus: "https://schema.org/EventScheduled",
  };
  if (startDate) ev.startDate = startDate;
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
    if (event.producer_id) {
      ev.organizer.url = `${SITE_URL}/producer/${event.producer_id}`;
    }
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
  if (event.producer_name && event.producer_id) {
    crumbs.push({
      name: event.producer_name,
      item: `${SITE_URL}/producer/${event.producer_id}`,
    });
  }
  crumbs.push({ name: event.title, item: eventUrl });

  return {
    "@context": "https://schema.org",
    "@graph": [ev, buildBreadcrumbList(crumbs, `${eventUrl}#breadcrumb`)],
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
