/**
 * MEH-3067 — one look per state: disabled, keyboard focus, elevation.
 *
 * DESIGN.md § Elevation / § State management (ADR-019), 13/11/2026:
 *   - disabled  → `disabled:opacity-50`, nothing else
 *   - focus     → a ring on `focus-visible` (never plain `focus:`), in one of
 *                 FOCUS_COLOURS (solid primary on light — the old 40% ring
 *                 measured ~1.8:1 on cream; gold-on-dark on the green bands,
 *                 white/70 on photos, black/40 on the Apple button,
 *                 danger-400/40 on a destructive action). A primary ring on a
 *                 green fill needs `ring-offset-*`, or it is invisible.
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

const FOCUS_COLOURS = new Set(["primary", "gold-on-dark", "white/70", "black/40", "danger-400/40"]);
const SHADOWS = new Set(["shadow-sm", "shadow-lg", "shadow-xl", "shadow-none"]);

// file → reason. Not a ratchet: each entry is a decision, or a file another
// open PR owns tonight (lift the entry when it lands).
const EXEMPT = {
  "components/CookieBanner.jsx": "the bottom banner casts its shadow upward — no scale step points up",
  "components/public/ProductSheet.jsx": "owned by the products PRs (#4417/#4421) tonight; normalised after they land",
  "app/[locale]/producer/[id]/components/ProducerSections.jsx": "owned by the products PRs (#4417/#4421) tonight; normalised after they land",
  "components/HistoryBackLink.jsx": "owned by #4422 (event back row) tonight; normalised after it lands",
};

/** @returns {string[]} the off-scale tokens in one class string */
export function offScale(cls) {
  const out = [];
  const tokens = cls.split(/\s+/).filter(Boolean);
  for (const raw of tokens) {
    const parts = raw.split(":");
    const base = parts[parts.length - 1];
    const variants = parts.slice(0, -1);
    const op = /^opacity-(.+)$/.exec(base);
    if (op && variants.some((v) => /(?:^|-)disabled$/.test(v)) && op[1] !== "50") out.push(raw);
    if (/^shadow(?:-|$)/.test(base) && !/^shadow-(?:primary|black|text)/.test(base) && !SHADOWS.has(base)) out.push(raw);
    if (base.startsWith("ring") && variants.includes("focus")) out.push(raw);
    const ring = /^ring-(.+)$/.exec(base);
    if (ring && variants.some((v) => /focus/.test(v)) && !/^(?:\d|inset|offset)/.test(ring[1]) && !FOCUS_COLOURS.has(ring[1])) out.push(raw);
  }
  const greenFill = tokens.some((t) => /^bg-(?:primary|primary-dark)$/.test(t));
  const primaryRing = tokens.find((t) => /^focus-visible:ring-primary$/.test(t));
  if (greenFill && primaryRing && !tokens.some((t) => /ring-offset-/.test(t))) out.push(`${primaryRing}(no offset on a green fill)`);
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

describe("MEH-3067 — disabled, focus and elevation each have one look", () => {
  it("self-test: each rule reds its old shapes and passes the scale", () => {
    expect(offScale("disabled:opacity-60 disabled:opacity-40")).toEqual(["disabled:opacity-60", "disabled:opacity-40"]);
    expect(offScale("disabled:opacity-50 opacity-60")).toEqual([]);
    expect(offScale("shadow md:shadow shadow-md shadow-2xl shadow-[0_8px_30px_rgba(0,0,0,0.1)]")).toEqual(["shadow", "md:shadow", "shadow-md", "shadow-2xl", "shadow-[0_8px_30px_rgba(0,0,0,0.1)]"]);
    expect(offScale("shadow-sm lg:shadow-lg shadow-xl shadow-none shadow-primary/20")).toEqual([]);
    expect(offScale("focus:ring-2 focus:ring-primary/40")).toEqual(["focus:ring-2", "focus:ring-primary/40", "focus:ring-primary/40"]);
    expect(offScale("focus-visible:ring-primary/40 focus-visible:ring-accent/40")).toEqual(["focus-visible:ring-primary/40", "focus-visible:ring-accent/40"]);
    expect(offScale("focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-offset-2 focus-visible:ring-primary group-focus-visible:ring-gold-on-dark")).toEqual([]);
    // every disabled variant, and arbitrary values (admin/reviews used aria-disabled:opacity-60)
    expect(offScale("aria-disabled:opacity-60 group-disabled:opacity-40 disabled:opacity-[0.6]")).toEqual(["aria-disabled:opacity-60", "group-disabled:opacity-40", "disabled:opacity-[0.6]"]);
    // a primary ring on a green button is invisible without the offset gap (ContactCtaVariants.jsx:102 before)
    expect(offScale("bg-primary text-white focus-visible:ring-2 focus-visible:ring-primary")).toEqual(["focus-visible:ring-primary(no offset on a green fill)"]);
    expect(offScale("bg-primary text-white focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2")).toEqual([]);
    // anchored to a real pre-MEH-3067 line (admin/settings toggle knob)
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
