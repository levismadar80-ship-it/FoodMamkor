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
