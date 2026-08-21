/**
 * MEH-2142 — `locations[].opening_hours` and `.phone` survive the Zod parse.
 *
 * The sixth instance of the mechanism `lib/schemas.js` documents five times
 * over: an undeclared key is STRIPPED by `z.object`, silently, on every parsed
 * feed, while working fine on the unparsed ones.
 *
 * Two things depended on these two fields and neither had a test:
 *   * `resolveStoreHours` — the primary-location preference this ticket ships.
 *     It degraded to "always the legacy column" with every unit test green,
 *     because those call the resolver with UNPARSED objects.
 *   * `DeliveryBlock.jsx:242` / the click-to-call link — MEH-1509's pickup
 *     "where and when", dead on the detail page since it shipped.
 *
 * The `.loose()` case is the subtle one and has its own test below: `.loose()`
 * on the OUTER object permits unknown top-level keys and does NOT reach into
 * this nested array's object schema. That is why the detail page — which does
 * use `.loose()` — was still losing the fields.
 */
import { describe, it, expect } from "vitest";

import { ProducerSchema, ProducerDetailSchema } from "@/lib/schemas";
import { resolveStoreHours } from "@/lib/hours";
import { buildJsonLd } from "@/lib/seo";

const HOURS = "Sun-Thu 08:00-16:00";
const PHONE = "0521234567";

const payload = () => ({
  id: 42,
  name: "מאפיית שדה",
  city: "חיפה",
  locations: [
    {
      kind: "branch",
      label: null,
      city: "חיפה",
      lat: 32.794,
      lng: 34.9896,
      is_primary: true,
      precision: "exact",
      opening_hours: HOURS,
      phone: PHONE,
    },
  ],
});

describe("locations[] keeps opening_hours + phone through the parse", () => {
  it("ProducerSchema preserves both", () => {
    const parsed = ProducerSchema.parse(payload());
    expect(parsed.locations[0].opening_hours).toBe(HOURS);
    expect(parsed.locations[0].phone).toBe(PHONE);
  });

  it("ProducerDetailSchema preserves both", () => {
    const parsed = ProducerDetailSchema.parse(payload());
    expect(parsed.locations[0].opening_hours).toBe(HOURS);
    expect(parsed.locations[0].phone).toBe(PHONE);
  });

  it("`.loose()` does NOT rescue a nested key — the detail page's actual shape", () => {
    // useProducerData.js:26 parses with `ProducerDetailSchema.loose()`. If
    // `.loose()` propagated into the nested object, the declaration above would
    // be unnecessary and this whole class of bug could not exist. It does not,
    // which is exactly why five previous fields had to be declared one by one.
    const parsed = ProducerDetailSchema.loose().parse(payload());
    expect(parsed.locations[0].opening_hours).toBe(HOURS);

    // Control on the SAME mechanism: a key nobody declared is still stripped,
    // so this test cannot pass by the parse having become permissive overall.
    const withUnknown = payload();
    withUnknown.locations[0].not_a_declared_key = "x";
    const parsed2 = ProducerDetailSchema.loose().parse(withUnknown);
    expect(parsed2.locations[0].not_a_declared_key).toBeUndefined();
    // …while an unknown key at the TOP level does survive `.loose()`. The two
    // together are what "loose does not reach inside" means.
    const topLevel = { ...payload(), some_future_field: "y" };
    expect(ProducerDetailSchema.loose().parse(topLevel).some_future_field).toBe("y");
  });

  it("the JSON-LD emits the LOCATION's hours, not the legacy column", () => {
    // seo.js:307 is a PUBLIC reader of the same fact — MEH-1884 called
    // opening_hours "the visibility currency" precisely because it feeds this
    // block. Left on the column it would emit no hours at all for a business
    // whose hours live on her primary location: no error, no failing test,
    // structured data quietly one field short.
    const graph = buildJsonLd({
      ...payload(),
      slug: "maafiat-sade",
      opening_hours: "Sun-Thu 09:00-18:00",
    });
    const business = graph["@graph"].find((n) => n["@type"] === "FoodEstablishment");
    expect(business, "no FoodEstablishment node in the graph").toBeTruthy();
    const spec = business.openingHoursSpecification;
    expect(spec, "no openingHoursSpecification emitted at all").toBeTruthy();
    // 16:00 is the LOCATION's close; 18:00 only ever comes from the column.
    const closes = spec.map((s2) => s2.closes);
    expect(closes).toContain("16:00");
    expect(closes).not.toContain("18:00");
  });

  it("end-to-end: the resolver reads the hours off a PARSED producer", () => {
    // The assertion that would have caught this before the screenshots did.
    // `resolve-store-hours.test.js` feeds raw objects; this one feeds a
    // producer that has been through the same parse the page applies.
    const parsed = ProducerDetailSchema.loose().parse({
      ...payload(),
      opening_hours: "Sun-Thu 09:00-18:00",
    });
    expect(resolveStoreHours(parsed)).toBe(HOURS);
  });
});
