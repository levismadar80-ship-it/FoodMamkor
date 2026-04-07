// Lightweight node test for producerCompleteness — no test runner needed.
//   $ node frontend/lib/producer-completeness.test.mjs
import assert from "node:assert/strict";
import { producerCompleteness } from "./producer-completeness.js";

const FULL = {
  city: "תל אביב",
  lat: 32.08,
  lng: 34.78,
  phone: "0501234567",
  instagram: "@foo",
  categories: [{ id: "c1", name: "ירקות" }],
  images: ["https://example.com/a.jpg"],
};

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

console.log("producerCompleteness");

it("fully populated → green, no missing", () => {
  const r = producerCompleteness(FULL);
  assert.equal(r.priority, "green");
  assert.deepEqual(r.missing, []);
});

it("missing city → red", () => {
  const r = producerCompleteness({ ...FULL, city: null });
  assert.equal(r.priority, "red");
  assert.ok(r.missing.includes("עיר"));
});

it("missing lat → red", () => {
  const r = producerCompleteness({ ...FULL, lat: null });
  assert.equal(r.priority, "red");
  assert.ok(r.missing.includes("קואורדינטות"));
});

it("missing lng → red", () => {
  const r = producerCompleteness({ ...FULL, lng: null });
  assert.equal(r.priority, "red");
});

it("missing both phone and instagram → red", () => {
  const r = producerCompleteness({ ...FULL, phone: null, instagram: null });
  assert.equal(r.priority, "red");
  assert.ok(r.missing.includes("פרטי קשר (טלפון/אינסטגרם)"));
});

it("only phone present → green (instagram optional)", () => {
  const r = producerCompleteness({ ...FULL, instagram: null });
  assert.equal(r.priority, "green");
});

it("only instagram present → green (phone optional)", () => {
  const r = producerCompleteness({ ...FULL, phone: null });
  assert.equal(r.priority, "green");
});

it("missing only categories → yellow", () => {
  const r = producerCompleteness({ ...FULL, categories: [] });
  assert.equal(r.priority, "yellow");
  assert.deepEqual(r.missing, ["קטגוריה"]);
});

it("missing only images → yellow", () => {
  const r = producerCompleteness({ ...FULL, images: [] });
  assert.equal(r.priority, "yellow");
  assert.deepEqual(r.missing, ["תמונה"]);
});

it("missing categories AND city → red (city wins)", () => {
  const r = producerCompleteness({ ...FULL, city: null, categories: [] });
  assert.equal(r.priority, "red");
  assert.deepEqual(r.missing, ["עיר", "קטגוריה"]);
});

it("undefined images / categories → treated as empty", () => {
  const r = producerCompleteness({
    ...FULL,
    images: undefined,
    categories: undefined,
  });
  assert.equal(r.priority, "yellow");
  assert.ok(r.missing.includes("תמונה"));
  assert.ok(r.missing.includes("קטגוריה"));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
