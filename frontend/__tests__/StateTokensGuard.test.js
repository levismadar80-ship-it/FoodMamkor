/**
 * MEH-3060 — one look per state: disabled, keyboard focus, elevation.
 *
 * DESIGN.md § Elevation / § State management (ADR-019), 13/11/2026:
 *   - disabled  → `disabled:opacity-50`, nothing else
 *   - focus     → a ring on `focus-visible` (never plain `focus:`), in one of
 *                 FOCUS_COLOURS (primary/40 on light, gold-on-dark on the green
 *                 bands, white/70 on photos, black/40 on the Apple button,
 *                 danger-400/40 on a destructive action)
 *   - elevation → shadow-sm (resting float: sticky bars, toggles), shadow-lg
 *                 (menus, popovers, floating buttons), shadow-xl (modals,
 *                 sheets) — or none. Cards stay flat (border only).
 *
 * Reads every string literal and template-literal text in app/ and components/
 * (comments are not strings, so «NO shadow-lift» notes don't count).
 * Blind spot: a class assembled from pieces ("shadow-" + size).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import traverseMod from "@babel/traverse";

const traverse = traverseMod.default || traverseMod;
const ROOT = path.resolve(__dirname, "..");

const FOCUS_COLOURS = new Set(["primary/40", "gold-on-dark", "white/70", "black/40", "danger-400/40"]);
const SHADOWS = new Set(["shadow-sm", "shadow-lg", "shadow-xl", "shadow-none"]);

// file → reason. Not a ratchet: each entry is a decision, or a file another
// open PR owns tonight (lift the entry when it lands).
const EXEMPT = {
  "components/CookieBanner.jsx": "the bottom banner casts its shadow upward — no scale step points up",
  "components/public/ProductSheet.jsx": "owned by the products PRs (#4417/#4421) tonight; normalised after they land",
  "app/[locale]/producer/[id]/components/ProducerSections.jsx": "owned by the products PRs (#4417/#4421) tonight; normalised after they land",
};

/** @returns {string[]} the off-scale tokens in one class string */
export function offScale(cls) {
  const out = [];
  for (const raw of cls.split(/\s+/)) {
    if (!raw) continue;
    const parts = raw.split(":");
    const base = parts[parts.length - 1];
    const variants = parts.slice(0, -1);
    const op = /^opacity-(\d+)$/.exec(base);
    if (op && variants.includes("disabled") && op[1] !== "50") out.push(raw);
    if (/^shadow(?:-|$)/.test(base) && !/^shadow-(?:primary|black|text)/.test(base) && !SHADOWS.has(base)) out.push(raw);
    if (base.startsWith("ring-") && variants.includes("focus")) out.push(raw);
    const ring = /^ring-(.+)$/.exec(base);
    if (ring && variants.some((v) => /focus/.test(v)) && !/^(?:\d|inset|offset)/.test(ring[1]) && !FOCUS_COLOURS.has(ring[1])) out.push(raw);
  }
  return out;
}

export function offScaleInSource(src) {
  const ast = parse(src, { sourceType: "module", plugins: ["jsx"] });
  const hits = [];
  const take = (text, line) => offScale(text).forEach((t) => hits.push(`${t}@${line}`));
  traverse(ast, {
    StringLiteral(p) { take(p.node.value, p.node.loc.start.line); },
    TemplateElement(p) { take(p.node.value.cooked ?? "", p.node.loc.start.line); },
  });
  return hits;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(jsx|js)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push(full);
  }
  return out;
}

describe("MEH-3060 — disabled, focus and elevation each have one look", () => {
  it("self-test: each rule reds its old shapes and passes the scale", () => {
    expect(offScale("disabled:opacity-60 disabled:opacity-40")).toEqual(["disabled:opacity-60", "disabled:opacity-40"]);
    expect(offScale("disabled:opacity-50 opacity-60")).toEqual([]);
    expect(offScale("shadow md:shadow shadow-md shadow-2xl shadow-[0_8px_30px_rgba(0,0,0,0.1)]")).toEqual(["shadow", "md:shadow", "shadow-md", "shadow-2xl", "shadow-[0_8px_30px_rgba(0,0,0,0.1)]"]);
    expect(offScale("shadow-sm lg:shadow-lg shadow-xl shadow-none shadow-primary/20")).toEqual([]);
    expect(offScale("focus:ring-2 focus:ring-primary/40")).toEqual(["focus:ring-2", "focus:ring-primary/40"]);
    expect(offScale("focus-visible:ring-primary focus-visible:ring-accent/40")).toEqual(["focus-visible:ring-primary", "focus-visible:ring-accent/40"]);
    expect(offScale("focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-offset-2 focus-visible:ring-primary/40 group-focus-visible:ring-gold-on-dark")).toEqual([]);
    // anchored to a real pre-MEH-3060 line (admin/settings toggle knob)
    expect(offScaleInSource("const X = () => <span className={`absolute rounded-full bg-surface shadow transition ${on}`} />;")).toEqual(["shadow@1"]);
  });

  it("no off-scale disabled / focus / shadow token in app/ or components/", () => {
    const files = ["app", "components"].flatMap((d) => walk(path.join(ROOT, d)));
    expect(files.length, "corpus control").toBeGreaterThan(200);
    const offenders = [];
    let scanned = 0;
    for (const f of files) {
      const rel = path.relative(ROOT, f).split(path.sep).join("/");
      if (EXEMPT[rel]) continue;
      scanned++;
      const hits = offScaleInSource(fs.readFileSync(f, "utf8"));
      if (hits.length) offenders.push(`${rel}: ${hits.join(", ")}`);
    }
    expect(offenders).toEqual([]);
    expect(scanned).toBeGreaterThan(200);
  }, 60_000);
});
