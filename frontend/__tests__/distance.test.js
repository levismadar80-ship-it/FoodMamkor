import { describe, it, expect } from "vitest";
import { haversineKm, formatDistance } from "@/lib/distance";

describe("haversineKm", () => {
  it("returns 0 for identical points", () => {
    expect(haversineKm(31.78, 35.21, 31.78, 35.21)).toBeCloseTo(0, 6);
  });

  it("Tel Aviv → Jerusalem is ~54 km", () => {
    // TLV (32.0853, 34.7818) → Jerusalem (31.7683, 35.2137)
    const km = haversineKm(32.0853, 34.7818, 31.7683, 35.2137);
    expect(km).toBeGreaterThan(50);
    expect(km).toBeLessThan(60);
  });

  it("Tel Aviv → Eilat is ~310 km", () => {
    // TLV (32.0853, 34.7818) → Eilat (29.5577, 34.9519)
    const km = haversineKm(32.0853, 34.7818, 29.5577, 34.9519);
    expect(km).toBeGreaterThan(280);
    expect(km).toBeLessThan(320);
  });

  it("antipodal points are ~20015 km", () => {
    // North pole (90, 0) → South pole (-90, 0) — half Earth's circumference
    const km = haversineKm(90, 0, -90, 0);
    expect(km).toBeGreaterThan(20000);
    expect(km).toBeLessThan(20040);
  });

  it("returns NaN for null inputs", () => {
    expect(haversineKm(null, 0, 0, 0)).toBeNaN();
    expect(haversineKm(0, null, 0, 0)).toBeNaN();
    expect(haversineKm(0, 0, null, 0)).toBeNaN();
    expect(haversineKm(0, 0, 0, null)).toBeNaN();
  });

  it("returns NaN for undefined inputs", () => {
    expect(haversineKm(undefined, 0, 0, 0)).toBeNaN();
  });
});

describe("formatDistance", () => {
  it("returns null for non-finite or negative input", () => {
    expect(formatDistance(NaN)).toBe(null);
    expect(formatDistance(Infinity)).toBe(null);
    expect(formatDistance(-1)).toBe(null);
    expect(formatDistance(null)).toBe(null);
    expect(formatDistance(undefined)).toBe(null);
  });

  it("rounds sub-kilometer distances to the nearest 50 m", () => {
    expect(formatDistance(0.45)).toBe("450 מ' ממך");
    expect(formatDistance(0.475)).toBe("500 מ' ממך"); // rounds up
    expect(formatDistance(0.999)).toBe("1000 מ' ממך");
  });

  it("uses 'less than 50m' label for very close distances", () => {
    expect(formatDistance(0.01)).toBe("פחות מ-50 מ' ממך");
    expect(formatDistance(0.02)).toBe("פחות מ-50 מ' ממך");
  });

  it("uses one decimal for 1–99 km", () => {
    expect(formatDistance(1)).toBe('1.0 ק"מ ממך');
    expect(formatDistance(3.24)).toBe('3.2 ק"מ ממך');
    expect(formatDistance(54.7)).toBe('54.7 ק"מ ממך');
    expect(formatDistance(99.94)).toBe('99.9 ק"מ ממך');
  });

  it("uses no decimal for ≥100 km (avoids false precision)", () => {
    expect(formatDistance(100)).toBe('100 ק"מ ממך');
    expect(formatDistance(312.5)).toBe('313 ק"מ ממך');
    expect(formatDistance(20015)).toBe('20015 ק"מ ממך');
  });
});
