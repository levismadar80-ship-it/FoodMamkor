/**
 * MEH-3638 — fixes from the audit against Google Search Central (21/11):
 *  - a page whose main content is user-written Hebrew is not presented to
 *    Google as having an English twin (no hreflang pair; /en is noindex);
 *  - a delivery-only business still carries the `address` Google requires
 *    on a LocalBusiness (city + country, never a street);
 *  - schema.org `telephone` is in E.164 (+972…), landlines included.
 */
import { describe, it, expect } from "vitest";
import { buildUntranslatedEntityMeta, UNTRANSLATED_ROBOTS } from "@/lib/i18n-seo";
import { buildJsonLd, SITE_URL } from "@/lib/seo";
import { toE164Phone } from "@/lib/utils";

const business = (json) => json["@graph"].find((e) => e["@type"] === "FoodEstablishment");

const deliveryOnly = {
  id: 7,
  slug: "shikui-herbals",
  name: "שיקוי",
  city: "תל אביב-יפו",
  phone: "050-853-0320",
  has_physical_location: false,
  offers_delivery: true,
  delivery_nationwide: true,
  categories: [],
};

describe("buildUntranslatedEntityMeta (MEH-3638)", () => {
  it("Hebrew page: self canonical, no languages map, no robots override", () => {
    const meta = buildUntranslatedEntityMeta("/shikui-herbals", "he");
    expect(meta.alternates).toEqual({ canonical: `${SITE_URL}/shikui-herbals` });
    expect(meta).not.toHaveProperty("robots");
  });

  it("/en page: self canonical, no languages map, noindex but follow", () => {
    const meta = buildUntranslatedEntityMeta("/shikui-herbals", "en");
    expect(meta.alternates).toEqual({ canonical: `${SITE_URL}/en/shikui-herbals` });
    expect(meta.alternates).not.toHaveProperty("languages");
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it("returns a copy — a caller cannot mutate the shared constant", () => {
    const meta = buildUntranslatedEntityMeta("/x", "en");
    meta.robots.index = true;
    expect(UNTRANSLATED_ROBOTS.index).toBe(false);
  });
});

describe("business JSON-LD address (MEH-3638)", () => {
  it("delivery-only with a city → address with city + IL, no street, no geo", () => {
    const biz = business(buildJsonLd(deliveryOnly, "he"));
    expect(biz.address).toEqual({
      "@type": "PostalAddress",
      addressLocality: "תל אביב-יפו",
      addressCountry: "IL",
    });
    expect(biz.address).not.toHaveProperty("streetAddress");
    expect(biz).not.toHaveProperty("geo");
    expect(biz.areaServed).toBe("Israel");
  });

  it("delivery-only with no city → no address invented", () => {
    const biz = business(buildJsonLd({ ...deliveryOnly, city: "" }, "he"));
    expect(biz).not.toHaveProperty("address");
  });
});

describe("telephone in E.164 (MEH-3638)", () => {
  it.each([
    ["0508530320", "+972508530320"],
    ["050-853-0320", "+972508530320"],
    ["03-5551234", "+97235551234"],
    ["077-1234567", "+972771234567"],
    ["+972 52 251 8862", "+972522518862"],
  ])("%s → %s", (input, expected) => {
    expect(toE164Phone(input)).toBe(expected);
  });

  it("a number that is not an Israeli phone is left as written", () => {
    expect(toE164Phone("1-800-FLOWERS")).toBe("1-800-FLOWERS");
    expect(toE164Phone("")).toBe("");
  });

  it("the business node carries the E.164 form", () => {
    expect(business(buildJsonLd(deliveryOnly, "he")).telephone).toBe("+972508530320");
  });
});
