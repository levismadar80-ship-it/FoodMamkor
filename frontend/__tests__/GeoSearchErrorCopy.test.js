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

// Feminine-singular imperatives and possessives the reader copy must not use.
const FEMININE = /הזיזי|הקטיני|נסי\b|חפשי|שלך\b|לך\b/;

describe("GeoSearchSchema error copy comes from messages, gender-neutral", () => {
  it.each([
    [0.5, "radius_too_small"],
    [80, "radius_too_large"],
  ])("radius %s → map.errors.%s in he and en", (radius, key) => {
    expect(issueKey(radius)).toBe(key);
    expect(he.map.errors[key]).toBeTruthy();
    expect(en.map.errors[key]).toBeTruthy();
  });

  it("the Hebrew copy is not in the feminine singular", () => {
    for (const key of ["radius_too_small", "radius_too_large"]) {
      expect(he.map.errors[key]).not.toMatch(FEMININE);
    }
  });

  it("a valid radius still parses", () => {
    expect(GeoSearchSchema.safeParse({ lat: 32.5, lng: 34.9, radius_km: 10 }).success).toBe(true);
  });
});
