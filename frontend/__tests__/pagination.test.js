import { describe, it, expect } from "vitest";
import { clampPage, buildPageRange } from "@/lib/pagination";

describe("clampPage", () => {
  it("returns 1 for NaN / zero / negative / non-numeric", () => {
    expect(clampPage(NaN, 10)).toBe(1);
    expect(clampPage(0, 10)).toBe(1);
    expect(clampPage(-5, 10)).toBe(1);
    expect(clampPage("abc", 10)).toBe(1);
  });

  it("returns the requested page when within range", () => {
    expect(clampPage(3, 10)).toBe(3);
    expect(clampPage(10, 10)).toBe(10);
  });

  it("clamps to totalPages when over the limit", () => {
    expect(clampPage(99, 10)).toBe(10);
  });

  it("treats totalPages <= 0 as 1", () => {
    expect(clampPage(1, 0)).toBe(1);
    expect(clampPage(1, -3)).toBe(1);
    expect(clampPage(5, 0)).toBe(1);
  });

  it("floors non-integer requested pages", () => {
    expect(clampPage(3.9, 10)).toBe(3);
  });
});

describe("buildPageRange", () => {
  it("returns all pages when total is small (<= threshold)", () => {
    expect(buildPageRange(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(buildPageRange(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("inserts one ellipsis on the right for early current pages", () => {
    expect(buildPageRange(1, 20)).toEqual([1, 2, "…", 20]);
  });

  it("inserts one ellipsis on the left for late current pages", () => {
    expect(buildPageRange(20, 20)).toEqual([1, "…", 19, 20]);
  });

  it("inserts two ellipses when current is in the middle", () => {
    expect(buildPageRange(10, 20)).toEqual([1, "…", 9, 10, 11, "…", 20]);
  });

  it("respects the siblings prop", () => {
    expect(buildPageRange(10, 20, 2)).toEqual([1, "…", 8, 9, 10, 11, 12, "…", 20]);
  });

  it("clamps current into the valid range", () => {
    expect(buildPageRange(99, 20)).toEqual([1, "…", 19, 20]);
    expect(buildPageRange(0, 20)).toEqual([1, 2, "…", 20]);
  });

  it("returns [1] for total=1", () => {
    expect(buildPageRange(1, 1)).toEqual([1]);
  });
});
