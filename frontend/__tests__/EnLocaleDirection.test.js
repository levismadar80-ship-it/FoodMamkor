/**
 * MEH-1892 — `/en` must render LTR, end to end.
 *
 * `app/[locale]/layout.js:202` already computes the correct base direction and
 * puts it on `<html>`. The defect was in CSS: an UNCONDITIONAL
 * `html { direction: rtl }` in globals.css overrode that attribute, so the
 * whole `/en` document computed `rtl` regardless of what the layout said.
 *
 * W3C i18n places a page's base direction on `<html>` — which the layout does
 * correctly — while `<bdi>` / `unicode-bidi: isolate` govern mixed-direction
 * runs INSIDE a block. There was no inline fragment here to isolate; the
 * element whose direction was wrong was the root itself. An isolation-based
 * fix would have applied cleanly, gone green, and left `/en` broken.
 *
 * ## Why this reads the real stylesheet instead of a fixture
 *
 * The assertion under test is a CASCADE outcome, so a hand-written copy of the
 * rules would be free to drift from the file that actually ships (rules:
 * exercise the real implementation, and anchor at least one case to a real
 * repo file). This extracts every `direction:` rule from the shipped
 * `globals.css`, replays them in jsdom, and reads `getComputedStyle`.
 *
 * ## Why there is no computed-style assertion here — measured, not assumed
 *
 * The obvious test is "set dir=ltr, read getComputedStyle().direction". It does
 * not work in jsdom, and it fails in the dangerous direction: **it passes
 * against the broken stylesheet**. Measured with only the unscoped rule
 * injected and `dir="ltr"` on the element, jsdom reports `ltr` — it gives the
 * `dir` attribute precedence over the author stylesheet, which is the opposite
 * of a real browser, where author CSS `direction` wins over the attribute's
 * presentational hint. That is exactly the bug this card is about, so jsdom
 * cannot reproduce it.
 *
 * A first probe appeared to validate the approach and did not, because it
 * injected BOTH rules — a case whose answer is `ltr` either way. Validating an
 * instrument on the wrong case is worse than not validating it: it converts a
 * void result into a confident one.
 *
 * So the computed-direction assertion lives where a real engine runs it,
 * `e2e/flows/39-en-locale-direction.spec.ts`, and what stays here is the
 * cascade-SHAPE invariant below: an unscoped `html { direction }` overrides the
 * attribute the layout sets, so no such rule may exist. That one goes red on
 * the pre-fix stylesheet, which is the only reason it is worth having.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const CSS_PATH = path.join(process.cwd(), "app", "globals.css");

/**
 * Every rule in the shipped stylesheet that sets `direction`, as
 * `{ selector, css }`. Comments are stripped first so a `direction:` mentioned
 * in prose (globals.css has one at :280) cannot be mistaken for a declaration.
 */
function directionRulesFromGlobals() {
  const raw = fs.readFileSync(CSS_PATH, "utf8");
  const withoutComments = raw.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = ruleRe.exec(withoutComments)) !== null) {
    const selector = m[1].trim();
    const body = m[2];
    // The alternation is NOT optional: an optional `?` here would let `html\b`
    // match after any preceding character (e.g. a hypothetical
    // `.my-html-class`), defeating the boundary the group exists to enforce.
    // CI reviewer finding, PR #3303.
    if (/(^|[;\s])direction\s*:/.test(body) && /(^|[\s,>+~])html\b/.test(selector)) {
      const decl = body.match(/(^|[;\s])direction\s*:\s*([a-z]+)/);
      rules.push({ selector, css: `${selector} { direction: ${decl[2]}; }` });
    }
  }
  return rules;
}

let styleEl;

beforeEach(() => {
  styleEl = document.createElement("style");
  styleEl.textContent = directionRulesFromGlobals()
    .map((r) => r.css)
    .join("\n");
  document.head.appendChild(styleEl);
});

afterEach(() => {
  styleEl.remove();
  document.documentElement.removeAttribute("dir");
});

describe("MEH-1892 — the root direction follows the dir attribute", () => {
  // Runs first on purpose. Every assertion below is vacuous if the extractor
  // found nothing: with no rule injected, jsdom falls back to `ltr` and the
  // /en case would pass against a stylesheet that never scoped anything.
  it("CONTROL — the extractor actually found a direction rule in globals.css", () => {
    const rules = directionRulesFromGlobals();
    expect(
      rules.length,
      "no `direction` rule was extracted from globals.css — every result below is void, not passing",
    ).toBeGreaterThan(0);
  });

  it("no direction rule may be unscoped — a bare `html` selector re-breaks /en", () => {
    const unscoped = directionRulesFromGlobals().filter(
      (r) => !/\[dir=/.test(r.selector),
    );
    expect(
      unscoped.map((r) => r.selector),
      "a `direction` rule on a bare `html` selector overrides the dir attribute the layout sets",
    ).toEqual([]);
  });
});
