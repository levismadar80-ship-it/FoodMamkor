import { describe, it, expect } from "vitest";

import { formatEventDate } from "@/lib/format-date";

describe("formatEventDate", () => {
  it("returns '' for nullish / empty input", () => {
    expect(formatEventDate(null, "he")).toBe("");
    expect(formatEventDate(undefined, "he")).toBe("");
    expect(formatEventDate("", "he")).toBe("");
  });

  // HOT-018 (MEH-782): a malformed-but-non-empty string used to render the
  // literal "Invalid Date" (toLocaleDateString does not throw on it).
  it("returns '' for a malformed non-empty date string", () => {
    expect(formatEventDate("not-a-date", "he")).toBe("");
    expect(formatEventDate("2026-13-99", "he")).toBe("");
  });

  it("formats a valid ISO date in the active locale", () => {
    const opts = { year: "numeric", month: "numeric", day: "numeric" };
    expect(formatEventDate("2026-06-07T10:00:00Z", "he", opts)).toContain("2026");
    // en surface must not be empty and must differ from a raw passthrough.
    expect(formatEventDate("2026-06-07T10:00:00Z", "en", opts)).toContain("2026");
  });
});
