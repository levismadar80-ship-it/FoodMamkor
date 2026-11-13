/**
 * MEH-3089 — every phosphor icon uses the size scale and the three weights.
 *
 * Scale: 12/14/16/18/20/24 for UI, 32/40/48/64 for display (empty states,
 * page heads). Weights: regular, bold, fill. Was 28 sizes and 6 weights (13/11).
 * Only literal size/weight props on components imported from
 * @phosphor-icons/react are read; a computed size is the caller's business.
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import traverseMod from "@babel/traverse";

const traverse = traverseMod.default || traverseMod;
const ROOT = path.resolve(__dirname, "..");
export const ICON_SIZES = new Set([12, 14, 16, 18, 20, 24, 32, 40, 48, 64]);
export const ICON_WEIGHTS = new Set(["regular", "bold", "fill"]);

export function offScaleIcons(src, seen = { icons: 0 }) {
  if (!src.includes("@phosphor-icons/react")) return [];
  const ast = parse(src, { sourceType: "module", plugins: ["jsx"] });
  const icons = new Set();
  for (const n of ast.program.body) {
    if (n.type === "ImportDeclaration" && n.source.value.startsWith("@phosphor-icons/react")) {
      for (const s of n.specifiers) icons.add(s.local.name);
    }
  }
  const hits = [];
  traverse(ast, {
    JSXOpeningElement(p) {
      const nm = p.node.name;
      if (nm.type !== "JSXIdentifier" || !icons.has(nm.name)) return;
      seen.icons++;
      for (const a of p.node.attributes) {
        if (a.type !== "JSXAttribute" || !a.value) continue;
        const v = a.value.type === "JSXExpressionContainer" ? a.value.expression : a.value;
        const line = p.node.loc.start.line;
        if (a.name.name === "size") {
          const n = v.type === "NumericLiteral" ? v.value : v.type === "StringLiteral" && /^\d+$/.test(v.value) ? +v.value : null;
          if (n !== null && !ICON_SIZES.has(n)) hits.push(`${nm.name} size=${n}@${line}`);
        }
        if (a.name.name === "weight" && v.type === "StringLiteral" && !ICON_WEIGHTS.has(v.value)) {
          hits.push(`${nm.name} weight=${v.value}@${line}`);
        }
      }
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

describe("MEH-3089 — icon size scale and weights", () => {
  it("self-test: off-scale size and weight red, non-phosphor and computed sizes don't", () => {
    const imp = 'import { X, Basket } from "@phosphor-icons/react";\n';
    // anchored to the pre-MEH-3089 Lightbox.jsx close button and BagRow.jsx basket
    expect(offScaleIcons(imp + "const a = <X size={22} />;")).toEqual(["X size=22@2"]);
    expect(offScaleIcons(imp + 'const a = <Basket weight="duotone" />;')).toEqual(["Basket weight=duotone@2"]);
    expect(offScaleIcons(imp + 'const a = <X size={24} weight="bold" />;')).toEqual([]);
    expect(offScaleIcons(imp + "const a = <X size={s} />;")).toEqual([]);
    expect(offScaleIcons(imp + "const a = <Spinner size={22} />;")).toEqual([]);
  });

  it("every icon in app/ and components/ is on the scale", () => {
    const files = ["app", "components"].flatMap((d) => walk(path.join(ROOT, d)));
    const seen = { icons: 0 };
    const offenders = [];
    for (const f of files) {
      const hits = offScaleIcons(fs.readFileSync(f, "utf8"), seen);
      if (hits.length) offenders.push(`${path.relative(ROOT, f).split(path.sep).join("/")}: ${hits.join(", ")}`);
    }
    expect(seen.icons, "corpus control: the walker sees phosphor icons").toBeGreaterThan(500);
    expect(offenders).toEqual([]);
  });
});
