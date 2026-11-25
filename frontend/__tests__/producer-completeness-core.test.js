// Moved from lib/producer-completeness.test.mjs (MEH-3714): that file was
// excluded from vitest and never ran in CI.
import { it, expect } from "vitest";
import { producerCompleteness, COMPLETENESS_FIELDS as F } from "@/lib/producer-completeness";

const FULL = {
  city: "תל אביב",
  lat: 32.08,
  lng: 34.78,
  // MEH-1938: coords come from the primary location row.
  locations: [{ kind: "branch", is_primary: true, lat: 32.08, lng: 34.78, precision: "exact" }],
  phone: "0501234567",
  instagram: "@foo",
  categories: [{ id: "c1", name: "ירקות" }],
  images: ["https://example.com/a.jpg"],
  // MEH-1002: tagline (short_description) OR long story (description).
  short_description: "גבינות עיזים מהחווה",
  has_physical_location: true,
  opening_hours: "Sun-Thu 09:00-18:00",
};


// --- producerCompleteness ---

it("fully populated → green, no missing", () => {
  const r = producerCompleteness(FULL);
  expect(r.priority).toBe("green");
  expect(r.missing).toEqual([]);
});

it("missing city → red", () => {
  const r = producerCompleteness({ ...FULL, city: null });
  expect(r.priority).toBe("red");
  expect(r.missing).toContain(F.city);
});

// MEH-1938 chunk 5a: coords come only from a producer_locations row; the
// old lat/lng columns no longer count.
it("no location row → red, flags coords", () => {
  const r = producerCompleteness({ ...FULL, locations: [] });
  expect(r.priority).toBe("red");
  expect(r.missing).toContain(F.coords);
});

it("lat/lng columns alone do not satisfy coords", () => {
  const r = producerCompleteness({ ...FULL, locations: [], lat: 32.08, lng: 34.78 });
  expect(r.missing).toContain(F.coords);
});

it("missing both phone and instagram → red", () => {
  const r = producerCompleteness({ ...FULL, phone: null, instagram: null });
  expect(r.priority).toBe("red");
  expect(r.missing).toContain(F.contact);
});

it("only phone present → green (instagram optional)", () => {
  const r = producerCompleteness({ ...FULL, instagram: null });
  expect(r.priority).toBe("green");
});

it("only instagram present → green (phone optional)", () => {
  const r = producerCompleteness({ ...FULL, phone: null });
  expect(r.priority).toBe("green");
});

it("missing only categories → yellow", () => {
  const r = producerCompleteness({ ...FULL, categories: [] });
  expect(r.priority).toBe("yellow");
  expect(r.missing).toEqual([F.category]);
});

it("missing only images → yellow", () => {
  const r = producerCompleteness({ ...FULL, images: [] });
  expect(r.priority).toBe("yellow");
  expect(r.missing).toEqual([F.image]);
});

it("missing categories AND city → red (city wins)", () => {
  const r = producerCompleteness({ ...FULL, city: null, categories: [] });
  expect(r.priority).toBe("red");
  expect(r.missing).toEqual([F.city, F.category]);
});

// MEH-1002: "תיאור קצר" — OR of short_description / description, yellow-tier.
it("short_description null + description absent → yellow, flags תיאור קצר", () => {
  const r = producerCompleteness({ ...FULL, short_description: null });
  expect(r.priority).toBe("yellow");
  expect(r.missing).toEqual([F.short_desc]);
});

it("whitespace-only short_description (no description) → still missing", () => {
  const r = producerCompleteness({ ...FULL, short_description: "   " });
  expect(r.priority).toBe("yellow");
  expect(r.missing).toContain(F.short_desc);
});

it("only long description filled → תיאור קצר not missing (OR semantics)", () => {
  const r = producerCompleteness({
    ...FULL,
    short_description: null,
    description: "סיפור העסק המלא שלנו",
  });
  expect(r.priority).toBe("green");
  expect(r.missing).toEqual([]);
});

it("only short_description filled → green (tagline alone satisfies)", () => {
  const r = producerCompleteness({ ...FULL, description: null });
  expect(r.priority).toBe("green");
  expect(r.missing).toEqual([]);
});

it("missing description never turns the profile red (yellow-tier only)", () => {
  // Everything red-relevant present, only the description pair empty.
  const r = producerCompleteness({
    ...FULL,
    short_description: undefined,
    description: undefined,
  });
  expect(r.priority).toBe("yellow");
});

it("undefined images / categories → treated as empty", () => {
  const r = producerCompleteness({
    ...FULL,
    images: undefined,
    categories: undefined,
  });
  expect(r.priority).toBe("yellow");
  expect(r.missing).toContain(F.image);
  expect(r.missing).toContain(F.category);
});

