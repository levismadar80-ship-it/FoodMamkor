import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// MEH-1659: pins the two Leaflet behaviours MiniMap's expand affordance is
// BUILT ON, read from the installed bundle at runtime.
//
// WHY THIS EXISTS
//   `.claude/rules/frontend.md` § Maintenance: a claim about a dependency's
//   behaviour that guides a code decision needs a test that re-derives it from
//   node_modules, not a sentence. MiniMap makes exactly two such claims, and
//   both are load-bearing:
//
//   1. **Leaflet ships no `tap` handler.** `InteractionMode` walks a list of
//      handler names and skips any the map does not have (`if (!handler)
//      continue`). That guard exists solely because `tap` was in the old
//      disable-list and is absent in 1.9.x. If a future Leaflet reintroduces
//      `Map.Tap`, the guard stops being a no-op and starts silently gating a
//      real gesture handler — worth knowing at that moment, not later.
//   2. **Controls stop their own clicks from reaching the map.** The whole
//      canvas-tap-to-expand design rests on this: pressing +/− or the OSM
//      attribution link must NOT open the fullscreen overlay. Nothing in
//      MiniMap implements that exclusion — Leaflet's
//      `DomEvent.disableClickPropagation` on each control container is what
//      does. Lose it upstream and every zoom press opens the overlay, with no
//      error and nothing else in the suite noticing.
//
//   Sibling precedents, same mechanism: leaflet-attribution-default.test.js
//   (MEH-1636), leaflet-inline-writers.test.js (MEH-1637).
//
// WHAT THIS DOES NOT DO
//   It does not assert runtime behaviour in a browser — that lives in
//   e2e/qa-meh1659-minimap-expand.mjs, which measures the rendered DOM. This
//   file pins the source-level facts those measurements are explained BY, so a
//   future upgrade that changes them fails here instead of turning into a
//   mystery in the QA run.
//
// Reads the file rather than importing it: the assertions are about what the
// bundle contains, and the ESM entry would only expose the assembled API.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const LEAFLET_SRC = path.join(HERE, "..", "node_modules", "leaflet", "dist", "leaflet-src.js");
const source = readFileSync(LEAFLET_SRC, "utf8");

describe("MEH-1659 — Leaflet interaction contract MiniMap depends on", () => {
  it("registers no `tap` handler — so InteractionMode's missing-handler guard stays a no-op", () => {
    // Handlers are attached via `Map.addInitHook('addHandler', '<name>', Klass)`.
    // The name in that call IS the property the map exposes.
    const hooks = [...source.matchAll(/addInitHook\('addHandler',\s*'([^']+)'/g)].map((m) => m[1]);

    // Guard the guard: if this regex ever stops matching Leaflet's source shape
    // the assertion below would pass on an empty list and prove nothing.
    expect(hooks.length).toBeGreaterThan(5);
    expect(hooks).toContain("dragging");
    expect(hooks).toContain("touchZoom");
    expect(hooks).toContain("keyboard");

    // The claim itself. `tapHold` exists and is a different thing (it
    // synthesizes contextmenu on long press) — it is NOT a gesture handler
    // MiniMap enables or disables.
    expect(hooks).not.toContain("tap");
  });

  it("disables click propagation on the zoom control's buttons and the attribution container", () => {
    // Zoom buttons: Control.Zoom._createButton wires disableClickPropagation +
    // stop() on each link, which is why a +/− press never reaches map.on("click").
    const createButton = source.slice(
      source.indexOf("_createButton: function (html, title"),
      source.indexOf("_updateDisabled: function ()"),
    );
    expect(createButton).toContain("disableClickPropagation(link)");
    expect(createButton).toContain("on(link, 'click', stop)");

    // Attribution control: same protection on its container, so clicking the
    // OSM link opens the link and does not expand the map.
    const attribution = source.slice(
      source.indexOf("var Attribution = Control.extend("),
      source.indexOf("Map.mergeOptions({\n  \t// @section Control options"),
    );
    expect(attribution).toContain("disableClickPropagation(this._container)");
  });
});
