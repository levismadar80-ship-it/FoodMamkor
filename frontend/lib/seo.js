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
export { SITE_URL };

/**
 * Build the <title> per the MEH-9 spec:
 *   [name] — [category] ב[city] | מהמקור
 *
 * With graceful fallbacks when category or city is missing.
 */
export function buildTitle(producer) {
  if (!producer?.name) return "מהמקור";

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

/**
 * Build schema.org JSON-LD for a producer detail page. Returns a single
 * object with a `@graph` array that Google's parser splits into three
 * entities — FoodEstablishment, BreadcrumbList, and WebPage — from one
 * <script type="application/ld+json"> tag.
 *
 * MEH-9  — baseline LocalBusiness + aggregateRating + priceRange + images.
 * MEH-172 — switch to FoodEstablishment subtype (still a LocalBusiness,
 *           tells Google the page is about food), add BreadcrumbList
 *           (ישראל → קטגוריה → עיר → שם), and a minimal WebPage wrapper.
 */
export function buildJsonLd(producer) {
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
  } else if (producer.delivery_cities?.length > 0) {
    business.areaServed = producer.delivery_cities;
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
    business.sameAs = [
      producer.website.startsWith("http")
        ? producer.website
        : `https://${producer.website}`,
    ];
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

  // BreadcrumbList -------------------------------------------------------
  // Structure per MEH-172: ישראל → קטגוריה → עיר → שם העסק.
  // Category and city items are skipped when the source data is missing,
  // so the list stays valid (Google rejects breadcrumbs with gaps).
  const crumbs = [
    { name: "ישראל", item: SITE_URL },
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

  const breadcrumbList = {
    "@type": "BreadcrumbList",
    "@id": `${pageUrl}#breadcrumb`,
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: c.item,
    })),
  };

  // WebPage --------------------------------------------------------------
  const webPage = {
    "@type": "WebPage",
    "@id": `${pageUrl}#webpage`,
    url: pageUrl,
    name: title,
    inLanguage: "he-IL",
    isPartOf: { "@id": `${SITE_URL}#website` },
    primaryImageOfPage: producer.images?.[0] || undefined,
    breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
    about: { "@id": `${pageUrl}#business` },
  };

  return {
    "@context": "https://schema.org",
    "@graph": [webPage, breadcrumbList, business],
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
      images: img ? [{ url: img, width: 1200, height: 630 }] : [],
      type: "website",
      locale: "he_IL",
      siteName: "מהמקור",
    },
  };
}
