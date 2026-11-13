/**
 * MEH-3035 — the frontend's closed lists must equal the backend's, read from
 * the real schemas.py (not a copy), or a tile would send a value the API 422s.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PAYMENT_METHODS, PAYMENT_TIMINGS, PAYMENT_NOTE_MAX, serializePaymentInfo, paymentStateFrom } from "@/lib/payment-info";

const SCHEMAS = readFileSync(resolve(__dirname, "../../backend/app/schemas/schemas.py"), "utf8");
const tuple = (name) => {
  const m = SCHEMAS.match(new RegExp(`^${name} = \\(([^)]*)\\)`, "m"));
  expect(m, `${name} not found in schemas.py`).toBeTruthy();
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
};

describe("payment-info lists (MEH-3035)", () => {
  it("methods equal the backend's PAYMENT_METHODS, in order", () => {
    expect(PAYMENT_METHODS).toEqual(tuple("PAYMENT_METHODS"));
  });
  it("timings equal the backend's PAYMENT_TIMINGS", () => {
    expect(PAYMENT_TIMINGS).toEqual(tuple("PAYMENT_TIMINGS"));
  });
  it("note cap equals the backend's PAYMENT_NOTE_MAX", () => {
    expect(String(PAYMENT_NOTE_MAX)).toBe(SCHEMAS.match(/^PAYMENT_NOTE_MAX = (\d+)/m)[1]);
  });
  it("round-trips a stored value and collapses empty to null", () => {
    const v = { methods: ["bit", "cash"], timing: "deposit", note: "מקדמה" };
    expect(serializePaymentInfo(paymentStateFrom(v))).toEqual(v);
    expect(serializePaymentInfo(paymentStateFrom(null))).toBeNull();
    expect(serializePaymentInfo({ methods: new Set(), timing: null, note: "   " })).toBeNull();
  });
});
