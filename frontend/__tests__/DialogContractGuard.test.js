/**
 * MEH-3093 — every modal dialog keeps the same contract.
 *
 * An element with aria-modal="true" must
 *  1. have an accessible name (aria-label or aria-labelledby on it),
 *  2. live in a file that traps focus and returns it — hooks/useDialogFocus,
 *     or its own Tab handler (FilterSheet, Lightbox and friends predate it),
 *  3. live in a file that closes on Escape.
 * 13/11: 13 dialogs let Tab walk out to the page behind, 5 ignored Escape.
 * MEH-3096: a <Dialog> from components/ui carries 2 and 3 itself, so a use of
 * it only has to name the dialog (labelledBy or label).
 * A file-level check for 2 and 3 is deliberate: the handler sits in an effect
 * or on the element, never at a fixed AST spot.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import traverseMod from "@babel/traverse";

const traverse = traverseMod.default || traverseMod;
const ROOT = path.resolve(__dirname, "..");
// The products thread (MEH-3021) owns these; lift when its PRs land.
const EXEMPT = new Set(["components/public/ProductSheet.jsx", "components/ProductsSection.jsx"]);

export function dialogIssues(src) {
  if (!src.includes("aria-modal") && !src.includes("<Dialog")) return [];
  const ast = parse(src, { sourceType: "module", plugins: ["jsx"] });
  const trap = /useDialogFocus\(|key\s*[!=]==\s*"Tab"|"Tab"\s*[!=]==/.test(src);
  const esc = /"Escape"|useDialogEscape\(/.test(src);
  const hits = [];
  traverse(ast, {
    JSXOpeningElement(p) {
      const attrs = p.node.attributes.filter((a) => a.type === "JSXAttribute");
      if (p.node.name.type === "JSXIdentifier" && p.node.name.name === "Dialog") {
        if (!attrs.some((a) => a.name.name === "labelledBy" || a.name.name === "label")) hits.push(`name@${p.node.loc.start.line}`);
        return;
      }
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
    // a shared <Dialog> needs only its name
    expect(dialogIssues("const a = <Dialog onClose={c}>x</Dialog>;")).toEqual(["name@1"]);
    expect(dialogIssues('const a = <Dialog labelledBy="t" onClose={c}>x</Dialog>;')).toEqual([]);
    // real files, read from disk: ReportButton.jsx (a <Dialog> user) and the
    // shell itself keep the contract
    const user = fs.readFileSync(path.join(ROOT, "components/ReportButton.jsx"), "utf8");
    expect(user).toContain("<Dialog");
    expect(dialogIssues(user)).toEqual([]);
    expect(dialogIssues(user.replace('labelledBy="report-dialog-title"', ""))[0]).toMatch(/^name@/);
    const real = fs.readFileSync(path.join(ROOT, "components/ui/Dialog.jsx"), "utf8");
    expect(dialogIssues(real)).toEqual([]);
    // ...and stripped of its hooks it reds exactly on the two missing halves
    const stripped = real.replace(/useDialogFocus\([^)]*\);/g, "").replace(/useDialogEscape\([^;]*\);/g, "");
    expect(dialogIssues(stripped).map((h) => h.split("@")[0])).toEqual(["focus", "escape"]);
  });

  it("every modal dialog in app/ and components/ keeps the contract", () => {
    const files = ["app", "components"].flatMap((d) => walk(path.join(ROOT, d)));
    let dialogs = 0;
    const offenders = [];
    for (const f of files) {
      const rel = path.relative(ROOT, f).split(path.sep).join("/");
      const src = fs.readFileSync(f, "utf8");
      dialogs += (src.match(/aria-modal="true"|<Dialog\b/g) || []).length;
      if (EXEMPT.has(rel)) continue;
      const hits = dialogIssues(src);
      if (hits.length) offenders.push(`${rel}: ${hits.join(", ")}`);
    }
    expect(dialogs, "corpus control: the walker sees modal dialogs").toBeGreaterThan(20);
    expect(offenders).toEqual([]);
  });
});

// MEH-3096 — a centred modal is a <Dialog>, not a hand-built overlay. A class
// string with fixed + inset-0 + items-center (and no items-end, which marks a
// phone bottom sheet) outside the shell is a second copy of it.
const OVERLAY_OWNERS = new Map([
  ["components/ui/Dialog.jsx", "the shell itself"],
  ["components/LoginPromptModal.jsx", "interrupt tier, stacks above ordinary modals"],
  ["components/Lightbox.jsx", "full-bleed image viewer, bg-black/95"],
  ["components/ProductsSection.jsx", "products thread (MEH-3021) owns it; lift when it lands"],
]);

export function centredOverlays(src) {
  const hits = [];
  src.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/["'`]([^"'`]*)["'`]/g)) {
      const c = ` ${m[1]} `;
      if (/\sfixed\s/.test(c) && /\sinset-0\s/.test(c) && /\sitems-center\s/.test(c) && !/\sitems-end\s/.test(c)) hits.push(i + 1);
    }
  });
  return hits;
}

describe("MEH-3096 — centred modals use ui/Dialog", () => {
  it("self-test", () => {
    // anchored to the pre-MEH-3096 admin/kashrut approve overlay
    expect(centredOverlays('<div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">')).toEqual([1]);
    // a phone bottom sheet that centres from sm: up is not a centred modal
    expect(centredOverlays('<div className="fixed inset-0 flex items-end sm:items-center">')).toEqual([]);
    expect(centredOverlays('<div className="fixed bottom-0 inset-x-0 flex items-center">')).toEqual([]);
    const shell = fs.readFileSync(path.join(ROOT, "components/ui/Dialog.jsx"), "utf8");
    expect(centredOverlays(shell).length).toBe(1);
  });

  it("no centred overlay outside the shell and its named owners", () => {
    const files = ["app", "components"].flatMap((d) => walk(path.join(ROOT, d)));
    let owners = 0;
    const offenders = [];
    for (const f of files) {
      const rel = path.relative(ROOT, f).split(path.sep).join("/");
      const hits = centredOverlays(fs.readFileSync(f, "utf8"));
      if (!hits.length) continue;
      if (OVERLAY_OWNERS.has(rel)) owners += 1;
      else offenders.push(`${rel}:${hits.join(",")}`);
    }
    // corpus control: every named owner still has its overlay (a stale entry reds)
    expect(owners).toBe(OVERLAY_OWNERS.size);
    expect(offenders).toEqual([]);
  });
});
