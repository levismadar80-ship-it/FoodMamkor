import { describe, it, expect } from "vitest";
import { parseNaiveUtc } from "@/lib/dates";
import { isKashrutCurrent } from "@/lib/badges";

// MEH-2518 review: the API serialises naive-UTC timestamps without a zone.
describe("parseNaiveUtc", () => {
  it("reads a zone-less timestamp as UTC", () => {
    expect(parseNaiveUtc("2027-03-31T20:59:59.999").toISOString()).toBe("2027-03-31T20:59:59.999Z");
  });
  it("passes a zoned timestamp through", () => {
    expect(parseNaiveUtc("2027-03-31T20:59:59+03:00").toISOString()).toBe("2027-03-31T17:59:59.000Z");
  });
  it("returns null for junk and non-strings", () => {
    expect(parseNaiveUtc("nope")).toBeNull();
    expect(parseNaiveUtc(null)).toBeNull();
  });
});

describe("isKashrutCurrent with the real wire format", () => {
  const p = { kashrut_verified_at: "2026-01-01T00:00:00", kashrut_expires_at: "2027-03-31T20:59:59.999" };
  it("is current one minute before the UTC cutoff", () => {
    expect(isKashrutCurrent(p, new Date("2027-03-31T20:58:59Z"))).toBe(true);
  });
  it("has lapsed one minute after the UTC cutoff", () => {
    expect(isKashrutCurrent(p, new Date("2027-03-31T21:00:59Z"))).toBe(false);
  });
});
