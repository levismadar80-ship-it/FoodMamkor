// MEH-3255 (D10 contract): the licence nudge reads each category's own
// `requires_license`, so a category an admin created is not "optional".
import { describe, it, expect } from "vitest";
import { requiresProducerLicense } from "@/lib/license-required-categories";

describe("requiresProducerLicense", () => {
  it("a new category flagged by the admin requires a licence", () => {
    const cats = [{ id: 1, name: "פטריות", requires_license: true }];
    expect(requiresProducerLicense(cats, [1])).toBe(true);
  });

  it("a listed name whose row says false requires nothing", () => {
    const cats = [{ id: 2, name: "דבש", requires_license: false }];
    expect(requiresProducerLicense(cats, [2])).toBe(false);
  });

  it("falls back to the name list when the field is absent", () => {
    expect(requiresProducerLicense([{ id: 3, name: "דבש" }], [3])).toBe(true);
    expect(requiresProducerLicense([{ id: 4, name: "ירקות" }], [4])).toBe(false);
  });

  it("nothing selected requires nothing", () => {
    expect(requiresProducerLicense([{ id: 1, name: "x", requires_license: true }], [])).toBe(false);
  });
});
