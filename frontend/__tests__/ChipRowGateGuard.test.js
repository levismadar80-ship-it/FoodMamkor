// MEH-3128: every chip row in the app is gated — a chip that would open on an
// empty result is not drawn. Sapir, 14/11: «למה להציג סינונים שלא מביאים לשום
// מקום … תקבע מנגנון שיימנע מזה לקרות».
//
// How it works (the DashboardPlacementGuard / MEH-2885 shape): every place
// the code hands a `chips={…}` prop to a component is listed below, with the
// gate that removes its empty chips — or, for a row that is not a filter, the
// reason it needs none. A NEW chip row that is not listed fails this test,
// so it cannot ship without someone writing down how its zero case is
// handled. A listed site that disappears fails too (no stale rows).
//
// The three gates: visibleAxisChips (lib/producer-filters.js, MEH-2767) ·
// visibleCategoryChips (lib/event-category-gate.js, MEH-3124) · dropZeroChips
// (lib/chip-gate.js, MEH-3128). `gateToken` must appear in the file, so a
// listed gate that is deleted goes red as well.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const SCAN = ["app", "components", "lib"];

// key: "<file relative to frontend/>::<chips expression's first token>"
const REGISTRY = {
  "app/[locale]/group-buys/GroupBuysClient.jsx::dropZeroChips": { gateToken: "dropZeroChips" },
  "app/[locale]/events/EventsClient.jsx::shownChips": { gateToken: "visibleCategoryChips" },
  "app/[locale]/home/HomeProducersGrid.jsx::gatedChips": { gateToken: "visibleAxisChips" },
  "app/[locale]/home/HomeProducersGrid.jsx::sheetChips": { gateToken: "visibleAxisChips" },
  "components/ProducersClient.jsx::visibleChipDefs": { gateToken: "visibleAxisChips" },
  "components/ProducersClient.jsx::sheetChips": { gateToken: "visibleAxisChips" },
  // categories with no live business are dropped (visibleCategories, MEH-2131)
  "components/ProducersClient.jsx::categoryChips": { gateToken: "visibleCategories" },
  "app/[locale]/map/components/FilterChipsBar.jsx::categoryChipsWithIcons": { gateToken: "visibleCategoryChips" },
  "app/[locale]/map/components/FilterChipsBar.jsx::visibleToggleChips": { gateToken: "visibleToggleChips" },
  // Not filters, or a pass-through of a row already gated upstream:
  "app/[locale]/favorites/FavoritesClient.jsx::FILTERS": {
    exempt:
      "the reader's own saved items, not a discovery filter: every chip shows its count " +
      "(the counts approach, MEH-2560), and a type with 0 opens its own guiding empty " +
      "state («עדיין לא שמרת אירועים») — FavoritesSavedItems.test.jsx pins it",
  },
  "components/ProducersClient.jsx::cityRowChips": {
    exempt: "the chosen city as one chip that opens the city picker — not a filter value",
  },
  "app/[locale]/home/HomeClient.jsx::chips": {
    exempt: "pass-through: HomeProducersGrid gates it (gatedChips, visibleAxisChips)",
  },
  "app/[locale]/map/components/ServiceChipRow.jsx::chips": {
    exempt: "pass-through: FilterChipsBar hands it visibleToggleChips (gated in useMapFilters)",
  },
};

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(jsx?|tsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Every `chips={X…}` site in the app, as REGISTRY keys. */
function findChipSites(root = ROOT) {
  const sites = [];
  for (const top of SCAN) {
    for (const file of walk(path.join(root, top))) {
      const src = fs.readFileSync(file, "utf8");
      for (const m of src.matchAll(/\bchips=\{\s*([A-Za-z_$][\w$]*)/g)) {
        sites.push(`${path.relative(root, file).split(path.sep).join("/")}::${m[1]}`);
      }
    }
  }
  return sites;
}

describe("every chip row hides chips with no results (MEH-3128)", () => {
  const sites = findChipSites();

  it("the scan sees the rows it must see (control: a dead scan would pass everything)", () => {
    // Anchored to real files: if the regex or the walk broke, these vanish.
    expect(sites).toContain("app/[locale]/events/EventsClient.jsx::shownChips");
    expect(sites).toContain("components/ProducersClient.jsx::visibleChipDefs");
    expect(sites.length).toBeGreaterThanOrEqual(Object.keys(REGISTRY).length);
  });

  it("a new chip row must be listed with its gate (or a reason it needs none)", () => {
    const unlisted = [...new Set(sites)].filter((s) => !(s in REGISTRY));
    expect(
      unlisted,
      "New chip row(s). Pass the chips through visibleAxisChips / visibleCategoryChips / " +
        "dropZeroChips so a chip with 0 results is not drawn, then list the site in " +
        "__tests__/ChipRowGateGuard.test.js — or list it with `exempt: <reason>` if it is not a filter.",
    ).toEqual([]);
  });

  it("no listed row is stale, and each gated row's file still calls its gate", () => {
    const seen = new Set(sites);
    for (const [key, entry] of Object.entries(REGISTRY)) {
      expect(seen.has(key), `${key} is listed but no longer in the code`).toBe(true);
      if (entry.exempt) {
        expect(entry.exempt.length, `${key}: an exemption needs a reason`).toBeGreaterThan(10);
        continue;
      }
      const file = key.split("::")[0];
      const src = fs.readFileSync(path.join(ROOT, file), "utf8");
      expect(src.includes(entry.gateToken), `${file} no longer uses ${entry.gateToken}`).toBe(true);
    }
  });
});

import { dropZeroChips } from "@/lib/chip-gate";

describe("dropZeroChips (MEH-3128)", () => {
  const chips = [{ key: "all" }, { key: "open" }, { key: "funded" }, { key: "fulfilled" }];
  const keys = (out) => out.map((c) => c.key);

  it("unknown counts → every chip (fail open)", () => {
    expect(keys(dropZeroChips({ chips, counts: null }))).toEqual(["all", "open", "funded", "fulfilled"]);
  });
  it("0 → dropped; many → kept", () => {
    expect(keys(dropZeroChips({ chips, counts: { open: 2, funded: 0, fulfilled: 5 }, keep: ["all"] })))
      .toEqual(["all", "open", "fulfilled"]);
  });
  it("the active chip stays even at 0 (the way back)", () => {
    expect(keys(dropZeroChips({ chips, counts: { all: 0, open: 0, funded: 0, fulfilled: 0 }, active: ["open"] })))
      .toEqual(["open"]);
  });
  it("a chip with no number in counts stays (partial knowledge fails open)", () => {
    expect(keys(dropZeroChips({ chips, counts: { open: 0 }, keep: ["all"] })))
      .toEqual(["all", "funded", "fulfilled"]);
  });
});
