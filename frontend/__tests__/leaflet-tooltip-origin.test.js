import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// MEH-1682: pins the Leaflet fact our `.leaflet-tooltip { left: 0 }` override
// rests on, read from the installed stylesheet at runtime.
//
// WHY THIS EXISTS
//   Leaflet positions a tooltip by writing `transform: translate3d(x, y, 0)`
//   (DomUtil.setPosition) onto a box its own stylesheet declares only as
//   `position: absolute` — with NO `left` and NO `right`. A positioned box with
//   both offsets `auto` falls back to its STATIC position, and CSS anchors that
//   to the containing block's INLINE start: the left edge in LTR, the right edge
//   in RTL. Leaflet's arithmetic assumes the LTR case, so under
//   `html { direction: rtl }` the identical transform lands the tooltip exactly
//   one tooltip-width toward the inline start — detached from its pin.
//   (Leaflet #7201, open upstream since 2020, present in 1.9.4.)
//
//   Measured on a real producer page at 1440, primary pin, transform identical
//   in every row: rtl+no rule → computed left -138.672px, centre off by
//   -139.3px (tooltip width 138.7px — the error IS the width); ltr+no rule →
//   0px / -0.7px; ltr+rule → 0px / -0.7px (a measured no-op, which is why the
//   override is unconditional); rtl+rule → 0px / -0.7px.
//
//   That whole chain is invalidated the moment Leaflet starts declaring a
//   horizontal offset itself. If a release adds `left`, `right`, or an `inset*`
//   shorthand to this rule, our override either becomes redundant or starts
//   fighting the library — and nothing else in the repo would notice, because
//   the failure is silent: the tooltip simply drifts again.
//
// WHAT THIS DOES NOT DO
//   It does not measure rendered geometry — that is a browser job, and it lives
//   in frontend/e2e/qa-meh1682-tooltip-rtl.mjs, which hovers a real pin and
//   asserts the tooltip's rect against the pin's. This file pins only the
//   dependency premise plus the presence of our override.
//
// Reads the files rather than importing them: vitest runs with `css: false`
// (vitest.config.js), so an import would yield no usable text.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (...segments) =>
  // leaflet.css ships CRLF; normalise so every regex below can assume \n.
  readFileSync(path.join(HERE, ...segments), "utf8").replaceAll("\r\n", "\n");

const leafletCss = read("..", "node_modules", "leaflet", "dist", "leaflet.css");
const globalsCss = read("..", "app", "globals.css");

const TOOLTIP = ".leaflet-tooltip";

/**
 * The declaration block following a selector, matched at a line start so a
 * selector that is a literal PREFIX of a longer one cannot be mistaken for it —
 * `.leaflet-tooltip` prefixes `.leaflet-tooltip-top`, `.leaflet-tooltip-left`
 * and several others that really do exist in this stylesheet, so a bare
 * indexOf would return the wrong rule.
 */
function ruleBody(css, selector) {
  const escaped = selector.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  const start = css.search(new RegExp(String.raw`^${escaped}\s*[,{]`, "m"));
  if (start === -1) return null;
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  if (open === -1 || close === -1) return null;
  return css.slice(open + 1, close);
}

/** Last-wins declared value of `property` in a rule body, or null. */
function declaredValue(body, property) {
  if (body === null) return null;
  const matches = [
    ...body.matchAll(new RegExp(String.raw`(?:^|;)\s*${property}\s*:\s*([^;]+)`, "g")),
  ];
  return matches.length > 0 ? matches.at(-1)[1].trim() : null;
}

describe("MEH-1682 — the tooltip positioning origin Leaflet leaves undefined", () => {
  it("finds the rule in the installed stylesheet (guards a parser no-op)", () => {
    // Without this every assertion below could pass vacuously on a file whose
    // format drifted — the self-disabling class MEH-1030 closed for registries.
    expect(leafletCss.length).toBeGreaterThan(0);
    expect(ruleBody(leafletCss, TOOLTIP)).not.toBeNull();
  });

  it("(a) Leaflet positions the tooltip absolutely", () => {
    expect(declaredValue(ruleBody(leafletCss, TOOLTIP), "position")).toBe("absolute");
  });

  it("(b) Leaflet declares NO horizontal offset — so the static position is used", () => {
    const body = ruleBody(leafletCss, TOOLTIP);
    // Each asserted separately rather than behind one `||`: a combined condition
    // would let a future `right: 0` hide behind a still-absent `left`, and the
    // failure message would not say which one appeared.
    expect(declaredValue(body, "left")).toBeNull();
    expect(declaredValue(body, "right")).toBeNull();
    expect(declaredValue(body, "inset")).toBeNull();
    expect(declaredValue(body, "inset-inline-start")).toBeNull();
    expect(declaredValue(body, "inset-inline")).toBeNull();
  });

  it("(c) our override supplies that missing origin, physically", () => {
    // `left`, never `inset-inline-start`: the point is to pin the origin to ONE
    // physical edge in both directions, which is precisely what a logical
    // property refuses to do. Deleting this rule reds here and in the e2e probe.
    expect(declaredValue(ruleBody(globalsCss, TOOLTIP), "left")).toBe("0");
  });

  it("therefore: the override is load-bearing and non-conflicting", () => {
    // The conjunction, stated once as an executable sentence. If any leg flips,
    // the measured table in globals.css is stale and must be re-derived — do not
    // simply update the prose to match.
    const leafletBody = ruleBody(leafletCss, TOOLTIP);
    const leafletLeavesOriginUndefined =
      declaredValue(leafletBody, "left") === null &&
      declaredValue(leafletBody, "right") === null;
    const weSupplyIt = declaredValue(ruleBody(globalsCss, TOOLTIP), "left") === "0";

    expect(leafletLeavesOriginUndefined).toBe(true);
    expect(weSupplyIt).toBe(true);
  });
});
