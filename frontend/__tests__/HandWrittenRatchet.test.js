/**
 * MEH-3132 — no NEW hand-written copy of a shared component.
 *
 * The owner guards (ButtonPrimitiveGuard, DialogContractGuard …) each stop one
 * shape. Two shapes had an owner and nothing stopping a new copy:
 *
 *  1. Text field. A bordered raw <input> of a text type is what
 *     components/ui/Input.jsx owns (label + error + describedby in one place).
 *     The existing ones are counted per file in
 *     fixtures/hand-written-baseline.json; moving them is MEH-3102. A file's
 *     count may only go down, and a new file starts at zero. A baseline number
 *     higher than the code also fails, so the list shrinks as fields move.
 *     Checkbox / radio / file / hidden … and <select> / <textarea> are out of
 *     scope: ui/Input does not own them.
 *  2. Explainer bubble. components/InfoTooltip.jsx predates ui/Tooltip.jsx.
 *     No new importer of InfoTooltip, and role="tooltip" is written only in
 *     the owners.
 *
 * Regenerate the baseline after moving fields:
 *   UPDATE_HAND_WRITTEN_BASELINE=1 npx vitest run __tests__/HandWrittenRatchet.test.js
 * It only ever writes what the code holds, so it cannot hide a new field
 * from review: the JSON diff shows the number going up.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import traverseMod from "@babel/traverse";

const traverse = traverseMod.default || traverseMod;
const ROOT = path.resolve(__dirname, "..");
const BASELINE = path.join(__dirname, "fixtures", "hand-written-baseline.json");
const NOT_TEXT = new Set(["checkbox", "radio", "hidden", "file", "range", "color", "submit", "button", "image", "reset"]);
const BORDERED = /(^|\s)border(-2)?(?=\s|$)/;
const TOOLTIP_OWNERS = new Set(["components/InfoTooltip.jsx", "components/ui/Tooltip.jsx", "components/ui/Popover.jsx"]);

function classText(p, attr) {
  if (attr.value.type === "StringLiteral") return attr.value.value;
  const parts = [];
  p.traverse({
    StringLiteral(q) { if (q.findParent((x) => x.node === attr)) parts.push(q.node.value); },
    TemplateElement(q) { if (q.findParent((x) => x.node === attr)) parts.push(q.node.value.raw); },
  });
  return parts.join(" ");
}

/** How many bordered raw text <input>s a source holds. */
export function rawTextFields(src) {
  if (!/<input\b/.test(src)) return 0;
  const ast = parse(src, { sourceType: "module", plugins: ["jsx"] });
  let n = 0;
  traverse(ast, {
    JSXOpeningElement(p) {
      if (p.node.name.name !== "input") return;
      const attrs = p.node.attributes.filter((a) => a.type === "JSXAttribute");
      const ty = attrs.find((a) => a.name.name === "type");
      if (ty?.value?.type === "StringLiteral" && NOT_TEXT.has(ty.value.value)) return;
      const ca = attrs.find((a) => a.name.name === "className");
      if (!ca?.value || !BORDERED.test(classText(p, ca))) return;
      n++;
    },
  });
  return n;
}

function sources() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(jsx|js)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push(full);
    }
  };
  walk(path.join(ROOT, "app"));
  walk(path.join(ROOT, "components"));
  return out.map((full) => ({ rel: path.relative(ROOT, full).split(path.sep).join("/"), src: fs.readFileSync(full, "utf8") }));
}

function scan() {
  const fields = {};
  const infoTooltipImporters = [];
  const tooltipRoles = [];
  for (const { rel, src } of sources()) {
    if (rel !== "components/ui/Input.jsx") {
      const n = rawTextFields(src);
      if (n) fields[rel] = n;
    }
    if (/from\s+["'][^"']*\/InfoTooltip["']/.test(src)) infoTooltipImporters.push(rel);
    if (/role=["']tooltip["']/.test(src) && !TOOLTIP_OWNERS.has(rel)) tooltipRoles.push(rel);
  }
  return { fields, infoTooltipImporters: infoTooltipImporters.sort(), tooltipRoles };
}

describe("hand-written copies of a shared component only shrink", () => {
  const now = scan();
  if (process.env.UPDATE_HAND_WRITTEN_BASELINE) {
    const sorted = Object.fromEntries(Object.keys(now.fields).sort().map((k) => [k, now.fields[k]]));
    fs.writeFileSync(BASELINE, `${JSON.stringify({ rawTextFields: sorted, infoTooltipImporters: now.infoTooltipImporters }, null, 2)}\n`);
  }
  const base = JSON.parse(fs.readFileSync(BASELINE, "utf8"));

  it("the counter sees a field it must see, and skips one it must skip", () => {
    expect(rawTextFields('<input type="text" className="border rounded-sm" />')).toBe(1);
    expect(rawTextFields('<input className={`w-full border ${x}`} />')).toBe(1);
    expect(rawTextFields('<input type="checkbox" className="border" />')).toBe(0);
    expect(rawTextFields('<Input type="text" className="border" />')).toBe(0);
    // anchored to a real file: the shared owner itself holds exactly one.
    expect(rawTextFields(fs.readFileSync(path.join(ROOT, "components/ui/Input.jsx"), "utf8"))).toBe(1);
    expect(Object.keys(now.fields).length).toBeGreaterThan(0);
  });

  it("no file has more raw text fields than its baseline — use components/ui/Input.jsx", () => {
    const grew = Object.entries(now.fields)
      .filter(([f, n]) => n > (base.rawTextFields[f] || 0))
      .map(([f, n]) => `${f}: ${base.rawTextFields[f] || 0} → ${n}`);
    expect(grew).toEqual([]);
  });

  it("the baseline is not higher than the code (lower it when fields move)", () => {
    const stale = Object.entries(base.rawTextFields)
      .filter(([f, n]) => (now.fields[f] || 0) < n)
      .map(([f, n]) => `${f}: baseline ${n}, code ${now.fields[f] || 0}`);
    expect(stale).toEqual([]);
  });

  it("no new importer of InfoTooltip — use components/ui/Tooltip.jsx", () => {
    expect(base.infoTooltipImporters.length).toBeGreaterThan(0);
    expect(now.infoTooltipImporters.filter((f) => !base.infoTooltipImporters.includes(f))).toEqual([]);
    expect(base.infoTooltipImporters.filter((f) => !now.infoTooltipImporters.includes(f)), "remove from the baseline").toEqual([]);
  });

  it('role="tooltip" is written only in the owners', () => {
    expect(now.tooltipRoles).toEqual([]);
  });
});
