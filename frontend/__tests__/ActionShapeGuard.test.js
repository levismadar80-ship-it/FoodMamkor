/**
 * MEH-3058 — every action is a pill, whatever element carries it.
 *
 * DESIGN.md § Shapes (MEH-1687): actions are `rounded-full`. ButtonPrimitiveGuard
 * only reads raw `<button>`, so a `<Link>` / `<a>` styled as a green action
 * escaped it with any corner it liked — «שתפו» (rounded-lg) sat under the
 * «שליחת ההמלצה» pill on /recommend (Sapir, 13/11).
 *
 * Rule: a `<button>`, `<Link>` or `<a>` whose static className carries an
 * action recipe — filled (green bg + white text) or outlined (green border +
 * green text) — must also carry `rounded-full`. The shared <Button> and
 * <ShowMore> already do; they are components, not these elements.
 *
 * ALLOWED was a ratchet (13/11) and is now empty: every action is a pill.
 *
 * Blind spots: className built in a variable or helper (cn(...), a const
 * string such as SHARE_TONE), the dynamic ${…} part of a template literal, a
 * recipe spelled with other tokens, and other elements (<div role="button">).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import traverseMod from "@babel/traverse";

const traverse = traverseMod.default || traverseMod;
const ROOT = path.resolve(__dirname, "..");
const ELEMENTS = new Set(["button", "Link", "a"]);

/** "filled" | "outlined" | null — the action recipes DESIGN.md binds to a pill. */
export function actionRecipe(cls) {
  // Unprefixed tokens only: `hover:bg-primary` is a hover state, not the
  // element's look. A fill may be dark or ≥ 50% opaque; `bg-primary/10` is a tint.
  const tokens = cls.split(/\s+/);
  const has = (re) => tokens.some((tok) => re.test(tok));
  const greenBg = has(/^bg-(?:primary|primary-dark|action-primary)(?:\/[5-9]\d)?$/);
  if (greenBg && has(/^text-(?:white|background)$/)) return "filled";
  if (!greenBg && has(/^border-(?:primary|primary-dark|action-primary)$/) && has(/^text-(?:primary|primary-dark|action-primary)$/)) return "outlined";
  return null;
}

function staticClass(attr) {
  const v = attr?.value;
  if (!v) return null;
  if (v.type === "StringLiteral") return v.value;
  if (v.type === "JSXExpressionContainer") {
    const e = v.expression;
    if (e.type === "StringLiteral") return e.value;
    if (e.type === "TemplateLiteral") return e.quasis.map((q) => q.value.cooked).join(" ");
  }
  return null;
}

export function offShapeActions(src, seen = { actions: 0 }) {
  const ast = parse(src, { sourceType: "module", plugins: ["jsx"] });
  const hits = [];
  traverse(ast, {
    JSXOpeningElement(p) {
      const n = p.node.name.name;
      if (!ELEMENTS.has(n)) return;
      const attr = p.node.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === "className");
      const cls = staticClass(attr);
      if (!cls || !actionRecipe(cls)) return;
      seen.actions++;
      if (!/(?:^|\s)rounded-full(?:\s|$)/.test(cls)) hits.push(`${n}@${p.node.loc.start.line}`);
    },
  });
  return hits;
}

// file → off-shape actions still allowed (ratchet, 13/11/2026). Shrink only.
// Was a ratchet of 33 offenders in 22 files (13/11); all fixed the same night
// (Sapir: «תתקן הכל עכשיו לפני הגרסה»). Keep it empty.
const ALLOWED = {};

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!full.endsWith(`${path.sep}ui`)) walk(full, out); }
    else if (/\.(jsx|js)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push(full);
  }
  return out;
}

describe("MEH-3058 — actions are pills on every element", () => {
  it("recipe self-test", () => {
    expect(actionRecipe("px-4 py-3 bg-primary text-white rounded-lg")).toBe("filled");
    expect(actionRecipe("border border-primary text-primary rounded-sm")).toBe("outlined");
    expect(actionRecipe("bg-primary/10 text-primary")).toBe(null);
    expect(actionRecipe("border border-border text-text hover:border-primary")).toBe(null);
    expect(actionRecipe("bg-primary-dark text-white rounded-sm")).toBe("filled");
    expect(actionRecipe("bg-primary/90 text-white")).toBe("filled");
    // variant-prefixed tokens describe a state, not the element's look
    expect(actionRecipe("bg-surface text-text hover:bg-primary hover:text-white")).toBe(null);
    expect(actionRecipe("border border-border text-primary hover:border-primary")).toBe(null);
  });

  it("self-test: the element kinds and both recipes", () => {
    const link = '<Link href="/x" className="inline-block bg-primary text-white px-8 py-3 rounded-sm">x</Link>';
    expect(offShapeActions(`const X = () => ${link};`)).toEqual(["Link@1"]);
    expect(offShapeActions('const X = () => <a className="border border-primary text-primary rounded-lg">x</a>;')).toEqual(["a@1"]);
    expect(offShapeActions('const X = () => <a className="border border-primary text-primary rounded-full">x</a>;')).toEqual([]);
    // template literal: static parts are read, ${…} is not
    expect(offShapeActions("const X = () => <button className={`flex rounded-lg bg-primary text-background ${c}`}>s</button>;")).toEqual(["button@1"]);
    // not an action: a chip / card with a green tint
    expect(offShapeActions('const X = () => <button className="rounded-lg bg-primary/10 text-primary">x</button>;')).toEqual([]);
  });

  it("no new off-shape action outside the ratchet", () => {
    const files = ["app", "components"].flatMap((d) => walk(path.join(ROOT, d)));
    expect(files.length, "corpus control").toBeGreaterThan(200);
    const offenders = [];
    const seen = { actions: 0 };
    for (const f of files) {
      const rel = path.relative(ROOT, f).split(path.sep).join("/");
      const hits = offShapeActions(fs.readFileSync(f, "utf8"), seen);
      const allowed = ALLOWED[rel] || 0;
      if (hits.length > allowed) offenders.push(`${rel}: ${hits.length} off-shape actions (allowed ${allowed}) — ${hits.join(", ")}`);
      if (hits.length < allowed) offenders.push(`${rel}: ratchet is stale — lower ALLOWED to ${hits.length}`);
    }
    expect(offenders).toEqual([]);
    // control: the walker really sees action-styled elements (all pills now)
    expect(seen.actions, "corpus control").toBeGreaterThan(20);
  }, 60_000);
});
