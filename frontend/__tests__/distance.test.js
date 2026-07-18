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
    expect(formatDistance(0.45)).toBe("⁦450 m⁩ ממך");
    expect(formatDistance(0.475)).toBe("⁦500 m⁩ ממך"); // rounds up
    expect(formatDistance(0.999)).toBe("⁦1000 m⁩ ממך");
  });

  it("uses 'less than 50m' label for very close distances", () => {
    expect(formatDistance(0.01)).toBe("פחות מ-50 ⁦m⁩ ממך");
    expect(formatDistance(0.02)).toBe("פחות מ-50 ⁦m⁩ ממך");
  });

  // MEH-1301 🔒 18/07: precision threshold moved from 100 km → 10 km.
  it("uses one decimal for 1–9 km", () => {
    expect(formatDistance(1)).toBe("⁦1.0 km⁩ ממך");
    expect(formatDistance(3.24)).toBe("⁦3.2 km⁩ ממך");
    expect(formatDistance(9.44)).toBe("⁦9.4 km⁩ ממך");
  });

  it("uses no decimal for ≥10 km (avoids false precision)", () => {
    expect(formatDistance(10)).toBe("⁦10 km⁩ ממך");
    expect(formatDistance(38.3)).toBe("⁦38 km⁩ ממך");
    expect(formatDistance(54.7)).toBe("⁦55 km⁩ ממך");
    expect(formatDistance(100)).toBe("⁦100 km⁩ ממך");
    expect(formatDistance(312.5)).toBe("⁦313 km⁩ ממך");
    expect(formatDistance(20015)).toBe("⁦20015 km⁩ ממך");
  });
});

describe("formatDistance — Hebrew unit / no suffix (MEH-1243 §3, MEH-1301)", () => {
  it('renders "{x.x} ק"מ" for 1-9 km, digits-first, no ממך', () => {
    expect(formatDistance(1.2, { unit: "he", suffix: false })).toBe('1.2 ק"מ');
    expect(formatDistance(9.9, { unit: "he", suffix: false })).toBe('9.9 ק"מ');
  });

  it('renders whole ק"מ for >=10 km and מ for <1 km', () => {
    expect(formatDistance(38.3, { unit: "he", suffix: false })).toBe('38 ק"מ');
    expect(formatDistance(53.9, { unit: "he", suffix: false })).toBe('54 ק"מ');
    expect(formatDistance(312.5, { unit: "he", suffix: false })).toBe('313 ק"מ');
    expect(formatDistance(0.45, { unit: "he", suffix: false })).toBe("450 מ'");
  });

  it("keeps the ממך suffix when suffix is not disabled (ProducerCard pill)", () => {
    expect(formatDistance(1.2, { unit: "he" })).toBe('1.2 ק"מ ממך');
    expect(formatDistance(38.3, { unit: "he" })).toBe('38 ק"מ ממך');
  });

  it("default (latin) output is unchanged for existing callers", () => {
    expect(formatDistance(1.2)).toBe("⁦1.2 km⁩ ממך");
  });
});
