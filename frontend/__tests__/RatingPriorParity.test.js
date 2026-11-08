import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// MEH-2617: /producers sorts by rating on the server (producer_queries.py) and
// /map sorts the same feed in the browser (lib/rating-gate.js). Both use the
// Bayesian prior; if the two constants drift, the two pages order differently
// with no error anywhere. This reads the literals from both source files.
const read = (rel) => readFileSync(resolve(__dirname, rel), "utf8");
const PY = read("../../backend/app/services/producer_queries.py");
const JS = read("../lib/rating-gate.js");

const pick = (src, re, label) => {
  const m = src.match(re);
  if (!m) throw new Error(`${label} not found — the parity check cannot run`);
  return Number(m[1]);
};

describe("rating prior parity (MEH-2617)", () => {
  it("RATING_PRIOR_MEAN is the same number on the backend and in rating-gate.js", () => {
    expect(pick(JS, /RATING_PRIOR_MEAN = ([\d.]+);/, "JS mean")).toBe(
      pick(PY, /^RATING_PRIOR_MEAN = ([\d.]+)$/m, "PY mean"),
    );
  });

  it("RATING_PRIOR_WEIGHT is the same number on the backend and in rating-gate.js", () => {
    expect(pick(JS, /RATING_PRIOR_WEIGHT = ([\d.]+);/, "JS weight")).toBe(
      pick(PY, /^RATING_PRIOR_WEIGHT = ([\d.]+)$/m, "PY weight"),
    );
  });
});
