import { describe, it, expect } from "vitest";
import {
  buildTitle,
  buildDescription,
  buildJsonLd,
  buildPageUrl,
  buildProducerMetadata,
  ogImage,
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
  images: [
    "https://res.cloudinary.com/demo/image/upload/v1/photo1.jpg",
    "https://res.cloudinary.com/demo/image/upload/v1/photo2.jpg",
  ],
  avg_rating: 4.7,
  reviews_count: 14,
  price_range: "₪40-80",
  categories: [{ id: 1, name: "חלב וגבינות" }],
};

// MEH-172 — helpers for the new @graph structure.
const getBusiness = (json) =>
  json["@graph"].find((e) => e["@type"] === "FoodEstablishment");
const getBreadcrumb = (json) =>
  json["@graph"].find((e) => e["@type"] === "BreadcrumbList");
const getWebPage = (json) =>
  json["@graph"].find((e) => e["@type"] === "WebPage");

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

  it("wraps the output in schema.org @graph (MEH-172)", () => {
    const json = buildJsonLd(fullProducer);
    expect(json["@context"]).toBe("https://schema.org");
    expect(Array.isArray(json["@graph"])).toBe(true);
    expect(json["@graph"].length).toBe(3);
    expect(getWebPage(json)).toBeDefined();
    expect(getBreadcrumb(json)).toBeDefined();
    expect(getBusiness(json)).toBeDefined();
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

  it("omits geo when lat or lng is missing", () => {
    const business = getBusiness(buildJsonLd({ ...fullProducer, lat: null }));
    expect(business.geo).toBeUndefined();
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

  it("empties openGraph.images when producer has no images", () => {
    const meta = buildProducerMetadata({ ...fullProducer, images: [] });
    expect(meta.openGraph.images).toEqual([]);
  });
});
