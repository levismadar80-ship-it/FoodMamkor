import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// MEH-1637: pins which CSS properties Leaflet and markercluster write as INLINE
// styles, read from the installed bundles at runtime.
//
// WHY THIS EXISTS
//   `.claude/rules/frontend.md` tells every Claude Code session that a marker
//   fade must ride `filter: opacity()` rather than the `opacity` property. The
//   sole reason is a NEGATIVE: neither library writes `filter` inline on any
//   path a browser reaches, so `filter` is the one channel a class rule can win
//   on. Inline styles beat class rules, so if a future release starts writing
//   `filter` inline the fade stops applying — silently. No build error, no
//   failing test, and the rule file keeps reading correctly. That is the
//   MEH-1611 regression shape, and nothing in this repo would red on it.
//
//   A rule file is not documentation. It is injected into every session and the
//   agent trusts it over its own observation, so a stale line there is worse
//   than no line at all. This file re-derives the claim from node_modules on
//   every run.
//
// WHAT PHASE 0 FOUND (leaflet 1.9.4 · leaflet.markercluster 1.5.3)
//   Two things the rule file asserted are not literally true, and the
//   assertions below are written to the truth rather than to the prose:
//
//   1. Leaflet DOES contain one inline `filter` write — `leaflet-src.js:2506`,
//      inside `_setOpacityIE`. It is IE 8 dead code: `setOpacity` only calls it
//      in the `else` arm taken when `'opacity' in el.style` is false, which no
//      browser this app supports ever satisfies. So the *behavioural* claim
//      holds and the *absolute* one does not. (d) pins the precise shape: that
//      write is the ONLY one, and it sits behind that guard. A second one
//      anywhere reds.
//   2. markercluster's `clusterShow()` does not assign `opacity` itself — it
//      delegates (`leaflet.markercluster-src.js:1835` → `Marker.setOpacity`
//      `leaflet-src.js:8038` → `_updateOpacity` `:8047` → `DomUtil.setOpacity`
//      `:2479` → `el.style.opacity` `:2481`). (c) pins the delegation chain,
//      which is what actually makes "markercluster re-applies opacity" true.
//
// WHAT THIS DOES NOT DO
//   It does not parse JavaScript. There is no AST dependency and none is
//   wanted — the detector below recognises inline-style ASSIGNMENT syntax and
//   nothing else, which is the whole point: the word `filter` appears 26 times
//   in leaflet-src.js (array filtering, GeoJSON's `filter` option, IE comments)
//   and a substring match would make (d) a permanent false pass.
//
//   Because it is not a parser, it is fail-closed instead: any computed style
//   write it cannot resolve to a concrete property name reds the guard rather
//   than being skipped. A detector that silently sees less than it should is
//   the failure mode this test exists to prevent, not one it may commit.
//
// Reads the files rather than importing them: these are UMD bundles that touch
// `window` at load, and nothing here needs them evaluated.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LEAFLET_SRC = path.join(
  HERE,
  "..",
  "node_modules",
  "leaflet",
  "dist",
  "leaflet-src.js",
);
const MARKERCLUSTER_SRC = path.join(
  HERE,
  "..",
  "node_modules",
  "leaflet.markercluster",
  "dist",
  "leaflet.markercluster-src.js",
);

const read = (file) => readFileSync(file, "utf8").replaceAll("\r\n", "\n");
const leaflet = read(LEAFLET_SRC);
const markercluster = read(MARKERCLUSTER_SRC);

/** 1-based line number of a character index, for evidence in failure messages. */
function lineAt(src, index) {
  return src.slice(0, index).split("\n").length;
}

/**
 * Body of a named function, brace-matched.
 *
 * Handles both forms these bundles use: `function name(…) {` (Leaflet's module
 * scope) and `name: function (…) {` (the object-literal mixins both libraries
 * build prototypes from). Skips string literals and comments while counting, so
 * a brace inside `'{'` or a comment cannot end the body early.
 *
 * Returns null when the name is absent — the guard turns that into a red rather
 * than letting a downstream assertion pass on an empty string.
 *
 * The declaration must begin a line (indentation only). Leaflet documents every
 * DomUtil export with a `// @function setTransform(el: HTMLElement, …)` comment
 * immediately above the real one, and an unanchored pattern matches the comment
 * first — then brace-matches forward into the function anyway and returns a
 * body that looks perfectly valid. Found by negative control 1: renaming
 * `setTransform` in the installed copy left this guard GREEN, because the doc
 * comment still carried the name. An assertion that cannot tell the healthy
 * state from the broken one is the exact defect this file is here to prevent.
 */
function functionBody(src, name) {
  const escaped = name.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  const declaration = new RegExp(
    String.raw`^[ \t]*(?:function\s+${escaped}\s*\(|${escaped}\s*:\s*function\s*\()`,
    "m",
  );
  const match = declaration.exec(src);
  if (match === null) return null;

  const open = src.indexOf("{", match.index + match[0].length);
  if (open === -1) return null;

  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const char = src[i];

    if (char === "'" || char === '"' || char === "`") {
      const quote = char;
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\") i++;
        i++;
      }
      continue;
    }
    if (char === "/" && src[i + 1] === "/") {
      i = src.indexOf("\n", i);
      if (i === -1) break;
      continue;
    }
    if (char === "/" && src[i + 1] === "*") {
      i = src.indexOf("*/", i);
      if (i === -1) break;
      i++;
      continue;
    }

    if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) {
        return { start: open, end: i, text: src.slice(open + 1, i) };
      }
    }
  }
  return null;
}

/**
 * Property-name lists behind `var NAME = testProp([...])`.
 *
 * Leaflet never writes `el.style.transform` literally — it writes
 * `el.style[TRANSFORM]`, where `TRANSFORM` is whichever of
 * `['transform', 'webkitTransform', …]` the browser supports. Resolving these
 * is what lets (a) assert on the property rather than on an identifier, and
 * what lets the fail-closed check below distinguish "computed, but known" from
 * "computed, unknown".
 */
function testPropTable(src) {
  const table = new Map();
  const declarations = src.matchAll(
    /(?:var|let|const)\s+([A-Za-z$_][\w$]*)\s*=\s*testProp\(\s*\[([^\]]*)\]/g,
  );
  for (const declaration of declarations) {
    const names = [...declaration[2].matchAll(/['"]([^'"]+)['"]/g)].map(
      (match) => match[1],
    );
    table.set(declaration[1], names);
  }
  return table;
}

/**
 * Identifiers aliased to a style object: `var style = document.documentElement.style;`
 *
 * Leaflet does this three times, then writes through the alias
 * (`style[userSelectProperty] = 'none'`, `leaflet-src.js:2592`). Without
 * tracking aliases those writes are invisible to a `.style[…]` matcher, and an
 * invisible write is exactly how a negative assertion goes quietly wrong.
 */
function styleAliases(src) {
  return [
    ...src.matchAll(
      /(?:var|let|const)\s+([A-Za-z$_][\w$]*)\s*=\s*[^;\n]*\.style\s*[;,\n]/g,
    ),
  ].map((match) => match[1]);
}

/**
 * Every inline-style property write in a source file.
 *
 * Each entry is `{ index, line, properties, form }`, where `properties` is the
 * set of CSS property names the write may target — one name for a literal, the
 * whole candidate list for a `testProp` identifier, and `null` for a computed
 * key that could not be resolved.
 *
 * `null` is never skipped. `assignsProperty` treats it as a match for every
 * property, so an unresolvable write reds both the guard and any negative
 * assertion that depends on completeness. Fail-closed by construction: the
 * detector answers "I cannot tell" instead of "no".
 */
function styleWrites(src) {
  const table = testPropTable(src);
  const aliases = styleAliases(src);
  const writes = [];

  const push = (index, properties, form) =>
    writes.push({ index, line: lineAt(src, index), properties, form });

  const resolve = (identifier) => table.get(identifier) ?? null;

  // `<expr>.style.prop =` / `+=`
  for (const match of src.matchAll(/\.style\.([A-Za-z$_][\w$]*)\s*\+?=[^=]/g)) {
    push(match.index, [match[1]], "member");
  }

  // `<expr>.style.setProperty('prop', …)`
  for (const match of src.matchAll(
    /\.style\.setProperty\(\s*['"]([^'"]+)['"]/g,
  )) {
    push(match.index, [match[1]], "setProperty");
  }

  // `<expr>.style['prop'] =` and `<expr>.style[IDENT] =`
  for (const match of src.matchAll(/\.style\s*\[\s*([^\]]+?)\s*\]\s*\+?=[^=]/g)) {
    const key = match[1].trim();
    const literal = /^['"]([^'"]+)['"]$/.exec(key);
    push(
      match.index,
      literal ? [literal[1]] : resolve(key),
      literal ? "computed-literal" : "computed-identifier",
    );
  }

  // `<alias>[IDENT] =` for each identifier aliased to a style object.
  for (const alias of aliases) {
    const escaped = alias.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
    for (const match of src.matchAll(
      new RegExp(String.raw`\b${escaped}\s*\[\s*([^\]]+?)\s*\]\s*\+?=[^=]`, "g"),
    )) {
      const key = match[1].trim();
      const literal = /^['"]([^'"]+)['"]$/.exec(key);
      push(
        match.index,
        literal ? [literal[1]] : resolve(key),
        literal ? "alias-literal" : "alias-identifier",
      );
    }
  }

  return writes;
}

/** Writes that target `property` — including unresolved ones (fail-closed). */
const assignsProperty = (writes, property) =>
  writes.filter(
    (write) => write.properties === null || write.properties.includes(property),
  );

const within = (write, body) =>
  body !== null && write.index > body.start && write.index < body.end;

const leafletWrites = styleWrites(leaflet);
const clusterWrites = styleWrites(markercluster);

const setTransform = functionBody(leaflet, "setTransform");
const setOpacity = functionBody(leaflet, "setOpacity");
const setOpacityIE = functionBody(leaflet, "_setOpacityIE");
const updateOpacity = functionBody(leaflet, "_updateOpacity");
const clusterShow = functionBody(markercluster, "clusterShow");

describe("MEH-1637 — what Leaflet and markercluster write as inline styles", () => {
  // ------------------------------------------------------------------
  // Guard. Runs first, on purpose: every assertion below is a statement
  // about what a text scan found, and a scan that found nothing would
  // satisfy the negative in (d) perfectly. Same self-disabling class
  // MEH-1030 closed for guarded registries.
  // ------------------------------------------------------------------
  it("guard — both bundles parsed, every named function located", () => {
    expect(leaflet.length).toBeGreaterThan(0);
    expect(markercluster.length).toBeGreaterThan(0);

    expect(setTransform, "setTransform not found in leaflet-src.js").not.toBeNull();
    expect(setOpacity, "setOpacity not found in leaflet-src.js").not.toBeNull();
    expect(setOpacityIE, "_setOpacityIE not found in leaflet-src.js").not.toBeNull();
    expect(updateOpacity, "_updateOpacity not found in leaflet-src.js").not.toBeNull();
    expect(
      clusterShow,
      "clusterShow not found in leaflet.markercluster-src.js",
    ).not.toBeNull();

    for (const body of [setTransform, setOpacity, setOpacityIE, clusterShow]) {
      expect(body.text.trim().length).toBeGreaterThan(0);
    }
  });

  it("guard — the style-write detector found writes in BOTH bundles", () => {
    // markercluster's only inline writes are `strokeDasharray` /
    // `strokeDashoffset` on the spiderfy legs. They carry no weight in any
    // claim here; their entire job is to prove the detector is live against
    // this file, so that (d)'s markercluster leg means "searched, found none"
    // rather than "did not search".
    expect(leafletWrites.length).toBeGreaterThan(0);
    expect(clusterWrites.length).toBeGreaterThan(0);
    expect(
      clusterWrites.some((write) => write.properties?.includes("strokeDashoffset")),
      "detector no longer sees markercluster's spiderfy leg writes",
    ).toBe(true);
  });

  it("guard — every computed style write resolves to a known property", () => {
    // `el.style[TRANSFORM]` and `style[userSelectProperty]` are resolvable via
    // their `testProp` declarations. An unresolvable one would mean the file
    // writes a property this test cannot name — at which point (d) can no
    // longer claim `filter` is absent, so it reds here instead of lying below.
    const unresolved = [...leafletWrites, ...clusterWrites].filter(
      (write) => write.properties === null,
    );
    expect(
      unresolved.map((write) => `${write.form} @ line ${write.line}`),
      "unresolvable computed style write — (d) cannot be trusted until it is named",
    ).toEqual([]);
  });

  // ------------------------------------------------------------------
  // (a) — (c): the positives.
  // ------------------------------------------------------------------
  it("(a) DomUtil.setTransform assigns the `transform` style property", () => {
    const writes = assignsProperty(leafletWrites, "transform").filter((write) =>
      within(write, setTransform),
    );
    expect(writes.length).toBeGreaterThan(0);
    // Written as `el.style[TRANSFORM]`, resolved through
    // `testProp(['transform', 'webkitTransform', …])` — the literal string
    // `el.style.transform` never appears in this bundle.
    expect(writes[0].form).toBe("computed-identifier");
  });

  it("(b) DomUtil.setOpacity assigns the `opacity` style property", () => {
    const writes = assignsProperty(leafletWrites, "opacity").filter((write) =>
      within(write, setOpacity),
    );
    expect(writes.length).toBeGreaterThan(0);
  });

  it("(c) markercluster's clusterShow re-applies opacity by DELEGATING to setOpacity", () => {
    // The ticket's phrasing was "clusterShow assigns opacity". It does not —
    // it has no style write of its own at all. What it has is a call, and the
    // chain behind that call is what makes the rule file's sentence true.
    expect(assignsProperty(clusterWrites, "opacity").filter((write) =>
      within(write, clusterShow),
    )).toEqual([]);
    expect(clusterShow.text).toMatch(/\bsetOpacity\s*\(/);

    // …and the far end of the chain: Marker._updateOpacity hands the icon to
    // DomUtil.setOpacity, whose `el.style.opacity` write (b) already pinned.
    expect(updateOpacity.text).toMatch(/setOpacity\s*\(\s*this\._icon\b/);
  });

  // ------------------------------------------------------------------
  // (d): the negative the marker fade rides on.
  // ------------------------------------------------------------------
  it("(d) markercluster writes no `filter` inline — it never mentions the word", () => {
    expect(assignsProperty(clusterWrites, "filter")).toEqual([]);
    // Stronger and independently true at 1.5.3: not one occurrence in any
    // context. Stated separately so that if a future release merely mentions
    // `filter` in a comment, this leg reds and the assertion above — the one
    // that carries the claim — stays green and keeps its meaning.
    expect(markercluster.includes("filter")).toBe(false);
  });

  it("(d) Leaflet's only inline `filter` write is the IE-8 opacity fallback", () => {
    const filterWrites = assignsProperty(leafletWrites, "filter");

    // Exactly one, and it is inside `_setOpacityIE`. Any second write, or one
    // that moves out of that function, reds — which is the regression this
    // whole file exists to catch.
    expect(filterWrites).toHaveLength(1);
    expect(
      within(filterWrites[0], setOpacityIE),
      `filter write at line ${filterWrites[0].line} is outside _setOpacityIE`,
    ).toBe(true);
  });

  it("(d) that fallback is unreachable wherever `opacity` is supported", () => {
    // `setOpacity` assigns `opacity` first and only falls through to
    // `_setOpacityIE` when `'opacity' in el.style` is false. No browser this
    // app supports takes that arm, so no marker element ever receives an
    // inline `filter` — which is why a fade may safely ride `filter: opacity()`.
    expect(setOpacity.text).toMatch(/if\s*\(\s*['"]opacity['"]\s+in\s+el\.style\s*\)/);
    expect(setOpacity.text).toMatch(
      /else\s+if\s*\(\s*['"]filter['"]\s+in\s+el\.style\s*\)\s*\{\s*_setOpacityIE\s*\(/,
    );

    // And that guarded call is the function's only caller: a second call site
    // could reach it without the `'opacity' in el.style` test above. The
    // negative lookbehind drops the `function _setOpacityIE(` declaration,
    // which is a definition rather than a call.
    const callSites = [
      ...leaflet.matchAll(/(?<!function\s{1,4})\b_setOpacityIE\s*\(/g),
    ];
    expect(callSites).toHaveLength(1);
    expect(
      within({ index: callSites[0].index }, setOpacity),
      `_setOpacityIE is called from line ${lineAt(leaflet, callSites[0].index)}, outside setOpacity's guarded else-if`,
    ).toBe(true);
  });
});
