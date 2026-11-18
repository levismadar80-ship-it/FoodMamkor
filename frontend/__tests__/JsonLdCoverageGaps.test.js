// @ts-check
/**
 * MEH-3348 — structured-data gaps closed without touching the interface.
 *
 *  - a located business that also delivers states areaServed (and keeps its
 *    address); one that does not deliver states none;
 *  - an event / workshop states capacity and availability from the two
 *    numbers the API returns, and nothing when there is no cap;
 *  - a workshop with no date keeps its BreadcrumbList (it used to carry no
 *    markup at all), and still no Event;
 *  - the organizer page has an Organization + BreadcrumbList.
 *
 * Every node is also run through a small validity check: absolute https
 * URLs, ISO dates with an offset, and Google's required Event fields.
 */
import { describe, it, expect } from "vitest";
import {
  buildJsonLd,
  buildEventJsonLd,
  buildExperienceJsonLd,
  buildOrganizerJsonLd,
  serializeJsonLd,
} from "@/lib/seo";

const node = (ld, type) => ld["@graph"].find((n) => n["@type"] === type);

const BUSINESS = {
  id: "11111111-1111-1111-1111-111111111111",
  slug: "bakery",
  name: "מאפיית הכפר",
  city: "זכרון יעקב",
  has_physical_location: true,
  categories: [{ id: 1, name: "מאפים" }],
};

const EVENT = {
  id: "22222222-2222-2222-2222-222222222222",
  title: "שוק איכרים",
  event_date: "2026-12-04",
  event_time: "09:00:00",
  city: "בנימינה",
  price: 0,
  is_active: true,
  producer_id: BUSINESS.id,
  producer_name: BUSINESS.name,
};

const EXPERIENCE = {
  id: "33333333-3333-3333-3333-333333333333",
  title: "סדנת מחמצת",
  event_date: "2026-12-10",
  event_time: "18:00:00",
  duration_minutes: 150,
  city: "פרדס חנה",
  price_per_person: "180.00",
  is_active: true,
  host: { id: "h1", name: "דנה", producer_slug: "bakery" },
};

const ORGANIZER = {
  id: "44444444-4444-4444-4444-444444444444",
  slug: "shuk-hacarmel",
  name: "שוק הכרמל",
  description: "שוק שבועי",
  city: "חיפה",
  images: ["https://res.cloudinary.com/x/image/upload/a.jpg"],
  instagram: "shuk",
  website: "shuk.example",
  established_year: 2019,
  upcoming_events: [EVENT],
};

/** Collects every string value keyed url / item / @id / image / sameAs. */
function urls(value, key = "", out = []) {
  if (Array.isArray(value)) value.forEach((v) => urls(v, key, out));
  else if (value && typeof value === "object") {
    Object.entries(value).forEach(([k, v]) => urls(v, k, out));
  } else if (typeof value === "string" && ["url", "item", "@id", "image", "sameAs"].includes(key)) {
    out.push(value);
  }
  return out;
}

describe("business areaServed (MEH-3348)", () => {
  it("located + delivers to cities → areaServed lists them, address stays", () => {
    const ld = buildJsonLd({
      ...BUSINESS,
      offers_delivery: true,
      delivery_areas: [{ city: "חיפה" }, { city: "חיפה" }, { city: "עתלית" }],
    });
    const biz = node(ld, "FoodEstablishment");
    expect(biz.areaServed).toEqual(["חיפה", "עתלית"]);
    expect(biz.address.addressLocality).toBe("זכרון יעקב");
  });

  it("located + delivers nationwide → Israel", () => {
    const ld = buildJsonLd({ ...BUSINESS, offers_delivery: true, delivery_nationwide: true });
    expect(node(ld, "FoodEstablishment").areaServed).toBe("Israel");
  });

  it("located, no delivery → no areaServed, even with stale area rows", () => {
    const ld = buildJsonLd({ ...BUSINESS, offers_delivery: false, delivery_areas: [{ city: "חיפה" }] });
    expect(node(ld, "FoodEstablishment")).not.toHaveProperty("areaServed");
  });

  it("located + delivers but no rows → nothing invented", () => {
    const ld = buildJsonLd({ ...BUSINESS, offers_delivery: true, delivery_areas: [] });
    expect(node(ld, "FoodEstablishment")).not.toHaveProperty("areaServed");
  });
});

describe("event capacity (MEH-3348)", () => {
  it("spots left → InStock + both capacity numbers", () => {
    const ev = node(buildEventJsonLd({ ...EVENT, max_participants: 40, spots_left: 7 }), "Event");
    expect(ev.maximumAttendeeCapacity).toBe(40);
    expect(ev.remainingAttendeeCapacity).toBe(7);
    expect(ev.offers.availability).toBe("https://schema.org/InStock");
  });

  it("0 spots left → SoldOut", () => {
    const ev = node(buildEventJsonLd({ ...EVENT, max_participants: 40, spots_left: 0 }), "Event");
    expect(ev.remainingAttendeeCapacity).toBe(0);
    expect(ev.offers.availability).toBe("https://schema.org/SoldOut");
  });

  it("no cap → no capacity or availability claim", () => {
    const ev = node(buildEventJsonLd({ ...EVENT, max_participants: null, spots_left: null }), "Event");
    expect(ev).not.toHaveProperty("maximumAttendeeCapacity");
    expect(ev).not.toHaveProperty("remainingAttendeeCapacity");
    expect(ev.offers).not.toHaveProperty("availability");
  });

  it("cancelled event → no availability claim", () => {
    const ev = node(
      buildEventJsonLd({ ...EVENT, is_active: false, max_participants: 40, spots_left: 7 }),
      "Event",
    );
    expect(ev.eventStatus).toBe("https://schema.org/EventCancelled");
    expect(ev.offers).not.toHaveProperty("availability");
  });
});

describe("workshop (MEH-3348)", () => {
  it("endDate = start + duration, with the Israel offset; host links to her page", () => {
    const ev = node(buildExperienceJsonLd(EXPERIENCE), "Event");
    expect(ev.startDate).toBe("2026-12-10T18:00+02:00");
    expect(ev.endDate).toBe("2026-12-10T20:30+02:00");
    expect(ev.organizer.url).toMatch(/\/bakery$/);
  });

  it("a workshop that runs past midnight states no end", () => {
    const ev = node(buildExperienceJsonLd({ ...EXPERIENCE, event_time: "22:30:00" }), "Event");
    expect(ev).not.toHaveProperty("endDate");
  });

  it("no time or no duration → no endDate", () => {
    expect(node(buildExperienceJsonLd({ ...EXPERIENCE, event_time: null }), "Event")).not.toHaveProperty("endDate");
    expect(node(buildExperienceJsonLd({ ...EXPERIENCE, duration_minutes: null }), "Event")).not.toHaveProperty("endDate");
  });

  it("full workshop → SoldOut", () => {
    const ev = node(buildExperienceJsonLd({ ...EXPERIENCE, max_participants: 8, spots_left: 0 }), "Event");
    expect(ev.offers.availability).toBe("https://schema.org/SoldOut");
  });

  it("capacity numbers are stated for a workshop too", () => {
    const ev = node(buildExperienceJsonLd({ ...EXPERIENCE, max_participants: 8, spots_left: 3 }), "Event");
    expect(ev.maximumAttendeeCapacity).toBe(8);
    expect(ev.remainingAttendeeCapacity).toBe(3);
    expect(ev.offers.availability).toBe("https://schema.org/InStock");
  });

  it("cancelled workshop → EventCancelled, no availability claim", () => {
    const ev = node(
      buildExperienceJsonLd({ ...EXPERIENCE, is_active: false, max_participants: 8, spots_left: 3 }),
      "Event",
    );
    expect(ev.eventStatus).toBe("https://schema.org/EventCancelled");
    expect(ev.offers).not.toHaveProperty("availability");
  });

  it("offer url is the sign-up link when there is one, else the page", () => {
    const own = node(buildExperienceJsonLd(EXPERIENCE), "Event");
    expect(own.offers.url).toMatch(/\/experiences\/3333/);
    const ext = node(
      buildExperienceJsonLd({ ...EXPERIENCE, registration_url: "https://forms.example/x" }),
      "Event",
    );
    expect(ext.offers.url).toBe("https://forms.example/x");
  });

  it("host with a business id but no slug → /producer/{id}; no business → no url", () => {
    const byId = node(
      buildExperienceJsonLd({ ...EXPERIENCE, host: { id: "h1", name: "דנה", producer_id: "p-9" } }),
      "Event",
    );
    expect(byId.organizer.url).toMatch(/\/producer\/p-9$/);
    const none = node(buildExperienceJsonLd({ ...EXPERIENCE, host: { id: "h1", name: "דנה" } }), "Event");
    expect(none.organizer).not.toHaveProperty("url");
  });

  it("no city → BreadcrumbList only, never an Event", () => {
    const ld = buildExperienceJsonLd({ ...EXPERIENCE, city: null });
    expect(ld["@graph"].map((n) => n["@type"])).toEqual(["BreadcrumbList"]);
  });
});

describe("organizer page (MEH-3348)", () => {
  it("Organization with the public facts + a two-step breadcrumb", () => {
    const ld = buildOrganizerJsonLd(ORGANIZER);
    const org = node(ld, "Organization");
    expect(org.name).toBe("שוק הכרמל");
    expect(org.address).toEqual({ "@type": "PostalAddress", addressLocality: "חיפה", addressCountry: "IL" });
    expect(org.foundingDate).toBe("2019");
    expect(org.sameAs[0]).toBe("https://shuk.example");
    expect(org.sameAs[1]).toMatch(/^https:\/\/(www\.)?instagram\.com\/shuk\/?$/);
    expect(org.sameAs).toHaveLength(2);
    expect(org).not.toHaveProperty("event");
    expect(node(ld, "BreadcrumbList").itemListElement.map((i) => i.position)).toEqual([1, 2]);
  });

  it("bare organizer (0 events, no links) → only name and url", () => {
    const org = node(buildOrganizerJsonLd({ slug: "a", name: "א" }), "Organization");
    expect(Object.keys(org).sort()).toEqual(["@id", "@type", "name", "url"]);
  });

  it("no slug → null", () => {
    expect(buildOrganizerJsonLd({ name: "א" })).toBeNull();
  });
});

describe("validity of every node built above", () => {
  const graphs = [
    buildJsonLd({ ...BUSINESS, offers_delivery: true, delivery_nationwide: true }),
    buildEventJsonLd({ ...EVENT, max_participants: 40, spots_left: 7 }),
    buildExperienceJsonLd({ ...EXPERIENCE, max_participants: 8, spots_left: 3 }),
    buildOrganizerJsonLd(ORGANIZER),
  ];

  it("round-trips through the page serializer and declares schema.org", () => {
    for (const ld of graphs) {
      const back = JSON.parse(serializeJsonLd(ld));
      expect(back).toEqual(ld);
      expect(back["@context"]).toBe("https://schema.org");
    }
  });

  it("every URL-valued field is an absolute http(s) URL", () => {
    const all = graphs.flatMap((g) => urls(g));
    expect(all.length).toBeGreaterThan(10);
    for (const u of all) expect(u).toMatch(/^https?:\/\/[^\s]+$/);
  });

  it("each Event has Google's required name + startDate + location, dates carry an offset", () => {
    const events = graphs.flatMap((g) => g["@graph"]).filter((n) => n["@type"] === "Event");
    expect(events).toHaveLength(2);
    for (const ev of events) {
      expect(ev.name).toBeTruthy();
      expect(ev.location.address.addressLocality).toBeTruthy();
      for (const d of [ev.startDate, ev.endDate].filter(Boolean)) {
        expect(d).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
      }
    }
  });

  it("breadcrumb positions are 1..n with a name and an item each", () => {
    for (const g of graphs) {
      const items = node(g, "BreadcrumbList").itemListElement;
      items.forEach((it2, i) => {
        expect(it2.position).toBe(i + 1);
        expect(it2.name).toBeTruthy();
        expect(it2.item).toBeTruthy();
      });
    }
  });
});
