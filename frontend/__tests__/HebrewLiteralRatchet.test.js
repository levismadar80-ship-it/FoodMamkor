/**
 * MEH-1687 phase 7 — user-facing copy lives in messages/{he,en}.json, not in
 * code. A Hebrew string literal, template literal or JSX text in
 * app/ components/ lib/ hooks/ is copy the English locale cannot translate.
 *
 * The 06/11 sweep found 434 (AST-counted; comments excluded). Most are domain
 * registries that still carry their display label in Hebrew (badges,
 * holidays, filter taxonomy, map chips, categories) — they move to message
 * keys in their own PRs. Some are deliberate and stay: founder-voice guide
 * articles, admin screens (Hebrew-only, ADR-037), app/global-error.js (renders
 * outside the i18n provider), Hebrew-valued enums the API matches on.
 *
 * This is a per-file ratchet (industry pattern: eslint-plugin-i18next /
 * formatjs "no-literal-string", applied with a baseline so the debt cannot
 * grow while it is paid down). A file may only go DOWN. A file not in the
 * baseline may hold none. When you remove literals, lower the number — the
 * test reds on a stale allowance so the baseline stays exact.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import traverseMod from "@babel/traverse";
import BASELINE from "./fixtures/hebrew-literals-baseline.json";

const traverse = traverseMod.default || traverseMod;
const ROOT = path.resolve(__dirname, "..");
const HE = /[\u0590-\u05FF]/; // the Hebrew block, escaped so no editor can normalise it away

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    // lib/generated/ is emitted from the backend OpenAPI schema; its strings are
    // backend copy, and a regen must not red an unrelated frontend PR.
    if (e.isDirectory()) { if (e.name !== "generated") walk(full, out); }
    else if (/\.(jsx?|tsx?)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push(full);
  }
  return out;
}

function countHebrewLiterals(src) {
  const ast = parse(src, { sourceType: "module", plugins: ["jsx", "typescript"] });
  let n = 0;
  traverse(ast, {
    JSXText(p) { if (HE.test(p.node.value)) n += 1; },
    StringLiteral(p) { if (HE.test(p.node.value)) n += 1; },
    TemplateElement(p) { if (HE.test(p.node.value.raw)) n += 1; },
  });
  return n;
}

describe("MEH-1687 phase 7 — Hebrew copy in code only shrinks", () => {
  it("the counter sees literals and ignores comments", () => {
    expect(countHebrewLiterals('const a = "שלום"; // הערה\n/* עוד הערה */')).toBe(1);
    expect(countHebrewLiterals("const C = () => <p>שלום {x}</p>;")).toBe(1);
    expect(countHebrewLiterals("const s = `שלום ${x} עולם`;")).toBe(2);
    expect(countHebrewLiterals('const k = "hello"; // שלום')).toBe(0);
  });

  it("no file holds more Hebrew literals than its baseline, and no allowance is stale", () => {
    const files = ["app", "components", "lib", "hooks"].flatMap((d) => walk(path.join(ROOT, d)));
    expect(files.length, "corpus control").toBeGreaterThan(200);
    let total = 0;
    const problems = [];
    const seen = new Set();
    for (const f of files) {
      const rel = path.relative(ROOT, f).split(path.sep).join("/");
      const n = countHebrewLiterals(fs.readFileSync(f, "utf8"));
      total += n;
      const allowed = BASELINE[rel] || 0;
      if (n) seen.add(rel);
      if (n > allowed) problems.push(`${rel}: ${n} Hebrew literals (allowed ${allowed}) — move the copy to messages/*.json`);
      if (n < allowed) problems.push(`${rel}: ${n} < baseline ${allowed} — lower it in __tests__/fixtures/hebrew-literals-baseline.json`);
    }
    for (const rel of Object.keys(BASELINE)) if (!seen.has(rel)) problems.push(`${rel}: in the baseline but has none (or is gone) — remove the entry`);
    expect(total, "corpus control: the counter must find the known registries").toBeGreaterThan(100);
    expect(problems).toEqual([]);
  }, 60_000); // parses ~400 files; the 5 s default timed out on CI (6873 ms)
});
