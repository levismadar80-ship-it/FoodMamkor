import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// MEH-1636: pins Leaflet's ACTUAL default bottom margin for the attribution
// control, read from the installed stylesheet at runtime.
//
// WHY THIS EXISTS
//   Four places in this repo asserted, in prose, that `10px` is "Leaflet's own
//   default margin" for `.leaflet-control-attribution`, and that our
//   `globals.css` floor therefore leaves the sheet-closed state byte-identical
//   to having no rule at all. That is false. Leaflet ships TWO competing rules:
//
//     .leaflet-bottom .leaflet-control          { margin-bottom: 10px }  (earlier)
//     .leaflet-container .leaflet-control-attribution { margin: 0 }      (later)
//
//   Both selectors are two classes — specificity (0,2,0) — so the cascade falls
//   through to source order, and the LATER rule wins. Leaflet's effective
//   default for this control is `margin: 0`. The `10px` on <1024px is OUR floor
//   (`max(calc(var(--map-sheet-h, 0vh) + 6px), 10px)`), not an inherited value.
//
//   Measured on a real producer page under MEH-1633: `0px` at 1440 (where our
//   media-query rule does not apply) and `10px` at 375 (where it does) —
//   exactly what these two rules predict.
//
//   The prose was corrected, but prose is what produced the error in the first
//   place. A sentence cannot notice when a dependency changes underneath it, so
//   the load-bearing deliverable is this test: it re-derives the fact from
//   node_modules on every run and reds the moment Leaflet's cascade shifts.
//   If a future Leaflet drops the `margin: 0`, or reorders the two rules, our
//   floor silently stops being a floor and starts being a no-op — and the only
//   thing that would notice is this file.
//
// WHAT THIS DOES NOT DO
//   It does not assert the COMPUTED margin on a rendered element (that is a
//   browser measurement — see qa-artifacts/MEH-1633 and the MEH-1633 probe),
//   and it does not snapshot the stylesheet. It pins exactly the four facts the
//   cascade conclusion rests on, and nothing else.
//
// Deliberately reads the file rather than importing it: vitest runs with
// `css: false` (vitest.config.js), so an import would yield no usable text.
// jsdom is the suite-wide environment but is unused here — this is pure fs.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const LEAFLET_CSS = path.join(
  HERE,
  "..",
  "node_modules",
  "leaflet",
  "dist",
  "leaflet.css",
);

// leaflet.css ships CRLF. Normalise line endings up front so every regex below
// can treat the file as plain \n text, and so a future LF-normalised release
// cannot change any result here.
const css = readFileSync(LEAFLET_CSS, "utf8").replaceAll("\r\n", "\n");

/**
 * Index of a rule's selector within the stylesheet source, or -1.
 *
 * Matched at a line start so a selector that appears as a SUBSTRING of a longer
 * one can never be mistaken for it — `.leaflet-bottom .leaflet-control` is a
 * literal prefix of `.leaflet-bottom .leaflet-control-scale` (a real rule in
 * this file), so a bare indexOf would be ambiguous. Requiring the next
 * character to be `,` or `{` (with optional whitespace) pins the whole selector.
 */
function ruleIndex(selector) {
  const escaped = selector.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  // Tolerate any run of whitespace where the selector has a single space.
  const flexible = escaped.replaceAll(/\s+/g, String.raw`\s+`);
  return css.search(new RegExp(String.raw`^${flexible}\s*[,{]`, "m"));
}

/** The declaration block `{ … }` that follows a selector. */
function ruleBody(selector) {
  const start = ruleIndex(selector);
  if (start === -1) return null;
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  if (open === -1 || close === -1) return null;
  return css.slice(open + 1, close);
}

/**
 * Declared value of `property` in a rule body, or null.
 *
 * Last-wins, matching CSS semantics for a repeated property inside one block —
 * `.leaflet-container .leaflet-control-attribution` really does declare
 * `background` twice (a hex fallback then rgba), so "first match" would be the
 * wrong reading of this very file.
 */
function declaredValue(body, property) {
  if (body === null) return null;
  const matches = [
    ...body.matchAll(
      new RegExp(String.raw`(?:^|;)\s*${property}\s*:\s*([^;]+)`, "g"),
    ),
  ];
  return matches.length > 0 ? matches.at(-1)[1].trim() : null;
}

/**
 * Specificity of a simple compound selector as [ids, classes, elements].
 *
 * Scoped to what these two selectors actually use — class tokens and
 * descendant combinators. Not a general CSS specificity implementation, and
 * deliberately not: a full one is a library, and nothing here needs it.
 */
function specificity(selector) {
  const ids = (selector.match(/#[\w-]+/g) ?? []).length;
  const classes = (selector.match(/\.[\w-]+/g) ?? []).length;
  const elements = (selector.match(/(?:^|[\s>+~])[a-z]+\b/gi) ?? []).length;
  return [ids, classes, elements];
}

const BOTTOM_CONTROL = ".leaflet-bottom .leaflet-control";
const ATTRIBUTION = ".leaflet-container .leaflet-control-attribution";

describe("MEH-1636 — Leaflet's default margin for the attribution control", () => {
  it("finds both rules in the installed stylesheet (guards a parser no-op)", () => {
    // Without this, every assertion below could pass vacuously on a file whose
    // format drifted — the same self-disabling class MEH-1030 closed for
    // guarded registries.
    expect(css.length).toBeGreaterThan(0);
    expect(ruleIndex(BOTTOM_CONTROL)).toBeGreaterThan(-1);
    expect(ruleIndex(ATTRIBUTION)).toBeGreaterThan(-1);
  });

  it(`(a) ${BOTTOM_CONTROL} declares margin-bottom: 10px`, () => {
    expect(declaredValue(ruleBody(BOTTOM_CONTROL), "margin-bottom")).toBe("10px");
  });

  it(`(b) ${ATTRIBUTION} declares margin: 0`, () => {
    expect(declaredValue(ruleBody(ATTRIBUTION), "margin")).toBe("0");
  });

  it("(c) the attribution rule comes LATER in source order, so it wins", () => {
    // This is the whole conclusion: equal specificity (asserted below) means
    // source order decides, and the attribution rule is later.
    expect(ruleIndex(ATTRIBUTION)).toBeGreaterThan(ruleIndex(BOTTOM_CONTROL));
  });

  it("(d) both selectors have specificity (0,2,0), so neither outranks the other", () => {
    expect(specificity(BOTTOM_CONTROL)).toEqual([0, 2, 0]);
    expect(specificity(ATTRIBUTION)).toEqual([0, 2, 0]);
  });

  it("therefore: Leaflet's effective default for this control is margin 0, NOT 10px", () => {
    // The conjunction, stated once as an executable sentence. If any leg above
    // flips, the prose in globals.css / rtl.md / silent-failure-audit.md that
    // points at this file is stale and must be revisited.
    const equalSpecificity =
      specificity(ATTRIBUTION).join(",") === specificity(BOTTOM_CONTROL).join(",");
    const attributionIsLater = ruleIndex(ATTRIBUTION) > ruleIndex(BOTTOM_CONTROL);
    const attributionZeroesMargin =
      declaredValue(ruleBody(ATTRIBUTION), "margin") === "0";

    expect(equalSpecificity).toBe(true);
    expect(attributionIsLater).toBe(true);
    expect(attributionZeroesMargin).toBe(true);
  });
});
