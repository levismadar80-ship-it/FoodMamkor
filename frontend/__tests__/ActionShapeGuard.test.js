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
 * ALLOWED is a ratchet (13/11): it only shrinks. A new off-shape action fails;
 * fixing one fails until its count is lowered.
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

export function offShapeActions(src) {
  const ast = parse(src, { sourceType: "module", plugins: ["jsx"] });
  const hits = [];
  traverse(ast, {
    JSXOpeningElement(p) {
      const n = p.node.name.name;
      if (!ELEMENTS.has(n)) return;
      const attr = p.node.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === "className");
      const cls = staticClass(attr);
      if (!cls || !actionRecipe(cls)) return;
      if (!/(?:^|\s)rounded-full(?:\s|$)/.test(cls)) hits.push(`${n}@${p.node.loc.start.line}`);
    },
  });
  return hits;
}

// file → off-shape actions still allowed (ratchet, 13/11/2026). Shrink only.
const ALLOWED = {
  "app/[locale]/about/AboutClient.jsx": 1,
  "app/[locale]/admin/content/page.js": 1,
  "app/[locale]/admin/outreach/page.jsx": 1,
  "app/[locale]/admin/producers/AdminProducersToolbar.jsx": 1,
  "app/[locale]/admin/settings/page.js": 1,
  "app/[locale]/claim/ClaimClient.jsx": 2,
  "app/[locale]/events/EventsClient.jsx": 1,
  "app/[locale]/home/HomeProducersGrid.jsx": 3,
  "app/[locale]/map/components/MapPane.jsx": 1,
  "app/[locale]/producer/dashboard/events/new/page.js": 1,
  "app/[locale]/producer/dashboard/events/page.js": 1,
  "app/[locale]/producer/dashboard/experiences/page.js": 1,
  "app/[locale]/producer/dashboard/page.js": 2,
  "app/[locale]/register/RegisterClient.jsx": 2,
  "app/[locale]/register/producer/RegisterProducerClient.jsx": 3,
  "components/FilterSheet.jsx": 1,
  "components/LoginPromptModal.jsx": 1,
  "components/ProducersClient.jsx": 3,
  "components/ReviewsSection.jsx": 1,
  "components/admin/ClaimLinkPanel.jsx": 1,
  "components/admin/OwnerInvitePanel.jsx": 1,
  "components/dashboard/RescueTab.jsx": 3,
};

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
    let actions = 0;
    for (const f of files) {
      const rel = path.relative(ROOT, f).split(path.sep).join("/");
      const hits = offShapeActions(fs.readFileSync(f, "utf8"));
      actions += hits.length;
      const allowed = ALLOWED[rel] || 0;
      if (hits.length > allowed) offenders.push(`${rel}: ${hits.length} off-shape actions (allowed ${allowed}) — ${hits.join(", ")}`);
      if (hits.length < allowed) offenders.push(`${rel}: ratchet is stale — lower ALLOWED to ${hits.length}`);
    }
    expect(offenders).toEqual([]);
    expect(actions, "corpus control: the ratchet still has entries to burn down").toBeGreaterThan(0);
  }, 60_000);
});
