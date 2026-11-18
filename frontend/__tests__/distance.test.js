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

describe("formatDistance — whole approximate km (MEH-3219 / B17, string 16)", () => {
  it.each([
    [0.02, 1],
    [0.3, 1],
    [0.85, 1],
    [1.4, 1],
    [1.5, 2],
    [3.24, 3],
    [12.6, 13],
    [53.9, 54],
  ])("%s km → %s", (km, n) => {
    expect(formatDistance(km, { unit: "he" })).toBe(`כ-${n} ק"מ`);
    expect(formatDistance(km)).toBe(`⁦about ${n} km⁩`);
  });

  it("never prints metres or a decimal — the stored point is only ~1 km exact", () => {
    for (const km of [0.04, 0.5, 2.25, 9.95]) {
      for (const unit of ["he", "latin"]) {
        const out = formatDistance(km, { unit });
        expect(out).not.toMatch(/[.,]\d|מ'|\bm\b/);
      }
    }
  });

  it("keeps no «ממך» tail (MEH-1307)", () => {
    expect(formatDistance(5, { unit: "he" })).not.toContain("ממך");
  });

  it("returns null for unusable input", () => {
    expect(formatDistance(NaN)).toBeNull();
    expect(formatDistance(-1)).toBeNull();
    expect(formatDistance(Infinity, { unit: "he" })).toBeNull();
  });
});
