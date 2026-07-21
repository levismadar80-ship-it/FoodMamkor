import { describe, it, expect } from "vitest";
import { LocationInputSchema } from "@/lib/schemas";

// MEH-1421 (MEH-1388 chunk 4a): the Rule-19 payload guard LocationsEditor
// safeParse's before every POST/PUT to /producers/me/locations. Bounds mirror
// the backend ProducerLocationCreate.

describe("LocationInputSchema (MEH-1421)", () => {
  const valid = {
    kind: "pickup",
    label: "נקודת איסוף צפון",
    city: "חיפה",
    address: "הרצל 5",
    lat: 32.79,
    lng: 34.98,
    opening_hours: "א'-ה' 9-17",
    phone: "050-1234567",
    is_primary: false,
    location_precision: "exact",
  };

  it("accepts a full valid payload", () => {
    expect(LocationInputSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a minimal payload (only kind; coords null)", () => {
    const r = LocationInputSchema.safeParse({ kind: "branch", lat: null, lng: null });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown kind", () => {
    const r = LocationInputSchema.safeParse({ ...valid, kind: "warehouse" });
    expect(r.success).toBe(false);
  });

  it("rejects latitude out of bounds", () => {
    const r = LocationInputSchema.safeParse({ ...valid, lat: 200 });
    expect(r.success).toBe(false);
  });

  it("rejects longitude out of bounds", () => {
    const r = LocationInputSchema.safeParse({ ...valid, lng: -200 });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid precision", () => {
    const r = LocationInputSchema.safeParse({ ...valid, location_precision: "fuzzy" });
    expect(r.success).toBe(false);
  });
});
