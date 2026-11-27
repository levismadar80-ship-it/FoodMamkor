import { describe, it, expect } from "vitest";
import { addressLine } from "@/lib/address-line";

// MEH-3959: the same cases as tests/test_meh3959_address_line.py.
describe("addressLine", () => {
  it("does not repeat a city that is the last comma part", () => {
    expect(addressLine("רחוב המייסדים 12, זכרון יעקב", "זכרון יעקב")).toBe("רחוב המייסדים 12, זכרון יעקב");
  });
  it("does not repeat a city that is the last words", () => {
    expect(addressLine("הרצל 5 חיפה", "חיפה")).toBe("הרצל 5 חיפה");
  });
  it("adds the city to a street named after it", () => {
    expect(addressLine("דרך חיפה 5", "חיפה")).toBe("דרך חיפה 5, חיפה");
  });
  it("adds the city to a plain street", () => {
    expect(addressLine("הרצל 5", "חיפה")).toBe("הרצל 5, חיפה");
  });
  it("handles missing parts", () => {
    expect(addressLine(null, "חיפה")).toBe("חיפה");
    expect(addressLine("הרצל 5", undefined)).toBe("הרצל 5");
    expect(addressLine(null, null)).toBe("");
  });
  it("adds a city that only ends another city's name as letters", () => {
    expect(addressLine("הרצל 5, אור יהודה", "יהוד")).toBe("הרצל 5, אור יהודה, יהוד");
  });
  it("does not let a trailing full stop hide the city", () => {
    expect(addressLine("הרצל 5, חיפה.", "חיפה")).toBe("הרצל 5, חיפה");
  });
  it("cleans a trailing comma and extra spaces", () => {
    expect(addressLine("הרצל 5,  ", " חיפה ")).toBe("הרצל 5, חיפה");
  });
});
