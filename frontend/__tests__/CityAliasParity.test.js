import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { CITY_ALIASES, canonicalCity } from "@/data/cities";

/**
 * MEH-2797 — the frontend alias map matches the backend's, mechanically.
 *
 * `data/cities.js` carries a second copy of `CITY_ALIASES` from
 * `backend/app/data/cities.py`, because the delivery checker matches
 * client-side and needs to fold «בנימינה» into «בנימינה-גבעת עדה».
 *
 * A second copy of one fact is the architectural smell the workflow rules name
 * — and the cure they prescribe is enforcement, not a note. The file right
 * above this map already carries the OTHER kind: ISRAEL_CITIES' prose "SYNC
 * DUTY (MEH-1349) … must land there in the same PR", with nothing checking it.
 * This test is what keeps the alias map from becoming a second one of those.
 *
 * It reads the PYTHON as the source of truth and compares both directions, so
 * adding an alias on either side alone goes red.
 *
 * DISCRIMINATION — each case fails against a plausible wrong change:
 *   - add an alias to the backend only       → "every backend alias is mirrored"
 *   - add one to the frontend only           → "no frontend-only alias"
 *   - point an alias at a different city     → the value comparison
 *   - break the Python parse                 → the control below
 */

const PY = path.resolve(
  __dirname,
  "..",
  "..",
  "backend",
  "app",
  "data",
  "cities.py",
);

/** The backend's CITY_ALIASES, parsed out of the source. */
function backendAliases() {
  const src = readFileSync(PY, "utf8");
  const block = src.match(/CITY_ALIASES: dict\[str, str\] = \{([\s\S]*?)\n\}/);
  // CONTROL, and it runs before any comparison: if the Python layout changes
  // and this stops matching, an empty map would make every assertion below
  // pass vacuously — "0 differences" also meaning "nothing was read".
  expect(block, "CITY_ALIASES not found in cities.py — the parse broke").toBeTruthy();
  const out = {};
  for (const m of block[1].matchAll(/^\s*(?:"([^"]+)"|'([^']+)'):\s*"([^"]+)",/gm)) {
    out[m[1] ?? m[2]] = m[3];
  }
  expect(Object.keys(out).length, "parsed no aliases at all").toBeGreaterThan(5);
  return out;
}

describe("CITY_ALIASES parity with the backend", () => {
  it("every backend alias is mirrored on the frontend, to the same city", () => {
    const backend = backendAliases();
    const missing = Object.entries(backend)
      .filter(([alias, canon]) => CITY_ALIASES[alias] !== canon)
      .map(([alias, canon]) => `${alias} → ${canon} (frontend: ${CITY_ALIASES[alias] ?? "absent"})`);
    expect(missing, "add these to frontend/data/cities.js").toEqual([]);
  });

  it("no frontend-only alias — the backend stays the source of truth", () => {
    const backend = backendAliases();
    const extra = Object.keys(CITY_ALIASES).filter((a) => !(a in backend)).sort();
    expect(extra, "these exist only on the frontend").toEqual([]);
  });

  it("the two maps are the same size", () => {
    // Derived from both sides, so neither a silent drop nor a silent add slips
    // past the two directional checks above.
    expect(Object.keys(CITY_ALIASES).length).toBe(Object.keys(backendAliases()).length);
  });
});

describe("canonicalCity", () => {
  it("folds a known alias to the official name", () => {
    expect(canonicalCity("בנימינה")).toBe("בנימינה-גבעת עדה");
    expect(canonicalCity("מודיעין")).toBe("מודיעין-מכבים-רעות");
  });

  it("is a no-op on a name that is already official", () => {
    expect(canonicalCity("בנימינה-גבעת עדה")).toBe("בנימינה-גבעת עדה");
    expect(canonicalCity("זכרון יעקב")).toBe("זכרון יעקב");
  });

  it("never invents a city — an unknown name comes back as given", () => {
    // Load-bearing: if this started guessing, the checker would answer "yes"
    // for towns a business does not serve, which is worse than the bug it fixes.
    expect(canonicalCity("עיר שלא קיימת")).toBe("עיר שלא קיימת");
    expect(canonicalCity("  חדרה  ")).toBe("חדרה");
  });

  it("handles null/empty without throwing", () => {
    expect(canonicalCity(null)).toBe("");
    expect(canonicalCity("")).toBe("");
    expect(canonicalCity("   ")).toBe("");
  });
});
