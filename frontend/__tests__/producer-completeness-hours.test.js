/**
 * MEH-1884 — opening_hours counts toward profile completeness (yellow tier).
 *
 * Hours feed the LocalBusiness JSON-LD `openingHoursSpecification`
 * (lib/seo.js:288-291) and the open-now surfaces, but the completeness
 * heuristic ignored them, so an owner got no signal that they were missing.
 *
 * The load-bearing assertion is the TIER, not just the label: hours must never
 * be able to turn a producer red. redCondition stays exactly 3 conditions
 * (city / coords / contact) — a business with no hours is still findable and
 * contactable. A future edit that folds `noHours` into redCondition reds the
 * "stays yellow" and "redCondition is still exactly 3 conditions" cases below.
 */
import { describe, it, expect } from "vitest";
import { producerCompleteness, COMPLETENESS_FIELDS } from "@/lib/producer-completeness";

// Complete on every OTHER axis, so only opening_hours can move the result.
const baseComplete = {
  city: "חיפה",
  lat: 32.8,
  lng: 34.9,
  phone: "050-1234567",
  categories: [{ id: 1, name: "מאפים" }],
  images: ["https://x/img.jpg"],
  short_description: "מאפייה שכונתית",
  has_physical_location: true,
  opening_hours: "Sun-Thu 09:00-18:00",
};

const hoursMissing = (p) =>
  producerCompleteness(p).missing.includes(COMPLETENESS_FIELDS.hours);

describe("producerCompleteness — opening_hours (MEH-1884)", () => {
  it("exposes the hours label on the shared FIELDS map", () => {
    expect(COMPLETENESS_FIELDS.hours).toBe("שעות פתיחה");
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["empty string", ""],
    ["whitespace only", "   "],
  ])("flags hours as missing when opening_hours is %s", (_label, value) => {
    expect(hoursMissing({ ...baseComplete, opening_hours: value })).toBe(true);
  });

  it("does not flag hours once opening_hours is filled", () => {
    expect(hoursMissing(baseComplete)).toBe(false);
  });

  // The tier guarantee — this is what must not regress.
  it("missing hours alone is YELLOW, never red", () => {
    const { missing, priority } = producerCompleteness({
      ...baseComplete,
      opening_hours: null,
    });
    expect(missing).toEqual([COMPLETENESS_FIELDS.hours]);
    expect(priority).toBe("yellow");
  });

  it("a fully-filled producer including hours is green with nothing missing", () => {
    const { missing, priority } = producerCompleteness(baseComplete);
    expect(missing).toEqual([]);
    expect(priority).toBe("green");
  });

  // redCondition is still exactly 3 conditions: city, coords, contact. Each is
  // exercised WITH hours present, so a red can only come from the old three.
  it.each([
    ["city", { city: "" }],
    ["coords", { lat: null, lng: null }],
    ["contact", { phone: "", instagram: "" }],
  ])("still reds on missing %s (red logic unchanged)", (_label, patch) => {
    expect(producerCompleteness({ ...baseComplete, ...patch }).priority).toBe("red");
  });

  it("reds on nothing else — hours is the only new missing field introduced", () => {
    // Same producer, hours stripped: the ONLY delta vs baseComplete is the
    // hours entry. If a future change also folded hours into redCondition this
    // would report "red" and fail.
    const before = producerCompleteness(baseComplete);
    const after = producerCompleteness({ ...baseComplete, opening_hours: null });
    expect(after.missing.filter((m) => !before.missing.includes(m))).toEqual([
      COMPLETENESS_FIELDS.hours,
    ]);
    expect(after.priority).not.toBe("red");
  });

  // MEH-1884: order_window is deliberately NOT counted — a per-cycle ordering
  // window is not a standing profile field.
  it("does not count order_window", () => {
    const { missing } = producerCompleteness({ ...baseComplete, order_window: null });
    expect(missing).toEqual([]);
  });
});
