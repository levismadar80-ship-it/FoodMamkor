// Lightweight Node test for lib/utils.js — no test runner needed.
// Follows the same pattern as lib/producer-completeness.test.mjs.
//   $ node frontend/lib/utils.test.mjs
import assert from "node:assert/strict";
import { normalizePhone, formatPrice, formatPriceRange } from "./utils.js";

let passed = 0;
let failed = 0;
function it(name, fn) {
  try {
    fn();
    console.log("  ✓", name);
    passed++;
  } catch (err) {
    console.log("  ✗", name, "—", err.message);
    failed++;
  }
}

console.log("normalizePhone");

// --- Empty / nullish input ---
it("empty string → empty string", () => {
  assert.equal(normalizePhone(""), "");
});

it("null → empty string", () => {
  assert.equal(normalizePhone(null), "");
});

it("undefined → empty string", () => {
  assert.equal(normalizePhone(undefined), "");
});

// --- Israeli local format (leading 0) ---
it("plain 10-digit 0501234567 → 972501234567", () => {
  assert.equal(normalizePhone("0501234567"), "972501234567");
});

it("cellular prefix 052-123-4567 → 972521234567", () => {
  assert.equal(normalizePhone("052-123-4567"), "972521234567");
});

it("with spaces 052 123 4567 → 972521234567", () => {
  assert.equal(normalizePhone("052 123 4567"), "972521234567");
});

it("with parentheses (050) 123-4567 → 972501234567", () => {
  assert.equal(normalizePhone("(050) 123-4567"), "972501234567");
});

it("with dots 050.123.4567 → 972501234567 (beyond task spec but handled)", () => {
  assert.equal(normalizePhone("050.123.4567"), "972501234567");
});

// --- International format with + ---
it("E.164 +972501234567 → 972501234567", () => {
  assert.equal(normalizePhone("+972501234567"), "972501234567");
});

it("E.164 with spaces +972 50 123 4567 → 972501234567", () => {
  assert.equal(normalizePhone("+972 50 123 4567"), "972501234567");
});

it("E.164 with dashes +972-50-1234567 → 972501234567", () => {
  assert.equal(normalizePhone("+972-50-1234567"), "972501234567");
});

// --- Already clean international ---
it("already normalized 972501234567 → 972501234567", () => {
  assert.equal(normalizePhone("972501234567"), "972501234567");
});

// --- Edge cases around the known order-of-operations bug ---
it("leading whitespace ` 0501234567` → 972501234567 (no order bug)", () => {
  assert.equal(normalizePhone(" 0501234567"), "972501234567");
});

it("trailing whitespace `0501234567 ` → 972501234567", () => {
  assert.equal(normalizePhone("0501234567 "), "972501234567");
});

it("whitespace both sides → 972501234567", () => {
  assert.equal(normalizePhone("  0501234567  "), "972501234567");
});

// --- Landline numbers (03 prefix, Tel Aviv) ---
it("landline 03-123-4567 → 97231234567", () => {
  assert.equal(normalizePhone("03-123-4567"), "97231234567");
});

// --- Garbage-in, garbage-out (doesn't crash) ---
it("non-numeric chars stripped: 050-abc-1234 → 972501234 (letters gone, 9 digits)", () => {
  // All letters are stripped — only digits survive. Result is shorter
  // than a full Israeli number but the function doesn't validate length.
  assert.equal(normalizePhone("050-abc-1234"), "972501234");
});

// --- Integration test: full wa.me URL ---
it("integration: 052-123-4567 → https://wa.me/972521234567", () => {
  const url = `https://wa.me/${normalizePhone("052-123-4567")}`;
  assert.equal(url, "https://wa.me/972521234567");
});

it("integration: +972501234567 → https://wa.me/972501234567", () => {
  const url = `https://wa.me/${normalizePhone("+972501234567")}`;
  assert.equal(url, "https://wa.me/972501234567");
});

// ─── formatPrice (MEH-1140 canonical shekel format) ───────────────────────────

console.log("\nformatPrice");

it("null → null (caller renders nothing)", () => {
  assert.equal(formatPrice(null), null);
});

it("undefined → null", () => {
  assert.equal(formatPrice(undefined), null);
});

it("empty string → null", () => {
  assert.equal(formatPrice(""), null);
});

it("non-numeric string → null", () => {
  assert.equal(formatPrice("מ-35"), null);
});

it("integer → amount then shekel, no space", () => {
  assert.equal(formatPrice(35), "35₪");
});

it("numeric string coerces", () => {
  assert.equal(formatPrice("35"), "35₪");
});

it("0 → '0₪' (gift/free wording stays at the call site)", () => {
  assert.equal(formatPrice(0), "0₪");
});

it("from prefix → מ-35₪", () => {
  assert.equal(formatPrice(35, { from: true }), "מ-35₪");
});

it("unit suffix → 35₪ / יחידה", () => {
  assert.equal(formatPrice(35, { unit: "יחידה" }), "35₪ / יחידה");
});

it("from + unit compose", () => {
  assert.equal(formatPrice(35, { from: true, unit: "ק\"ג" }), "מ-35₪ / ק\"ג");
});

it("thousands use he-IL grouping", () => {
  assert.equal(formatPrice(1234), "1,234₪");
});

it("decimals capped at 2", () => {
  assert.equal(formatPrice(35.567), "35.57₪");
});

console.log("\nformatPriceRange");

it("min+max → 35₪–60₪", () => {
  assert.equal(formatPriceRange(35, 60), "35₪–60₪");
});

it("min only → 35₪", () => {
  assert.equal(formatPriceRange(35, null), "35₪");
});

it("max only → 60₪", () => {
  assert.equal(formatPriceRange(null, 60), "60₪");
});

it("equal min/max collapse to one value", () => {
  assert.equal(formatPriceRange(35, 35), "35₪");
});

it("neither → null", () => {
  assert.equal(formatPriceRange(null, null), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
