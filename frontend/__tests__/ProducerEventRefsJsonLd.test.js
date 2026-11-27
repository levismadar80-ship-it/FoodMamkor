// @ts-check
/**
 * MEH-3953 — a business page names the events and experiences it runs, as
 * `event` references on its FoodEstablishment node, pointing at the same
 * `@id` the event / experience page itself emits.
 */
import { describe, it, expect } from "vitest";
import { buildJsonLd, buildEventJsonLd, buildExperienceJsonLd, producerEventRefs } from "@/lib/seo";

const producer = { id: "p1", name: "משק פורר", slug: "meshekforer", city: "נחלים", categories: [] };
const business = (ld) => ld["@graph"].find((n) => n["@type"] === "FoodEstablishment");

describe("producer `event` references (MEH-3953)", () => {
  it("no activities → no `event` key", () => {
    expect(business(buildJsonLd(producer, "he"))).not.toHaveProperty("event");
    expect(business(buildJsonLd(producer, "he", { events: [], experiences: [] }))).not.toHaveProperty("event");
  });

  it("one event → one reference with the event page's own @id", () => {
    const ev = { id: "e1", title: "יום שוק", event_date: "2026-12-03", is_active: true };
    const refs = business(buildJsonLd(producer, "he", { events: [ev], experiences: [] })).event;
    expect(refs).toHaveLength(1);
    const evPage = buildEventJsonLd(ev, "he")["@graph"].find((n) => n["@type"] === "Event");
    expect(refs[0]["@id"]).toBe(evPage["@id"]);
    expect(refs[0]).toMatchObject({ "@type": "Event", name: "יום שוק", startDate: "2026-12-03" });
  });

  it("many: events and experiences both, a cancelled one left out", () => {
    const exp = { id: "x1", title: "קטיף עצמי", event_date: "2026-12-05", city: "נחלים" };
    const refs = producerEventRefs({
      events: [{ id: "e1", title: "א" }, { id: "e2", title: "ב", is_active: false }],
      experiences: [exp],
    });
    expect(refs.map((r) => r.name)).toEqual(["א", "קטיף עצמי"]);
    const expPage = buildExperienceJsonLd(exp, "he")["@graph"].find((n) => n["@type"] === "Event");
    expect(refs[1]["@id"]).toBe(expPage["@id"]);
    expect(refs[0]).not.toHaveProperty("startDate");
  });

  it("a failed activities read (null) emits nothing", () => {
    expect(producerEventRefs(null)).toEqual([]);
  });
});
