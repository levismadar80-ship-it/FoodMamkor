/**
 * ADR-038 — status colours are tokens: `red-N` is spelled `danger-N`, `amber-N`
 * is spelled `warning-N`.
 *
 * The codemod was pixel-identical BECAUSE each token equals Tailwind's value
 * for the same step. This file pins both halves:
 *   1. every danger/warning step still equals the stock red/amber value (if a
 *      value moves on purpose, update this pin in the same PR — that is the
 *      re-theme, and it should be a visible decision);
 *   2. no code line under app/ components/ lib/ hooks/ spells a raw
 *      `<utility>-red-N` / `<utility>-amber-N` class.
 * The raw-colour ratchet (scripts/checks/raw-color-tokens.sh) also blocks new
 * ones; this test names the specific regression and runs in vitest.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import stock from "tailwindcss/colors";
import tokens from "../tailwind.tokens.json";

const ROOT = path.resolve(__dirname, "..");
const STEPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"];
const PRE =
  "(?:bg|text|border(?:-[xytblrse])?|ring(?:-offset)?|fill|stroke|from|via|to|outline|divide|placeholder|caret|accent|decoration|shadow)";
const RAW = new RegExp(`(?<![\\w-])${PRE}-(?:red|amber)-(?:${STEPS.join("|")})(?![\\w-])`);
const COMMENT = /^\s*(\*|\/\/|\/\*|\{\/\*)/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|ts|tsx|css|mdx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("ADR-038 — red/amber are spelled danger/warning", () => {
  const colors = tokens.theme.extend.colors;

  it.each(STEPS)("danger-%s and warning-%s equal stock red/amber (the pixel-identity premise)", (s) => {
    expect(colors[`danger-${s}`]).toBe(stock.red[s]);
    expect(colors[`warning-${s}`]).toBe(stock.amber[s]);
  });

  it("the raw-class regex sees what it must and ignores what it must not", () => {
    for (const hit of ["text-red-600", "hover:bg-red-50", "border-amber-200", "bg-red-600/20", "border-t-red-300"]) {
      expect(RAW.test(hit), hit).toBe(true);
    }
    for (const miss of ["text-danger-600", "bg-warning-100", "text-error", "bg-red-950x", "tired-500", "bg-green-50"]) {
      expect(RAW.test(miss), miss).toBe(false);
    }
  });

  it("no code under app/ components/ lib/ hooks/ spells a raw red/amber class", () => {
    const files = ["app", "components", "lib", "hooks"].flatMap((d) => walk(path.join(ROOT, d)));
    expect(files.length, "corpus control: the walk must see the source tree").toBeGreaterThan(200);
    let tokenUses = 0;
    const offenders = [];
    for (const f of files) {
      fs.readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/\b(?:text|bg|border)-danger-\d+/.test(line)) tokenUses += 1;
          if (COMMENT.test(line)) return;
          if (RAW.test(line)) offenders.push(`${path.relative(ROOT, f)}:${i + 1}`);
        });
    }
    expect(tokenUses, "corpus control: the token spelling must be found").toBeGreaterThan(100);
    expect(offenders).toEqual([]);
  });
});
