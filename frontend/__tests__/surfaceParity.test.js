/**
 * MEH-2767 — one catalog, one chip set, on all three discovery surfaces.
 *
 * Sapir's two screenshots (06/11) showed the «סינון» sheet on /producers and on
 * /map offering different axes for the same catalog: «תזונה» on one and not the
 * other, «גראס פד» and «פתוחים להזמנות עכשיו» on the map only. The taxonomy was
 * already one declaration; the GATE was three implementations that drifted.
 *
 * Three guards, each one a different way the drift came back:
 *   1. membership — every surface is declared with the same axes;
 *   2. gating     — the map adapter and the listing gate agree on every
 *                   catalog shape below;
 *   3. one path   — no component reaches past visibleAxisChips to a
 *                   per-surface gate primitive (that is how home ended up
 *                   counting its first screenful of FILTERED results).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it, expect } from "vitest";

import {
  FILTER_AXES,
  LISTING_CHIP_ORDER,
  MAP_CHIP_ORDER,
  axisKeysFor,
} from "@/lib/filter-taxonomy";
import {
  CHIPS_CONFIG,
  DIET_CHIP_MIN,
  GATED_AXIS_PREDICATES,
  PRODUCERS_CHIPS_CONFIG,
  visibleAxisChips,
} from "@/lib/producer-filters";
import { TOGGLE_CHIPS, visibleMapToggleChips } from "@/lib/map-chips";

const sorted = (chips) => chips.map((c) => c.key).sort();

// A fixed Wednesday noon (Asia/Jerusalem), passed explicitly as `now`, so
// "open now" never depends on when the suite runs.
const NOW = new Date("2026-11-04T10:00:00Z");
const ALL_DAY = { wednesday: [{ open: "00:00", close: "23:59" }] };
// Truthy (passes coverage) and open on no day (MEH-2131's zero-result case).
const NEVER_OPEN = {};

const FLAGS = {
  vegan: "has_vegan_products",
  vegetarian: "has_vegetarian_products",
  gluten_free: "has_gluten_free_products",
  lactose_free: "has_lactose_free_products",
  no_added_sugar: "has_no_added_sugar_products",
  on_site: "sells_on_site",
  grass_fed: "grass_fed",
};

function catalog(n, extra = {}) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `עסק ${i}`, ...extra }));
}
const allFlags = Object.fromEntries(Object.values(FLAGS).map((f) => [f, true]));

const CATALOGS = {
  empty: [],
  "one below the threshold, everything marked": catalog(DIET_CHIP_MIN - 1, { ...allFlags, order_window: ALL_DAY }),
  "at the threshold, everything marked": catalog(DIET_CHIP_MIN, { ...allFlags, order_window: ALL_DAY }),
  "only vegan + grass_fed": catalog(DIET_CHIP_MIN, { has_vegan_products: true, grass_fed: true }),
  "windows declared, none open": catalog(DIET_CHIP_MIN, { order_window: NEVER_OPEN }),
};

describe("MEH-2767 — 1. membership: every surface declares the same axes", () => {
  it("home, /producers and /map offer one axis set", () => {
    const map = axisKeysFor("map", MAP_CHIP_ORDER).sort();
    expect(axisKeysFor("producers", LISTING_CHIP_ORDER).sort()).toEqual(map);
    expect(axisKeysFor("home", LISTING_CHIP_ORDER).sort()).toEqual(map);
    // And the configs the components actually mount are those sets.
    expect(sorted(TOGGLE_CHIPS)).toEqual(map);
    expect(sorted(PRODUCERS_CHIPS_CONFIG)).toEqual(map);
    expect(sorted(CHIPS_CONFIG)).toEqual(map);
  });

  it("grass_fed — the axis Sapir saw on the map only — is on all three", () => {
    expect(FILTER_AXES.grass_fed.surfaces.sort()).toEqual(["home", "map", "producers"]);
  });
});

describe("MEH-2767 — 1b. every count-gated axis can be counted", () => {
  it("each `gate: \"count\"` axis has a predicate (else the gate fails open)", () => {
    const missing = Object.keys(FILTER_AXES).filter(
      (k) => FILTER_AXES[k].gate === "count" && typeof GATED_AXIS_PREDICATES[k] !== "function",
    );
    expect(missing).toEqual([]);
  });
});

describe("MEH-2767 — 2. gating: the same catalog yields the same chips everywhere", () => {
  for (const [name, cat] of Object.entries(CATALOGS)) {
    it(`agrees on: ${name}`, () => {
      const map = sorted(visibleMapToggleChips({ catalogSnapshot: cat, now: NOW }));
      const listing = sorted(visibleAxisChips({ chips: PRODUCERS_CHIPS_CONFIG, catalog: cat, status: "ready", now: NOW }));
      const home = sorted(visibleAxisChips({ chips: CHIPS_CONFIG, catalog: cat, status: "ready", now: NOW }));
      expect(listing).toEqual(map);
      expect(home).toEqual(map);
    });
  }

  it("CONTROL: the catalogs above actually move the gate (else agreement is vacuous)", () => {
    const empty = sorted(visibleMapToggleChips({ catalogSnapshot: [], now: NOW }));
    const full = sorted(visibleMapToggleChips({ catalogSnapshot: CATALOGS["at the threshold, everything marked"], now: NOW }));
    expect(empty).not.toContain("vegan");
    expect(empty).not.toContain("grass_fed");
    expect(empty).not.toContain("open_for_orders_now");
    expect(full).toContain("vegan");
    expect(full).toContain("grass_fed");
    expect(full).toContain("open_for_orders_now");
    // Ungated axes survive an empty catalog.
    for (const key of ["kosher", "verified", "has_delivery", "pickup_points"]) {
      expect(empty).toContain(key);
    }
  });

  it("an active axis keeps its chip on every surface", () => {
    const chipState = { vegan: true, grass_fed: true, open_for_orders_now: true };
    for (const chips of [
      visibleMapToggleChips({ catalogSnapshot: [], chipState, now: NOW }),
      visibleAxisChips({ chips: PRODUCERS_CHIPS_CONFIG, catalog: [], status: "ready", chipState, now: NOW }),
      visibleAxisChips({ chips: CHIPS_CONFIG, catalog: [], status: "ready", chipState, now: NOW }),
    ]) {
      expect(sorted(chips)).toEqual(expect.arrayContaining(["grass_fed", "open_for_orders_now", "vegan"]));
    }
  });
});

describe("MEH-2767 — 2b. a failed snapshot keeps the listing guards", () => {
  it("falls back to the page's own catalog, so open-now stays gated", () => {
    const visible = sorted(
      visibleAxisChips({ chips: PRODUCERS_CHIPS_CONFIG, status: "failed", fallbackCatalog: [], now: NOW }),
    );
    expect(visible).not.toContain("open_for_orders_now");
    expect(visible).not.toContain("vegan");
    expect(visible).toContain("kosher");
  });

  it("with no fallback (/map) a failed snapshot hides nothing — unknown is not zero", () => {
    expect(sorted(visibleMapToggleChips({ catalogSnapshot: null, now: NOW }))).toEqual(sorted(TOGGLE_CHIPS));
  });

  it("`complete: false` keeps open-now's zero-result half from hiding the chip", () => {
    const cat = CATALOGS["windows declared, none open"];
    const args = { chips: PRODUCERS_CHIPS_CONFIG, catalog: cat, status: "ready", now: NOW };
    expect(sorted(visibleAxisChips({ ...args, complete: true }))).not.toContain("open_for_orders_now");
    expect(sorted(visibleAxisChips({ ...args, complete: false }))).toContain("open_for_orders_now");
  });
});

describe("MEH-2767 — 3. one path: components gate only through visibleAxisChips", () => {
  // The per-surface primitives. lib/ may compose them; a component may not.
  const PRIMITIVES = ["openNowChipVisible", "visibleGatedDietKeys", "GATED_DIET_KEYS", "DIET_GATED_KEYS", "GATED_AXIS_PREDICATES"];
  const ROOT = join(__dirname, "..");
  const walk = (dir) =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return walk(p);
      return /\.(jsx?|tsx?)$/.test(name) ? [p] : [];
    });
  const files = [...walk(join(ROOT, "components")), ...walk(join(ROOT, "app"))];

  it("CONTROL: the scan sees the components that gate chips", () => {
    const rel = files.map((f) => relative(ROOT, f));
    expect(rel).toContain("components/ProducersClient.jsx");
    expect(rel).toContain("app/[locale]/home/HomeProducersGrid.jsx");
    expect(files.length).toBeGreaterThan(100);
  });

  it("no component imports a per-surface gate primitive", () => {
    const offenders = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const name of PRIMITIVES) {
        if (new RegExp(`\\b${name}\\b`).test(src.replace(/\/\/.*$/gm, ""))) {
          offenders.push(`${relative(ROOT, f)}: ${name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
