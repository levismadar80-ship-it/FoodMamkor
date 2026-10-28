/**
 * MEH-2461 (review #3712 F3) — an organizer's event points its JSON-LD at the
 * organizer page, not at /producer/{id} (which 404s an organizer since
 * MEH-2459). Control: a business event keeps /producer/{id}.
 */
import { describe, it, expect } from "vitest";
import { buildEventJsonLd } from "@/lib/seo";
import { SITE_URL } from "@/lib/env";

const BASE = {
  id: 7,
  title: "שוק איכרים",
  event_date: "2026-11-01",
  price: 0,
  producer_name: "שוק גלם",
  producer_id: "00000000-0000-0000-0000-000000000042",
};

const crumbItems = (ld) =>
  ld["@graph"].find((n) => n["@type"] === "BreadcrumbList").itemListElement.map((i) => i.item);
const eventNode = (ld) => ld["@graph"].find((n) => n["@type"] === "Event");

describe("buildEventJsonLd — who runs the event", () => {
  it("organizer with a slug → /organizers/{slug} in organizer.url and the breadcrumb", () => {
    const ld = buildEventJsonLd(
      { ...BASE, owner_kind: "organizer", owner_slug: "shuk-glam" },
      "he",
    );
    expect(eventNode(ld).organizer.url).toBe(`${SITE_URL}/organizers/shuk-glam`);
    expect(crumbItems(ld)).toContain(`${SITE_URL}/organizers/shuk-glam`);
    expect(JSON.stringify(ld)).not.toContain("/producer/");
  });

  it("organizer without a slug → named, but no URL and no owner crumb", () => {
    const ld = buildEventJsonLd({ ...BASE, owner_kind: "organizer", owner_slug: null }, "he");
    expect(eventNode(ld).organizer.name).toBe("שוק גלם");
    expect(eventNode(ld).organizer.url).toBeUndefined();
    expect(JSON.stringify(ld)).not.toContain("/producer/");
  });

  it("control: a business event keeps /producer/{id}", () => {
    const ld = buildEventJsonLd({ ...BASE, owner_kind: "producer", owner_slug: "x" }, "he");
    expect(eventNode(ld).organizer.url).toBe(`${SITE_URL}/producer/${BASE.producer_id}`);
    expect(crumbItems(ld)).toContain(`${SITE_URL}/producer/${BASE.producer_id}`);
  });
});
