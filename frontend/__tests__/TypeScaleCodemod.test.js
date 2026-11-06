/**
 * MEH-1687 phase 4 — one type scale. Font sizes are spelled as scale steps
 * (`text-2xs` … `text-6xl`), never as an arbitrary `text-[Npx]`.
 *
 * The 06/11 sweep found 308 arbitrary sizes in 26 distinct values (10, 10.5,
 * 11, 12.5, 13, 13.5, 14.5, 15, 15.5, 16.5, 17, 19, 21, 22 …) beside ~1,750 uses
 * of the Tailwind steps. They were snapped to the nearest step (ties up, for
 * legibility on a phone), with one added micro step, `2xs` = 11px/16px
 * (Material 3 label-small) for badges and chips.
 *
 * Fluid display headings — `text-[clamp(…)]` — are a different tool (fluid
 * type, Utopia-style) and are allowed.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import tokens from "../tailwind.tokens.json";

const ROOT = path.resolve(__dirname, "..");
const ARBITRARY = /(?<![\w-])(?:[a-z0-9-]+:)*text-\[(?:length:)?[0-9.]+(?:px|rem|em)\]/;
const COMMENT = /^\s*(\*|\/\/|\/\*|\{\/\*)/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|ts|tsx|css|mdx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("MEH-1687 phase 4 — one type scale", () => {
  it("the micro step is 11px on a 16px line", () => {
    expect(tokens.theme.extend.fontSize["2xs"]).toEqual(["11px", { lineHeight: "16px" }]);
  });

  it("the regex sees arbitrary sizes and ignores steps and fluid clamps", () => {
    for (const hit of ["text-[13px]", "sm:text-[17px]", "text-[12.5px]", "md:text-[0.8rem]", "text-[length:13px]", "text-[0.8125em]"]) expect(ARBITRARY.test(hit), hit).toBe(true);
    for (const miss of ["text-sm", "text-2xs", "text-[clamp(28px,6vw,44px)]", "text-[#fff]", "context-[13px]"]) expect(ARBITRARY.test(miss), miss).toBe(false);
  });

  it("no code under app/ components/ lib/ hooks/ spells an arbitrary font size", () => {
    const files = ["app", "components", "lib", "hooks"].flatMap((d) => walk(path.join(ROOT, d)));
    expect(files.length, "corpus control").toBeGreaterThan(200);
    let stepUses = 0;
    const offenders = [];
    for (const f of files) {
      fs.readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        if (/\btext-2xs\b/.test(line)) stepUses += 1;
        if (COMMENT.test(line)) return;
        if (ARBITRARY.test(line)) offenders.push(`${path.relative(ROOT, f)}:${i + 1}`);
      });
    }
    expect(stepUses, "corpus control: the new step must be in use").toBeGreaterThan(50);
    expect(offenders).toEqual([]);
  });
});
