/**
 * MEH-2447 — hours surfaces respect the owner's «בתיאום מראש» answer:
 * no openingHoursSpecification to Google (it would show «פתוח עכשיו»), and
 * the completeness card does not ask her to invent hours.
 * DISCRIMINATION: before MEH-2447 both read only the hours, so the two
 * by-arrangement cases fail against the old code; the controls pass on both.
 */
import { describe, it, expect } from "vitest";
import { buildJsonLd } from "@/lib/seo";
import { producerCompleteness, COMPLETENESS_FIELDS } from "@/lib/producer-completeness";

const withHours = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "farm",
  name: "משק",
  city: "חיפה",
  has_physical_location: true,
  opening_hours: "Sun-Thu 09:00-18:00",
  categories: [],
  images: [],
};
const business = (p) => buildJsonLd(p)["@graph"].find((e) => e["@type"] === "FoodEstablishment");

describe("JSON-LD opening hours", () => {
  it("control: a walk-in place with hours sends them", () => {
    expect(business(withHours).openingHoursSpecification?.length).toBeGreaterThan(0);
  });
  it("by arrangement: none sent", () => {
    expect(business({ ...withHours, by_arrangement: true }).openingHoursSpecification).toBeUndefined();
  });
});

describe("completeness card — hours", () => {
  const p = { ...withHours, opening_hours: "" };
  it("control: no hours is flagged", () => {
    expect(producerCompleteness(p).missing).toContain(COMPLETENESS_FIELDS.hours);
  });
  it("by arrangement: not flagged", () => {
    expect(producerCompleteness({ ...p, by_arrangement: true }).missing).not.toContain(COMPLETENESS_FIELDS.hours);
  });
});
