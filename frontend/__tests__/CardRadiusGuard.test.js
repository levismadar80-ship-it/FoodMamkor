/**
 * MEH-3091 — one corner radius per surface kind.
 *
 * Content card or panel → rounded-lg (16px) · small row / chip → rounded-md ·
 * field → rounded-sm · dialog, sheet, large media → rounded-xl (a bottom sheet
 * rounds its top only: rounded-t-xl). ProducerCard stays square (Assembly v2).
 * 13/11 there were 12/16/20/24px panels side by side, plus rounded-2xl/3xl,
 * which are not on the token scale (tailwind.tokens.json: sm md lg xl).
 *
 * Two checks, both on static class strings in app/ and components/:
 *  1. no rounded-2xl / rounded-3xl (any side, any breakpoint);
 *  2. a padded panel (border or tinted card background + p-N, not an overlay)
 *     is never rounded-xl — that is the dialog radius.
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import traverseMod from "@babel/traverse";

const traverse = traverseMod.default || traverseMod;
const ROOT = path.resolve(__dirname, "..");
// The products thread (MEH-3021) owns these two; lift when it lands.
const EXEMPT = new Set([
  "components/public/ProductSheet.jsx",
  "app/[locale]/producer/[id]/components/ProducerSections.jsx",
]);

const OFF_SCALE = /(?:^|\s)(?:[a-z0-9-]+:)*rounded(?:-[tbse]{1,2})?-(?:2xl|3xl)(?=\s|$)/;
// a bordered box, or a tinted one (surface tokens, green-50, any /5–/10 wash)
const PANEL_SURFACE = /(?:^|\s)(?:border|border-2|bg-surface-card|bg-surface|bg-background-alt|bg-green-50|bg-(?:primary|accent|green-[0-9]+|gold[a-z-]*)\/(?:5|10))(?=\s|$)/;
const PADDED = /(?:^|\s)(?:p|px|py)-\d/;
const OVERLAY = /(?:^|\s)(?:fixed|absolute)(?=\s|$)/;
const XL = /(?:^|\s)rounded-xl(?=\s|$)/;

export function radiusIssues(src) {
  const ast = parse(src, { sourceType: "module", plugins: ["jsx"] });
  const hits = [];
  const check = (text, line) => {
    if (OFF_SCALE.test(text)) hits.push(`off-scale@${line}`);
    else if (XL.test(text) && PANEL_SURFACE.test(text) && PADDED.test(text) && !OVERLAY.test(text)) hits.push(`panel-xl@${line}`);
  };
  traverse(ast, {
    StringLiteral(p) { check(p.node.value, p.node.loc.start.line); },
    TemplateElement(p) { check(p.node.value.raw, p.node.loc.start.line); },
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

describe("MEH-3091 — card and panel radius", () => {
  it("self-test", () => {
    // anchored to the pre-MEH-3091 GroupBuyDetailClient.jsx:303 join card and AboutClient.jsx:588 article
    expect(radiusIssues('const a = <div className="rounded-2xl border border-border bg-surface-card p-5" />;')).toEqual(["off-scale@1"]);
    expect(radiusIssues('const a = <article className="scroll-mt-24 rounded-xl border border-border bg-surface-card p-5" />;')).toEqual(["panel-xl@1"]);
    expect(radiusIssues('const a = "fixed inset-x-0 bottom-0 rounded-t-3xl";')).toEqual(["off-scale@1"]);
    expect(radiusIssues('const a = "md:rounded-2xl";')).toEqual(["off-scale@1"]);
    // dialog on xl, media on xl, and the fixed panel radius pass
    expect(radiusIssues('const a = "fixed inset-x-4 rounded-xl bg-surface border p-6";')).toEqual([]);
    expect(radiusIssues('const a = "relative overflow-hidden md:rounded-xl";')).toEqual([]);
    expect(radiusIssues('const a = "rounded-lg border border-border bg-surface-card p-5";')).toEqual([]);
    expect(radiusIssues("// rounded-2xl in a comment\nconst a = 1;")).toEqual([]);
    // reviewer finding (13/11): px/py-only and tinted panels — the pre-fix
    // GroupBuyDetailClient.jsx:316 price box and a bg-primary/5 aside
    expect(radiusIssues('const a = "rounded-xl border border-border px-3 py-2.5";')).toEqual(["panel-xl@1"]);
    expect(radiusIssues('const a = "rounded-xl bg-primary/5 p-5";')).toEqual(["panel-xl@1"]);
  });

  it("every card and panel is on the radius rule", () => {
    const files = ["app", "components"].flatMap((d) => walk(path.join(ROOT, d)));
    expect(files.length, "corpus control").toBeGreaterThan(200);
    const offenders = [];
    for (const f of files) {
      const rel = path.relative(ROOT, f).split(path.sep).join("/");
      if (EXEMPT.has(rel)) continue;
      const hits = radiusIssues(fs.readFileSync(f, "utf8"));
      if (hits.length) offenders.push(`${rel}: ${hits.join(", ")}`);
    }
    expect(offenders).toEqual([]);
    for (const rel of EXEMPT) expect(fs.existsSync(path.join(ROOT, rel)), `stale exemption ${rel}`).toBe(true);
  });
});
