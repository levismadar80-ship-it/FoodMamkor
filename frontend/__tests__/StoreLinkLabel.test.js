// @ts-check
/**
 * MEH-2938 — the approved label (Sapir 11/11, row 34) on both the dashboard
 * contact card and the registration field. «טופס הזמנות» alone did not tell an
 * owner with an online shop that this is where it goes.
 */
import { describe, it, expect } from "vitest";
import he from "../messages/he.json";

const APPROVED = "חנות או טופס הזמנות באתר שלכם (קישור)";

describe("store-link label (MEH-2938)", () => {
  it("dashboard contact card", () => {
    expect(findKey(he, "field_external_order")).toBe(APPROVED);
  });
  it("registration step 2", () => {
    expect(he.auth.register.producer.fields.external_order_form_label).toBe(APPROVED);
  });
});

function findKey(obj, key) {
  for (const [k, v] of Object.entries(obj)) {
    if (k === key) return v;
    if (v && typeof v === "object") {
      const hit = findKey(v, key);
      if (hit !== undefined) return hit;
    }
  }
  return undefined;
}
