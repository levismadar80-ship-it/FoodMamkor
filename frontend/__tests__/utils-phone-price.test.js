// Moved from lib/utils.test.mjs (MEH-3714): that file was excluded from
// vitest and never ran in CI.
import { it, expect } from "vitest";
import { normalizePhone, formatPrice, formatPriceRange } from "@/lib/utils";


// --- normalizePhone ---

// --- Empty / nullish input ---
it("empty string → empty string", () => {
  expect(normalizePhone("")).toBe("");
});

it("null → empty string", () => {
  expect(normalizePhone(null)).toBe("");
});

it("undefined → empty string", () => {
  expect(normalizePhone(undefined)).toBe("");
});

// --- Israeli local format (leading 0) ---
it("plain 10-digit 0501234567 → 972501234567", () => {
  expect(normalizePhone("0501234567")).toBe("972501234567");
});

it("cellular prefix 052-123-4567 → 972521234567", () => {
  expect(normalizePhone("052-123-4567")).toBe("972521234567");
});

it("with spaces 052 123 4567 → 972521234567", () => {
  expect(normalizePhone("052 123 4567")).toBe("972521234567");
});

it("with parentheses (050) 123-4567 → 972501234567", () => {
  expect(normalizePhone("(050) 123-4567")).toBe("972501234567");
});

it("with dots 050.123.4567 → 972501234567 (beyond task spec but handled)", () => {
  expect(normalizePhone("050.123.4567")).toBe("972501234567");
});

// --- International format with + ---
it("E.164 +972501234567 → 972501234567", () => {
  expect(normalizePhone("+972501234567")).toBe("972501234567");
});

it("E.164 with spaces +972 50 123 4567 → 972501234567", () => {
  expect(normalizePhone("+972 50 123 4567")).toBe("972501234567");
});

it("E.164 with dashes +972-50-1234567 → 972501234567", () => {
  expect(normalizePhone("+972-50-1234567")).toBe("972501234567");
});

// --- Already clean international ---
it("already normalized 972501234567 → 972501234567", () => {
  expect(normalizePhone("972501234567")).toBe("972501234567");
});

// --- Edge cases around the known order-of-operations bug ---
it("leading whitespace ` 0501234567` → 972501234567 (no order bug)", () => {
  expect(normalizePhone(" 0501234567")).toBe("972501234567");
});

it("trailing whitespace `0501234567 ` → 972501234567", () => {
  expect(normalizePhone("0501234567 ")).toBe("972501234567");
});

it("whitespace both sides → 972501234567", () => {
  expect(normalizePhone("  0501234567  ")).toBe("972501234567");
});

// --- Landline numbers (03 prefix, Tel Aviv) ---
// wa.me needs a mobile number, so normalizePhone rejects a landline
// (utils.js step 3: 972 + [5-9] + 8 digits). This file used to expect
// "97231234567"; it never ran, so nobody saw it go stale (MEH-3714).
it("landline 03-123-4567 → empty (not a WhatsApp number)", () => {
  expect(normalizePhone("03-123-4567")).toBe("");
});

// --- Garbage-in, garbage-out (doesn't crash) ---
it("letters stripped, too few digits left: 050-abc-1234 → empty", () => {
  // Only digits survive (0501234 → 972501234), too short for a mobile number.
  expect(normalizePhone("050-abc-1234")).toBe("");
});

// --- Integration test: full wa.me URL ---
it("integration: 052-123-4567 → https://wa.me/972521234567", () => {
  const url = `https://wa.me/${normalizePhone("052-123-4567")}`;
  expect(url).toBe("https://wa.me/972521234567");
});

it("integration: +972501234567 → https://wa.me/972501234567", () => {
  const url = `https://wa.me/${normalizePhone("+972501234567")}`;
  expect(url).toBe("https://wa.me/972501234567");
});

// ─── formatPrice (MEH-1140 canonical shekel format) ───────────────────────────

// --- formatPrice ---

it("null → null (caller renders nothing)", () => {
  expect(formatPrice(null)).toBe(null);
});

it("undefined → null", () => {
  expect(formatPrice(undefined)).toBe(null);
});

it("empty string → null", () => {
  expect(formatPrice("")).toBe(null);
});

it("non-numeric string → null", () => {
  expect(formatPrice("מ-35")).toBe(null);
});

it("integer → amount then shekel, no space", () => {
  expect(formatPrice(35)).toBe("35₪");
});

it("numeric string coerces", () => {
  expect(formatPrice("35")).toBe("35₪");
});

it("0 → '0₪' (gift/free wording stays at the call site)", () => {
  expect(formatPrice(0)).toBe("0₪");
});

it("from prefix → מ-35₪", () => {
  expect(formatPrice(35, { from: true })).toBe("מ-35₪");
});

it("unit suffix → 35₪ / יחידה", () => {
  expect(formatPrice(35, { unit: "יחידה" })).toBe("35₪ / יחידה");
});

it("from + unit compose", () => {
  expect(formatPrice(35, { from: true, unit: "ק\"ג" })).toBe("מ-35₪ / ק\"ג");
});

it("thousands use he-IL grouping", () => {
  expect(formatPrice(1234)).toBe("1,234₪");
});

it("decimals capped at 2", () => {
  expect(formatPrice(35.567)).toBe("35.57₪");
});

// --- formatPriceRange ---

it("min+max → 35₪–60₪", () => {
  expect(formatPriceRange(35, 60)).toBe("35₪–60₪");
});

it("min only → 35₪", () => {
  expect(formatPriceRange(35, null)).toBe("35₪");
});

it("max only → 60₪", () => {
  expect(formatPriceRange(null, 60)).toBe("60₪");
});

it("equal min/max collapse to one value", () => {
  expect(formatPriceRange(35, 35)).toBe("35₪");
});

it("neither → null", () => {
  expect(formatPriceRange(null, null)).toBe(null);
});

