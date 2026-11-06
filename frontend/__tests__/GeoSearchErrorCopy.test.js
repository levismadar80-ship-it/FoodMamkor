/**
 * MEH-2765 — the map's "search this area" guard used to toast two Hebrew
 * strings hard-coded in lib/schemas.js, in the feminine imperative
 * («הזיזי…», «הקטיני…»), against ADR-037. The schema now carries message
 * keys; the words live in messages/{he,en}.json under map.errors.
 */
import { describe, it, expect } from "vitest";
import { GeoSearchSchema } from "@/lib/schemas";
import he from "../messages/he.json";
import en from "../messages/en.json";

const issueKey = (radius_km) =>
  GeoSearchSchema.safeParse({ lat: 32.5, lng: 34.9, radius_km }).error?.issues?.[0]?.message;


describe("GeoSearchSchema error copy comes from messages, gender-neutral", () => {
  it.each([
    [0.5, "radius_too_small"],
    [80, "radius_too_large"],
  ])("radius %s → map.errors.%s in he and en", (radius, key) => {
    expect(issueKey(radius)).toBe(key);
    expect(he.map.errors[key]).toBeTruthy();
    expect(en.map.errors[key]).toBeTruthy();
  });

  it("the Hebrew copy is the plural imperative, not the old feminine strings", () => {
    expect(he.map.errors.radius_too_small).toBe("הזיזו את המפה לפני החיפוש");
    expect(he.map.errors.radius_too_large).toBe("האזור גדול מדי — הקטינו את מרחק החיפוש");
  });

  it("a valid radius still parses", () => {
    expect(GeoSearchSchema.safeParse({ lat: 32.5, lng: 34.9, radius_km: 10 }).success).toBe(true);
  });
});
