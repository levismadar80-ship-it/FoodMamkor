/**
 * MEH-3093 — every modal dialog keeps the same contract.
 *
 * An element with aria-modal="true" must
 *  1. have an accessible name (aria-label or aria-labelledby on it),
 *  2. live in a file that traps focus and returns it — hooks/useDialogFocus,
 *     or its own Tab handler (FilterSheet, Lightbox and friends predate it),
 *  3. live in a file that closes on Escape.
 * 13/11: 13 dialogs let Tab walk out to the page behind, 5 ignored Escape.
 * A file-level check for 2 and 3 is deliberate: the handler sits in an effect
 * or on the element, never at a fixed AST spot.
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import traverseMod from "@babel/traverse";

const traverse = traverseMod.default || traverseMod;
const ROOT = path.resolve(__dirname, "..");
// The products thread (MEH-3021) owns these; lift when its PRs land.
const EXEMPT = new Set(["components/public/ProductSheet.jsx", "components/ProductsSection.jsx"]);

export function dialogIssues(src) {
  if (!src.includes("aria-modal")) return [];
  const ast = parse(src, { sourceType: "module", plugins: ["jsx"] });
  const trap = /useDialogFocus\(|key\s*[!=]==\s*"Tab"|"Tab"\s*[!=]==/.test(src);
  const esc = /"Escape"/.test(src);
  const hits = [];
  traverse(ast, {
    JSXOpeningElement(p) {
      const attrs = p.node.attributes.filter((a) => a.type === "JSXAttribute");
      const modal = attrs.find((a) => a.name.name === "aria-modal");
      if (!modal) return;
      const v = modal.value;
      const isTrue = v?.type === "StringLiteral" ? v.value === "true" : v?.expression?.value === true;
      if (!isTrue) return;
      const line = p.node.loc.start.line;
      if (!attrs.some((a) => a.name.name === "aria-label" || a.name.name === "aria-labelledby")) hits.push(`name@${line}`);
      if (!trap) hits.push(`focus@${line}`);
      if (!esc) hits.push(`escape@${line}`);
    },
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

describe("MEH-3093 — modal dialog contract", () => {
  it("self-test", () => {
    // anchored to the pre-MEH-3093 ReportButton.jsx dialog: named, no trap, no Escape
    expect(dialogIssues('const a = <div role="dialog" aria-modal="true" aria-labelledby="t" />;')).toEqual(["focus@1", "escape@1"]);
    expect(dialogIssues('useDialogFocus(r, o); if (e.key === "Escape") x();\nconst a = <div role="dialog" aria-modal="true" />;')).toEqual(["name@2"]);
    expect(dialogIssues('useDialogFocus(r, o); if (e.key === "Escape") x();\nconst a = <div aria-modal="true" aria-label="x" />;')).toEqual([]);
    expect(dialogIssues('const a = <div role="dialog" aria-modal="false" aria-label="x" />;')).toEqual([]);
  });

  it("every modal dialog in app/ and components/ keeps the contract", () => {
    const files = ["app", "components"].flatMap((d) => walk(path.join(ROOT, d)));
    let dialogs = 0;
    const offenders = [];
    for (const f of files) {
      const rel = path.relative(ROOT, f).split(path.sep).join("/");
      const src = fs.readFileSync(f, "utf8");
      dialogs += (src.match(/aria-modal="true"/g) || []).length;
      if (EXEMPT.has(rel)) continue;
      const hits = dialogIssues(src);
      if (hits.length) offenders.push(`${rel}: ${hits.join(", ")}`);
    }
    expect(dialogs, "corpus control: the walker sees modal dialogs").toBeGreaterThan(20);
    expect(offenders).toEqual([]);
  });
});
