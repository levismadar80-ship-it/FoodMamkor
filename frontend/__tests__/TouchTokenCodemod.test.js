/**
 * MEH-2719 — the 44px touch-target floor has one name: `touch`.
 *
 * DESIGN.md requires a hit area of at least 44 × 44px for standalone
 * controls. Before this, the floor was spelled `min-h-[44px]` / `min-w-[44px]`
 * at ~194 sites, so the rule lived only in prose. `spacing.touch: 44px`
 * (DESIGN.md → tailwind.tokens.json) makes it one value, and the swap is
 * pixel-identical because both spellings compile to `min-height: 44px`.
 *
 * Pins both halves, like RadiusTokenCodemod.test.js:
 *   1. the token is still 44px;
 *   2. no code line under app/ components/ lib/ hooks/ spells an arbitrary
 *      44px width/height again.
 * `h-11` / `w-11` (2.75rem) are deliberately out of scope: not every 44px
 * box is a touch floor.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import tokens from "../tailwind.tokens.json";

const ROOT = path.resolve(__dirname, "..");
const ARBITRARY_44 = /(?<![\w-])(?:(?:min|max)-)?(?:h|w|size)-\[44px\]/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("MEH-2719 — touch target token", () => {
  it("spacing.touch is 44px (the codemod's pixel-identity premise)", () => {
    expect(tokens.theme.extend.spacing.touch).toBe("44px");
  });

  it("no code spells an arbitrary 44px width/height", () => {
    const files = ["app", "components", "lib", "hooks"].flatMap((d) => walk(path.join(ROOT, d)));
    expect(files.length, "corpus control: the walk must see the source tree").toBeGreaterThan(200);
    let tokenUses = 0;
    const offenders = [];
    for (const f of files) {
      fs.readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/\b(?:min-|max-)?(?:h|w)-touch\b/.test(line)) tokenUses += 1;
          if (/^\s*(\*|\/\/|\{\/\*)/.test(line)) return;
          const m = line.match(ARBITRARY_44);
          if (m) offenders.push(`${path.relative(ROOT, f)}:${i + 1}  ${m[0]}`);
        });
    }
    expect(tokenUses, "corpus control: the token spelling must be found").toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it("the pattern catches the shapes it claims to", () => {
    for (const hit of ["min-h-[44px]", "md:min-w-[44px]", "h-[44px]", "size-[44px]", "max-w-[44px]"]) {
      expect(ARBITRARY_44.test(hit), hit).toBe(true);
    }
    for (const miss of ["min-h-[440px]", "min-h-touch", "h-11", "min-h-[48px]", "xh-[44px]"]) {
      expect(ARBITRARY_44.test(miss), miss).toBe(false);
    }
  });
});
