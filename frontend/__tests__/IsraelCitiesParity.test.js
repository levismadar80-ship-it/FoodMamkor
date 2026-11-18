import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { ISRAEL_CITIES } from "@/data/cities";

/**
 * MEH-3337 — ISRAEL_CITIES matches the backend copy, mechanically.
 *
 * `frontend/data/cities.js` and `backend/app/data/cities.py` both carry the
 * list, and both promise "byte-for-byte … same order". Until this test that
 * promise was prose only (Smell #2 in workflow.md). Same shape as
 * CityAliasParity.test.js (MEH-2797): read the PYTHON source, compare both
 * directions and the order.
 *
 * DISCRIMINATION — each case fails against a plausible wrong change:
 *   - add a city to the backend only   → "every backend city is on the frontend"
 *   - add a city to the frontend only  → "no frontend-only city"
 *   - reorder one side                 → "same order"
 *   - break the Python parse           → the control in backendCities()
 */

const PY = path.resolve(__dirname, "..", "..", "backend", "app", "data", "cities.py");

/** The backend's ISRAEL_CITIES, parsed out of the source (comments dropped). */
function backendCities() {
  const src = readFileSync(PY, "utf8");
  const block = src.match(/\nISRAEL_CITIES = \[([\s\S]*?)\n\]/);
  // CONTROL, before any comparison: an empty list would make every check
  // below pass vacuously.
  expect(block, "ISRAEL_CITIES not found in cities.py — the parse broke").toBeTruthy();
  const out = [];
  for (const line of block[1].split("\n")) {
    const code = line.replace(/#.*$/, "");
    // Both quote styles: ruff single-quotes a name that holds a double quote
    // (כרם מהר"ל), so a "…"-only parse silently dropped it.
    for (const m of code.matchAll(/"([^"]+)"|'([^']+)'/g)) out.push(m[1] ?? m[2]);
  }
  expect(out.length, "parsed almost no cities").toBeGreaterThan(50);
  return out;
}

describe("ISRAEL_CITIES parity with the backend", () => {
  it("every backend city is on the frontend", () => {
    const front = new Set(ISRAEL_CITIES);
    const missing = backendCities().filter((c) => !front.has(c));
    expect(missing, "add these to frontend/data/cities.js").toEqual([]);
  });

  it("no frontend-only city", () => {
    const back = new Set(backendCities());
    const extra = ISRAEL_CITIES.filter((c) => !back.has(c));
    expect(extra, "add these to backend/app/data/cities.py").toEqual([]);
  });

  it("same order (both files promise it for easy diffing)", () => {
    expect(ISRAEL_CITIES).toEqual(backendCities());
  });
});
