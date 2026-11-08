/**
 * MEH-1687 batch C0 — `rounded-[12px]` is spelled `rounded-md`.
 *
 * The 03/09 design-debt audit found 50 arbitrary `rounded-[12px]` on public
 * routes (189 repo-wide on 02/11) beside the token that already means 12px:
 * tailwind.tokens.json `borderRadius.md = "12px"`. The codemod is
 * pixel-identical BECAUSE of that equality, so this file pins both halves:
 *   1. the token still says 12px (if it moves, every converted site moves
 *      with it — the codemod's premise is gone and this goes red first);
 *   2. no code line under app/ components/ lib/ spells the arbitrary value.
 *
 * Corpus control: the walk must see > 200 files and must find the token
 * spelling (`rounded-md`) somewhere, so an empty or mis-rooted walk cannot
 * pass as clean.
 *
 * MEH-2718 extends the same two halves to the other three token radii:
 * `rounded-[8px]` → `rounded-sm`, `rounded-[16px]` → `rounded-lg`,
 * `rounded-[20px]` → `rounded-xl`, side variants included
 * (`rounded-t-[16px]` → `rounded-t-lg`). 10px / 14px / 6px have no token and
 * are a visual decision, so they are NOT pinned here.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import tokens from "../tailwind.tokens.json";

const ROOT = path.resolve(__dirname, "..");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

// px value → the token key that means exactly that value
const TOKEN_RADII = { 8: "sm", 12: "md", 16: "lg", 20: "xl" };
const SIDE = "(?:-(?:tl|tr|bl|br|ss|se|es|ee|t|b|l|r|s|e))?";
const ARBITRARY = new RegExp(`(?<![\\w-])rounded${SIDE}-\\[(${Object.keys(TOKEN_RADII).join("|")})px\\]`);

describe("MEH-2718 — every token-equal arbitrary radius is spelled as the token", () => {
  it.each(Object.entries(TOKEN_RADII))("the %spx radius token is still called %s", (px, key) => {
    expect(tokens.theme.extend.borderRadius[key]).toBe(`${px}px`);
  });

  it("no code under app/ components/ lib/ hooks/ spells rounded(-side)-[8|12|16|20px]", () => {
    const files = ["app", "components", "lib", "hooks"].flatMap((d) => walk(path.join(ROOT, d)));
    expect(files.length, "corpus control: the walk must see the source tree").toBeGreaterThan(200);
    let tokenUses = 0;
    const offenders = [];
    for (const f of files) {
      fs.readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/\brounded(-[a-z]{1,2})?-(sm|lg|xl)\b/.test(line)) tokenUses += 1;
          if (/^\s*(\*|\/\/|\{\/\*)/.test(line)) return;
          const m = line.match(ARBITRARY);
          if (m) offenders.push(`${path.relative(ROOT, f)}:${i + 1}  ${m[0]}`);
        });
    }
    expect(tokenUses, "corpus control: the token spellings must be found").toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it("the pattern itself catches the shapes it claims to (self-check against the real regex)", () => {
    for (const hit of ["rounded-[8px]", "md:rounded-[16px]", "rounded-t-[16px]", "rounded-ss-[20px]", '"p-2 rounded-[12px]"']) {
      expect(ARBITRARY.test(hit), hit).toBe(true);
    }
    for (const miss of ["rounded-[10px]", "rounded-[14px]", "rounded-lg", "rounded-[160px]", "xrounded-[8px]"]) {
      expect(ARBITRARY.test(miss), miss).toBe(false);
    }
  });
});

// MEH-1687 phase 5 (06/11): the off-scale radii (10, 14, 6, 18, 9, 5, 4, 24px)
// were placed on the documented scale (DESIGN.md § Shapes): actions →
// rounded-full (ruling «⚖️ 03/11» E), fields → rounded-sm, everything else →
// the nearest step, ties up. No arbitrary px radius is left at all.
const ANY_ARBITRARY_PX = new RegExp(`(?<![\\w-])rounded${SIDE}-\\[\\d+px\\]`);

describe("MEH-1687 phase 5 — no arbitrary px radius anywhere", () => {
  it("the pattern sees off-scale radii and ignores steps", () => {
    for (const hit of ["rounded-[10px]", "md:rounded-[14px]", "rounded-t-[24px]"]) expect(ANY_ARBITRARY_PX.test(hit), hit).toBe(true);
    for (const miss of ["rounded-md", "rounded-full", "rounded-t-3xl", "rounded-[50%]"]) expect(ANY_ARBITRARY_PX.test(miss), miss).toBe(false);
  });

  it("no code under app/ components/ lib/ hooks/ spells rounded(-side)-[Npx]", () => {
    const files = ["app", "components", "lib", "hooks"].flatMap((d) => walk(path.join(ROOT, d)));
    expect(files.length, "corpus control").toBeGreaterThan(200);
    const offenders = [];
    for (const f of files) {
      fs.readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        if (/^\s*(\*|\/\/|\{\/\*)/.test(line)) return;
        const m = line.match(ANY_ARBITRARY_PX);
        if (m) offenders.push(`${path.relative(ROOT, f)}:${i + 1}  ${m[0]}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe("MEH-1687 C0 — rounded-[12px] → rounded-md", () => {
  it("the md radius token is 12px (the codemod's pixel-identity premise)", () => {
    expect(tokens.theme.extend.borderRadius.md).toBe("12px");
  });

  it("no code under app/ components/ lib/ spells rounded-[12px]", () => {
    const files = ["app", "components", "lib"].flatMap((d) => walk(path.join(ROOT, d)));
    expect(files.length, "corpus control: the walk must see the source tree").toBeGreaterThan(200);
    let tokenUses = 0;
    const offenders = [];
    for (const f of files) {
      fs.readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/\brounded-md\b/.test(line)) tokenUses += 1;
          // A comment may still name the old spelling (history); code may not.
          if (/^\s*(\*|\/\/|\{\/\*)/.test(line)) return;
          if (line.includes("rounded-[12px]")) offenders.push(`${path.relative(ROOT, f)}:${i + 1}`);
        });
    }
    expect(tokenUses, "corpus control: the token spelling must be found").toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
