/**
 * MEH-1687 batch B — no arbitrary hex class spells a colour a token already names.
 *
 * `bg-[#EAF3DE]` and `bg-green-50` render the same pixel; the first is token
 * drift (design-principles.md P4) — the next palette change misses it. This
 * test derives the colour set from tailwind.tokens.json itself, so a token
 * added later is covered for free, and fails on any `<utility>-[#hex]` whose
 * hex (case-insensitive) equals a token value.
 *
 * Scope is deliberately EXACT matches only: a hex that is close to a token but
 * not equal (e.g. the removed gold #8B6914 vs accent #896714) is a visual
 * change, not a spelling one, and belongs to a reviewed PR with re-baselined
 * VRT — not to a ratchet.
 *
 * Corpus control: > 200 files walked and at least one token-named colour
 * class (`bg-primary`) found, so an empty walk cannot pass as clean.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import tokens from "../tailwind.tokens.json";

const ROOT = path.resolve(__dirname, "..");

function flatColors(obj, out = new Map(), prefix = "") {
  for (const [k, v] of Object.entries(obj)) {
    const name = prefix ? `${prefix}-${k}` : k;
    if (v && typeof v === "object") flatColors(v, out, name);
    else if (typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v)) out.set(v.toLowerCase(), name);
  }
  return out;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const UTIL = "(?:bg|text|border|fill|stroke|ring|from|to|via|outline|decoration)";

describe("MEH-1687 B — token-equal hex classes are spelled as tokens", () => {
  it("no <utility>-[#hex] equals a tailwind.tokens.json colour", () => {
    const colors = flatColors(tokens.theme.extend.colors);
    expect(colors.size, "control: tokens parsed").toBeGreaterThan(10);
    const files = ["app", "components", "lib"].flatMap((d) => walk(path.join(ROOT, d)));
    expect(files.length, "corpus control").toBeGreaterThan(200);
    let tokenClasses = 0;
    const offenders = [];
    const re = new RegExp(`\\b${UTIL}-\\[(#[0-9a-fA-F]{3,8})\\]`, "g");
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      if (/\bbg-primary\b/.test(src)) tokenClasses += 1;
      for (const m of src.matchAll(re)) {
        const hit = colors.get(m[1].toLowerCase());
        if (hit) offenders.push(`${path.relative(ROOT, f)}: ${m[0]} → ${hit}`);
      }
    }
    expect(tokenClasses, "corpus control: a token colour class must be found").toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
