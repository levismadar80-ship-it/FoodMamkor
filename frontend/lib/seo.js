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

export const SITE_URL = "https://mehamakor.online";

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
 * Build schema.org LocalBusiness JSON-LD. MEH-9 adds aggregateRating +
 * priceRange + the full image array (was previously just the first image)
 * so Google can surface review stars and price hints in rich results.
 */
export function buildJsonLd(producer) {
  if (!producer) return null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: producer.name,
    description: producer.description || "",
    address: {
      "@type": "PostalAddress",
      addressLocality: producer.city || "",
      addressCountry: "IL",
    },
  };

  if (producer.lat && producer.lng) {
    jsonLd.geo = {
      "@type": "GeoCoordinates",
      latitude: producer.lat,
      longitude: producer.lng,
    };
  }

  if (producer.phone) jsonLd.telephone = producer.phone;

  if (producer.website) {
    jsonLd.url = producer.website.startsWith("http")
      ? producer.website
      : `https://${producer.website}`;
  }

  if (producer.images?.length > 0) {
    jsonLd.image = producer.images;
  }

  if (producer.price_range) jsonLd.priceRange = producer.price_range;

  if (producer.avg_rating != null && producer.reviews_count > 0) {
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Number(producer.avg_rating),
      reviewCount: producer.reviews_count,
    };
  }

  return jsonLd;
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
