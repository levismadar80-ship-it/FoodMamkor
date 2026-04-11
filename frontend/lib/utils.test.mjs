// Lightweight Node test for lib/utils.js — no test runner needed.
// Follows the same pattern as lib/producer-completeness.test.mjs.
//   $ node frontend/lib/utils.test.mjs
import assert from "node:assert/strict";
import { normalizePhone } from "./utils.js";

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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
