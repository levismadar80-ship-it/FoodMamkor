import { describe, it, expect } from "vitest";
import {
  buildTitle,
  buildDescription,
  buildJsonLd,
  buildPageUrl,
  buildProducerMetadata,
  ogImage,
  serializeJsonLd,
  SITE_URL,
} from "@/lib/seo";

const fullProducer = {
  id: 42,
  slug: "havat-hashikma",
  name: "חוות השקמה",
  city: "רחובות",
  description: "גבינות עיזים ארטיזן, מיוצרות בחווה משפחתית",
  phone: "0501234567",
  website: "havat-hashikma.co.il",
  lat: 31.8928,
  lng: 34.8113,
  // MEH-1938 chunk 5a: geo reads the primary row; the columns are inert.
  locations: [{ kind: "branch", is_primary: true, lat: 31.8928, lng: 34.8113, precision: "exact", id: "loc-0" }],
  images: [
    "https://res.cloudinary.com/demo/image/upload/v1/photo1.jpg",
    "https://res.cloudinary.com/demo/image/upload/v1/photo2.jpg",
  ],
  avg_rating: 4.7,
  reviews_count: 14,
  price_range: "₪40-80",
  categories: [
    { id: 1, name: "חלב וגבינות" },
    { id: 2, name: "מאפים" },
  ],
  // MEH-452: weekly opening hours (backend format, MEH-102).
  opening_hours: "Sun-Thu 09:00-18:00, Fri 09:00-14:00",
};

// MEH-172 — helpers for the new @graph structure.
const getBusiness = (json) =>
  json["@graph"].find((e) => e["@type"] === "FoodEstablishment");
const getBreadcrumb = (json) =>
  json["@graph"].find((e) => e["@type"] === "BreadcrumbList");
const getWebPage = (json) =>
  json["@graph"].find((e) => e["@type"] === "WebPage");
// MEH-452 — helpers for the two new site-level entities.
const getWebSite = (json) =>
  json["@graph"].find((e) => e["@type"] === "WebSite");
const getOrganization = (json) =>
  json["@graph"].find((e) => e["@type"] === "Organization");

describe("buildTitle", () => {
  it("uses the MEH-9 spec format: [name] — [category] ב[city] | מהמקור", () => {
    expect(buildTitle(fullProducer)).toBe(
      "חוות השקמה — חלב וגבינות ברחובות | מהמקור",
    );
  });

  it("falls back to [name] ב[city] | מהמקור when no category", () => {
    expect(buildTitle({ ...fullProducer, categories: [] })).toBe(
      "חוות השקמה ברחובות | מהמקור",
    );
  });

  it("falls back to [name] — [category] | מהמקור when no city", () => {
    expect(buildTitle({ ...fullProducer, city: null })).toBe(
      "חוות השקמה — חלב וגבינות | מהמקור",
    );
  });

  it("falls back to [name] | מהמקור when neither", () => {
    expect(
      buildTitle({ ...fullProducer, city: null, categories: [] }),
    ).toBe("חוות השקמה | מהמקור");
  });

  it("returns default title when producer is null", () => {
    expect(buildTitle(null)).toBe("מהמקור");
  });
});

describe("buildDescription", () => {
  it("uses producer.description when present and under 160 chars", () => {
    expect(buildDescription(fullProducer)).toBe(
      "גבינות עיזים ארטיזן, מיוצרות בחווה משפחתית",
    );
  });

  it("truncates long descriptions at 157 chars with ellipsis", () => {
    const long = "א".repeat(200);
    const result = buildDescription({ ...fullProducer, description: long });
    expect(result.length).toBe(160);
    expect(result.endsWith("...")).toBe(true);
  });

  it("falls back to generated description when producer.description is missing", () => {
    const result = buildDescription({ ...fullProducer, description: null });
    expect(result).toContain("חוות השקמה");
    expect(result).toContain("רחובות");
    expect(result).toContain("חלב וגבינות");
  });

  it("returns empty string for null producer", () => {
    expect(buildDescription(null)).toBe("");
  });
});

describe("ogImage", () => {
  it("injects Cloudinary 1200x630 transform", () => {
    const url = "https://res.cloudinary.com/demo/image/upload/v1/photo.jpg";
    expect(ogImage(url)).toBe(
      "https://res.cloudinary.com/demo/image/upload/w_1200,h_630,c_fill,f_auto,q_auto/v1/photo.jpg",
    );
  });

  it("passes non-Cloudinary URLs through untouched", () => {
    const url = "https://example.com/photo.jpg";
    expect(ogImage(url)).toBe(url);
  });

  it("returns null for falsy input", () => {
    expect(ogImage(null)).toBe(null);
    expect(ogImage("")).toBe(null);
    expect(ogImage(undefined)).toBe(null);
  });
});

describe("buildPageUrl", () => {
  it("prefers slug when available", () => {
    expect(buildPageUrl(fullProducer)).toBe(`${SITE_URL}/havat-hashikma`);
  });

  it("falls back to numeric id when no slug", () => {
    expect(buildPageUrl({ ...fullProducer, slug: null })).toBe(
      `${SITE_URL}/producer/42`,
    );
  });
});

describe("buildJsonLd", () => {
  it("returns null for null producer", () => {
    expect(buildJsonLd(null)).toBe(null);
  });

  it("wraps the output in schema.org @graph (MEH-172 + MEH-452)", () => {
    const json = buildJsonLd(fullProducer);
    expect(json["@context"]).toBe("https://schema.org");
    expect(Array.isArray(json["@graph"])).toBe(true);
    // MEH-452 grows the graph from 3 → 5 (adds WebSite + Organization).
    expect(json["@graph"].length).toBe(5);
    expect(getWebPage(json)).toBeDefined();
    expect(getBreadcrumb(json)).toBeDefined();
    expect(getBusiness(json)).toBeDefined();
    expect(getWebSite(json)).toBeDefined();
    expect(getOrganization(json)).toBeDefined();
  });

  it("uses @type=FoodEstablishment with required fields", () => {
    const business = getBusiness(buildJsonLd(fullProducer));
    expect(business.name).toBe("חוות השקמה");
    expect(business.address.addressLocality).toBe("רחובות");
    expect(business.address.addressCountry).toBe("IL");
    expect(business.url).toBe(`${SITE_URL}/havat-hashikma`);
  });

  it("includes geo when lat+lng present", () => {
    const business = getBusiness(buildJsonLd(fullProducer));
    expect(business.geo).toEqual({
      "@type": "GeoCoordinates",
      latitude: 31.8928,
      longitude: 34.8113,
    });
  });

  it("omits geo when the primary row has no usable coordinates", () => {
    const business = getBusiness(
      buildJsonLd({
        ...fullProducer,
        locations: [{ id: "loc-0", kind: "branch", is_primary: true, lat: null, lng: 34.8113 }],
      }),
    );
    expect(business.geo).toBeUndefined();
  });

  // MEH-1938 chunk 5a — the inversion: columns set, no row → no geo. Against
  // the pre-5a producerPoints() this emits GeoCoordinates from the columns.
  it("omits geo for coordinates that live only on Producer.lat/lng (MEH-1938 chunk 5a)", () => {
    const business = getBusiness(buildJsonLd({ ...fullProducer, locations: [] }));
    expect(business.geo).toBeUndefined();
  });

  // MEH-1938 chunk 5a, STRICT ruling: geo is the is_primary row or nothing —
  // the same answer the API's lat/lng give. The `?? geoPoints[0]` this replaced
  // emitted a pickup's coordinates here, and a branch that nobody flagged.
  it("omits geo when rows exist but none is flagged primary", () => {
    const business = getBusiness(
      buildJsonLd({
        ...fullProducer,
        locations: [
          { id: "pickup", kind: "pickup", is_primary: false, lat: 32.1, lng: 34.9 },
          { id: "branch", kind: "branch", is_primary: false, lat: 31.8928, lng: 34.8113 },
        ],
      }),
    );
    expect(business.geo).toBeUndefined();
  });

  // MEH-1938 chunk 3 — the discriminating case: geo now reads through
  // producerPoints(), so a producer whose only coordinates live in a
  // producer_locations row (no Producer.lat/lng) still gets a geo entry.
  it("includes geo from a locations[] row when Producer.lat/lng are both null", () => {
    const business = getBusiness(
      buildJsonLd({
        ...fullProducer,
        lat: null,
        lng: null,
        locations: [{ id: "loc-1", kind: "branch", is_primary: true, lat: 31.8928, lng: 34.8113 }],
      }),
    );
    expect(business.geo).toEqual({
      "@type": "GeoCoordinates",
      latitude: 31.8928,
      longitude: 34.8113,
    });
  });

  // MEH-1938 chunk 3 — Producer.locations has no `order_by` (models.py:369),
  // so the API can return a producer's location rows in ANY order. geo must
  // prefer the PRIMARY row, not whichever one happens to be first.
  it("prefers the PRIMARY location row for geo when locations[] arrives non-primary-first", () => {
    const business = getBusiness(
      buildJsonLd({
        ...fullProducer,
        lat: null,
        lng: null,
        locations: [
          { id: "pickup", kind: "pickup", is_primary: false, lat: 32.1, lng: 34.9 },
          { id: "branch", kind: "branch", is_primary: true, lat: 31.8928, lng: 34.8113 },
        ],
      }),
    );
    expect(business.geo).toEqual({
      "@type": "GeoCoordinates",
      latitude: 31.8928,
      longitude: 34.8113,
    });
  });

  it("normalizes producer website into sameAs with https", () => {
    const business = getBusiness(buildJsonLd(fullProducer));
    expect(business.sameAs).toEqual(["https://havat-hashikma.co.il"]);
  });

  it("preserves website protocol when already present", () => {
    const business = getBusiness(
      buildJsonLd({ ...fullProducer, website: "http://example.com" }),
    );
    expect(business.sameAs).toEqual(["http://example.com"]);
  });

  it("includes FULL images array (not just the first)", () => {
    const business = getBusiness(buildJsonLd(fullProducer));
    expect(business.image).toEqual(fullProducer.images);
    expect(business.image.length).toBe(2);
  });

  it("omits image when images array is empty", () => {
    const business = getBusiness(buildJsonLd({ ...fullProducer, images: [] }));
    expect(business.image).toBeUndefined();
  });

  it("includes priceRange when set", () => {
    const business = getBusiness(buildJsonLd(fullProducer));
    expect(business.priceRange).toBe("₪40-80");
  });

  it("omits priceRange when not set", () => {
    const business = getBusiness(
      buildJsonLd({ ...fullProducer, price_range: null }),
    );
    expect(business.priceRange).toBeUndefined();
  });

  // MEH-3035: schema.org paymentAccepted is free Text; methods in the fixed
  // list order, English names (a language-neutral reader), note never leaks.
  it("includes paymentAccepted from payment_info methods", () => {
    const business = getBusiness(
      buildJsonLd({
        ...fullProducer,
        payment_info: { methods: ["cash", "bit"], timing: "advance", note: "מקדמה" },
      }),
    );
    expect(business.paymentAccepted).toBe("Bit, Cash");
  });

  it("omits paymentAccepted when no methods are set", () => {
    expect(getBusiness(buildJsonLd({ ...fullProducer, payment_info: null })).paymentAccepted).toBeUndefined();
    expect(
      getBusiness(buildJsonLd({ ...fullProducer, payment_info: { methods: [], timing: "advance", note: null } }))
        .paymentAccepted,
    ).toBeUndefined();
  });

  it("includes aggregateRating when avg_rating + reviews_count > 0", () => {
    const business = getBusiness(buildJsonLd(fullProducer));
    expect(business.aggregateRating).toEqual({
      "@type": "AggregateRating",
      ratingValue: 4.7,
      reviewCount: 14,
    });
  });

  it("omits aggregateRating when reviews_count is 0", () => {
    const business = getBusiness(
      buildJsonLd({ ...fullProducer, reviews_count: 0 }),
    );
    expect(business.aggregateRating).toBeUndefined();
  });

  it("omits aggregateRating when avg_rating is null", () => {
    const business = getBusiness(
      buildJsonLd({ ...fullProducer, avg_rating: null }),
    );
    expect(business.aggregateRating).toBeUndefined();
  });

  // MEH-172 — new assertions for the three-entity graph ----------------

  it("builds a BreadcrumbList ישראל → קטגוריה → עיר → שם העסק", () => {
    const crumb = getBreadcrumb(buildJsonLd(fullProducer));
    expect(crumb.itemListElement.length).toBe(4);
    expect(crumb.itemListElement[0].name).toBe("ישראל");
    expect(crumb.itemListElement[0].position).toBe(1);
    expect(crumb.itemListElement[1].name).toBe("חלב וגבינות");
    expect(crumb.itemListElement[1].item).toContain("/producers?category=");
    expect(crumb.itemListElement[2].name).toBe("רחובות");
    expect(crumb.itemListElement[2].item).toContain("/producers?city=");
    expect(crumb.itemListElement[3].name).toBe("חוות השקמה");
    expect(crumb.itemListElement[3].item).toBe(`${SITE_URL}/havat-hashikma`);
  });

  it("skips breadcrumb gaps when category or city is missing", () => {
    const crumb = getBreadcrumb(
      buildJsonLd({ ...fullProducer, city: null, categories: [] }),
    );
    // Just ישראל + name when neither category nor city exist.
    expect(crumb.itemListElement.length).toBe(2);
    expect(crumb.itemListElement[0].name).toBe("ישראל");
    expect(crumb.itemListElement[1].name).toBe("חוות השקמה");
  });

  it("emits a WebPage wrapper in Hebrew tied to the business + breadcrumb", () => {
    const webPage = getWebPage(buildJsonLd(fullProducer));
    expect(webPage.inLanguage).toBe("he-IL");
    expect(webPage.url).toBe(`${SITE_URL}/havat-hashikma`);
    expect(webPage.breadcrumb["@id"]).toBe(
      `${SITE_URL}/havat-hashikma#breadcrumb`,
    );
    expect(webPage.about["@id"]).toBe(`${SITE_URL}/havat-hashikma#business`);
  });

  it("emits Hebrew strings literally, not unicode-escaped", () => {
    const json = JSON.stringify(buildJsonLd(fullProducer));
    expect(json).toContain("חוות השקמה");
    expect(json).toContain("ישראל");
    expect(json).not.toContain("\\u05");
  });

  // MEH-452 — Gap 1: openingHoursSpecification ------------------------

  it("emits openingHoursSpecification parsed from opening_hours", () => {
    const business = getBusiness(buildJsonLd(fullProducer));
    // "Sun-Thu 09:00-18:00, Fri 09:00-14:00" → 6 days (Sun..Fri), Sat omitted.
    expect(business.openingHoursSpecification).toHaveLength(6);
    expect(business.openingHoursSpecification[0]).toEqual({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: "Sunday",
      opens: "09:00",
      closes: "18:00",
    });
    // Friday has the shorter hours and is the last entry.
    expect(business.openingHoursSpecification[5]).toEqual({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: "Friday",
      opens: "09:00",
      closes: "14:00",
    });
  });

  // MEH-1870: a split day emits TWO entries sharing one dayOfWeek — schema.org
  // has no "two windows in one entry" form. Before this, seo.js carried its own
  // COPY of the parser whose anchored regex rejected the second range and
  // skipped the whole entry, so a split day would have vanished from the
  // structured data entirely. There is one parser now (lib/hours.js).
  it("emits one spec entry per range on a split day", () => {
    const business = getBusiness(
      buildJsonLd({ ...fullProducer, opening_hours: "Fri 09:00-13:00 16:00-19:00" }),
    );
    expect(business.openingHoursSpecification).toEqual([
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: "Friday",
        opens: "09:00",
        closes: "13:00",
      },
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: "Friday",
        opens: "16:00",
        closes: "19:00",
      },
    ]);
  });

  it("omits openingHoursSpecification when opening_hours is null", () => {
    const business = getBusiness(
      buildJsonLd({ ...fullProducer, opening_hours: null }),
    );
    expect(business.openingHoursSpecification).toBeUndefined();
  });

  it("omits openingHoursSpecification when opening_hours is unparseable", () => {
    const business = getBusiness(
      buildJsonLd({ ...fullProducer, opening_hours: "whenever we feel like it" }),
    );
    expect(business.openingHoursSpecification).toBeUndefined();
  });

  // MEH-452 — Gap 2: servesCuisine ------------------------------------

  it("emits servesCuisine from producer categories", () => {
    const business = getBusiness(buildJsonLd(fullProducer));
    expect(business.servesCuisine).toEqual(["חלב וגבינות", "מאפים"]);
  });

  it("omits servesCuisine when categories is empty", () => {
    const business = getBusiness(
      buildJsonLd({ ...fullProducer, categories: [] }),
    );
    expect(business.servesCuisine).toBeUndefined();
  });

  // MEH-452 — Gap 3: WebSite + Organization graph nodes ---------------

  it("emits a WebSite entity whose @id matches WebPage.isPartOf", () => {
    const json = buildJsonLd(fullProducer);
    const webSite = getWebSite(json);
    const webPage = getWebPage(json);
    expect(webSite["@id"]).toBe(`${SITE_URL}#website`);
    expect(webSite.url).toBe(SITE_URL);
    expect(webSite.name).toBe("מהמקור");
    expect(webSite.inLanguage).toBe("he-IL");
    // The previously-dangling reference now resolves.
    expect(webPage.isPartOf["@id"]).toBe(webSite["@id"]);
    expect(webSite.publisher["@id"]).toBe(`${SITE_URL}#organization`);
  });

  it("emits an Organization entity referenced by WebSite.publisher", () => {
    const json = buildJsonLd(fullProducer);
    const organization = getOrganization(json);
    expect(organization["@id"]).toBe(`${SITE_URL}#organization`);
    expect(organization.name).toBe("מהמקור");
    expect(organization.url).toBe(SITE_URL);
    expect(organization.logo).toEqual({
      "@type": "ImageObject",
      url: `${SITE_URL}/logo.png`,
    });
  });
});

describe("buildProducerMetadata", () => {
  it("returns not-found title when producer is null", () => {
    expect(buildProducerMetadata(null)).toEqual({
      title: "בית עסק לא נמצא | מהמקור",
    });
  });

  it("wires title + description + openGraph correctly", () => {
    const meta = buildProducerMetadata(fullProducer);
    expect(meta.title).toBe("חוות השקמה — חלב וגבינות ברחובות | מהמקור");
    expect(meta.description).toBe("גבינות עיזים ארטיזן, מיוצרות בחווה משפחתית");
    expect(meta.openGraph.title).toBe("חוות השקמה");
    expect(meta.openGraph.locale).toBe("he_IL");
    expect(meta.openGraph.siteName).toBe("מהמקור");
    expect(meta.openGraph.url).toBe(`${SITE_URL}/havat-hashikma`);
    expect(meta.openGraph.images[0].width).toBe(1200);
    expect(meta.openGraph.images[0].height).toBe(630);
  });

  // MEH-2590: falls back to the branded site image. HOT-017 (MEH-782) omitted
  // the key expecting the layout's og:image to be inherited — it is not: a
  // page-level `openGraph` replaces the layout's whole object, so 17 imageless
  // business pages on staging shared with no image at all (measured 29/10).
  it("falls back to the site og-image when producer has no images", () => {
    const meta = buildProducerMetadata({ ...fullProducer, images: [] });
    expect(meta.openGraph.images).toEqual([
      { url: "/og-image.png", width: 1200, height: 630 },
    ]);
    expect(meta.twitter.images).toEqual(["/og-image.png"]);
  });
});

describe("buildJsonLd — sameAs guard (HOT-017)", () => {
  it("prefixes https:// for a bare domain", () => {
    const business = getBusiness(
      buildJsonLd({ ...fullProducer, website: "example.co.il" }),
    );
    expect(business.sameAs).toEqual(["https://example.co.il"]);
  });

  it("prefixes https:// for a typo that merely starts with 'http' (not a protocol)", () => {
    const business = getBusiness(
      buildJsonLd({ ...fullProducer, website: "httpfoo.co.il" }),
    );
    // old startsWith("http") emitted "httpfoo.co.il" verbatim — now normalized.
    expect(business.sameAs).toEqual(["https://httpfoo.co.il"]);
  });

  it("omits sameAs when website is whitespace-only", () => {
    const business = getBusiness(
      buildJsonLd({ ...fullProducer, website: "   " }),
    );
    expect(business.sameAs).toBeUndefined();
  });
});

describe("buildJsonLd — locale (HOT-006 / MEH-778)", () => {
  it("defaults to Hebrew when no locale is passed (no regression)", () => {
    const json = buildJsonLd(fullProducer);
    expect(getWebPage(json).inLanguage).toBe("he-IL");
    expect(getWebSite(json).inLanguage).toBe("he-IL");
    expect(getBreadcrumb(json).itemListElement[0].name).toBe("ישראל");
  });

  it("emits en-US inLanguage + 'Israel' breadcrumb under the en locale", () => {
    const json = buildJsonLd(fullProducer, "en");
    expect(getWebPage(json).inLanguage).toBe("en-US");
    expect(getWebSite(json).inLanguage).toBe("en-US");
    expect(getBreadcrumb(json).itemListElement[0].name).toBe("Israel");
  });

  it("keeps locale-invariant data unchanged across locales (name, URLs, address)", () => {
    const he = buildJsonLd(fullProducer, "he");
    const en = buildJsonLd(fullProducer, "en");
    expect(getBusiness(en).name).toBe(getBusiness(he).name);
    expect(getBusiness(en).url).toBe(getBusiness(he).url);
    expect(getWebPage(en).url).toBe(getWebPage(he).url);
    expect(getBusiness(en).address).toEqual(getBusiness(he).address);
  });

  it("falls back to Hebrew for an unknown locale", () => {
    const json = buildJsonLd(fullProducer, "fr");
    expect(getWebPage(json).inLanguage).toBe("he-IL");
    expect(getBreadcrumb(json).itemListElement[0].name).toBe("ישראל");
  });
});

// ---------------------------------------------------------------------------
// MEH-2789 — hasOfferCatalog
//
// DISCRIMINATION. Each case below fails against a plausible wrong build:
//   - emit the catalogue for a producer with no products  → "omits" goes red
//   - put `price_range` (free text) into minPrice          → "no numeric price"
//   - drop the signature hoist and use producer.products   → "page order"
//   - raise or remove the 30 cap                           → "caps at 30"
//   - add any field outside hasOfferCatalog                → "purely additive"
// Verified by running each mutation against this file before committing.
// ---------------------------------------------------------------------------
const PRODUCTS = [
  { id: "p-1", name: "גבינת עיזים", description: "מיושנת 60 יום", image_url: "https://res.cloudinary.com/demo/image/upload/v1/cheese.jpg", price_min: 38, price_max: 52 },
  { id: "p-2", name: "לאבנה", price_min: 24, price_max: null },
  // price_range is the LEGACY free-text label — it must never become a price.
  { id: "p-3", name: "יוגורט כבשים", price_range: "משתנה לפי עונה", price_min: null, price_max: null },
];
const withProducts = { ...fullProducer, products: PRODUCTS };
const getCatalog = (p) => getBusiness(buildJsonLd(p)).hasOfferCatalog;

describe("MEH-2789 — hasOfferCatalog", () => {
  it("omits the catalogue entirely when the page shows no products", () => {
    expect(getBusiness(buildJsonLd(fullProducer)).hasOfferCatalog).toBeUndefined();
    expect(getCatalog({ ...fullProducer, products: [] })).toBeUndefined();
    // a row with no usable name yields no Offer, so no catalogue either
    expect(getCatalog({ ...fullProducer, products: [{ id: "x", name: "   " }] })).toBeUndefined();
  });

  it("is an OfferCatalog of Offers wrapping Products", () => {
    const catalog = getCatalog(withProducts);
    expect(catalog["@type"]).toBe("OfferCatalog");
    expect(catalog.itemListElement).toHaveLength(3);
    for (const offer of catalog.itemListElement) {
      expect(offer["@type"]).toBe("Offer");
      expect(offer.itemOffered["@type"]).toBe("Product");
      expect(offer.itemOffered.name).toBeTruthy();
    }
  });

  it("names the catalogue per locale", () => {
    expect(getBusiness(buildJsonLd(withProducts, "he")).hasOfferCatalog.name).toBe("מוצרים");
    expect(getBusiness(buildJsonLd(withProducts, "en")).hasOfferCatalog.name).toBe("Products");
  });

  it("emits priceSpecification only for a numeric price, in ILS", () => {
    const [cheese, labneh, yogurt] = getCatalog(withProducts).itemListElement;
    expect(cheese.priceSpecification).toEqual({
      "@type": "PriceSpecification",
      minPrice: "38",
      maxPrice: "52",
      priceCurrency: "ILS",
    });
    // one price → maxPrice falls back to minPrice, not a half-open range
    expect(labneh.priceSpecification).toEqual({
      "@type": "PriceSpecification",
      minPrice: "24",
      maxPrice: "24",
      priceCurrency: "ILS",
    });
    // free-text price_range is NOT a price
    expect(yogurt.priceSpecification).toBeUndefined();
    expect(JSON.stringify(yogurt)).not.toContain("משתנה לפי עונה");
  });

  it("carries description and an absolute image only when present", () => {
    const [cheese, labneh] = getCatalog(withProducts).itemListElement;
    expect(cheese.itemOffered.description).toBe("מיושנת 60 יום");
    expect(cheese.itemOffered.image).toBe("https://res.cloudinary.com/demo/image/upload/v1/cheese.jpg");
    expect(labneh.itemOffered.description).toBeUndefined();
    expect(labneh.itemOffered.image).toBeUndefined();
  });

  it("makes a root-relative image absolute and drops an unresolvable one", () => {
    const [rel, bad] = getCatalog({
      ...fullProducer,
      products: [
        { id: "r", name: "לחם", image_url: "/img/bread.jpg" },
        { id: "b", name: "חלה", image_url: "httpfoo.co.il/x.jpg" },
      ],
    }).itemListElement;
    expect(rel.itemOffered.image).toBe(`${SITE_URL}/img/bread.jpg`);
    expect(bad.itemOffered.image).toBeUndefined();
  });

  it("uses the page's order: the signature product first, deduped", () => {
    // by id (the MEH-2137 chunk 3 path)
    const byId = getCatalog({ ...withProducts, top_product_id: "p-3" });
    expect(byId.itemListElement.map((o) => o.itemOffered.name)).toEqual([
      "יוגורט כבשים", "גבינת עיזים", "לאבנה",
    ]);
    // by name, only when no id is set
    const byName = getCatalog({ ...withProducts, top_product_name: "לאבנה" });
    expect(byName.itemListElement.map((o) => o.itemOffered.name)).toEqual([
      "לאבנה", "גבינת עיזים", "יוגורט כבשים",
    ]);
    // an id that names a deleted product must NOT fall through to the name —
    // that is the wrong-row bug ProducerSections.jsx:217-225 exists to prevent
    const deleted = getCatalog({ ...withProducts, top_product_id: "gone", top_product_name: "לאבנה" });
    expect(deleted.itemListElement.map((o) => o.itemOffered.name)).toEqual([
      "גבינת עיזים", "לאבנה", "יוגורט כבשים",
    ]);
  });

  it("caps the catalogue at 30 items", () => {
    const many = Array.from({ length: 45 }, (_, i) => ({ id: `m-${i}`, name: `מוצר ${i}` }));
    const catalog = getCatalog({ ...fullProducer, products: many });
    expect(catalog.itemListElement).toHaveLength(30);
    expect(catalog.itemListElement[0].itemOffered.name).toBe("מוצר 0");
    expect(catalog.itemListElement[29].itemOffered.name).toBe("מוצר 29");
  });

  it("is purely additive — every other field is byte-identical", () => {
    const before = buildJsonLd(fullProducer);
    const after = buildJsonLd(withProducts);
    const businessAfter = { ...getBusiness(after) };
    expect(businessAfter.hasOfferCatalog).toBeDefined();
    delete businessAfter.hasOfferCatalog;
    expect(businessAfter).toEqual(getBusiness(before));
    // and nothing new at the @graph level
    expect(after["@graph"].map((n) => n["@type"])).toEqual(
      before["@graph"].map((n) => n["@type"]),
    );
  });

  it("survives the shared escaper", () => {
    const json = buildJsonLd({
      ...fullProducer,
      products: [{ id: "x", name: "גבינה <script>alert(1)</script> & co" }],
    });
    const out = serializeJsonLd(json);
    expect(out).not.toContain("<script>");
    expect(out).toContain("\\u003cscript\\u003e");
    expect(out).toContain("\\u0026");
    expect(JSON.parse(out.replace(/\\u003c/g, "<").replace(/\\u003e/g, ">").replace(/\\u0026/g, "&"))).toBeTruthy();
  });
});
