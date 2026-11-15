/**
 * MEH-3020 — every row heading on the home page is the shared <SectionHeading>
 * (components/ui/SectionHeading.jsx), never a hand-sized <h2>.
 *
 * Until 13/11 each home row chose its own h2 size: 24px (favourites, recently
 * viewed, in season), 32px (businesses, «מה קורה»), 48px («גלו לפי קטגוריה» —
 * the h1 display size) and a 20px sans caption (the mini map). Nothing shared
 * owned the size, so nothing noticed. This guard fails when:
 *   1. a home file renders a raw <h2> that is not in BAND_EXCEPTIONS, or
 *   2. a <SectionHeading> is handed a size / weight / family / tracking
 *      class, a non-literal className, `as=` or `size=` — any of which would
 *      bring the per-file drift back (leading-* and a colour are allowed).
 *
 * The file list is DERIVED: everything under app/[locale]/home, every
 * components/Home*, and every component HomeClient.jsx imports directly
 * (RescueHomeModule, FridayDeliveryStrip …), so a new home row is covered the
 * day HomeClient imports it.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import traverseMod from "@babel/traverse";

const traverse = traverseMod.default || traverseMod;
const ROOT = path.resolve(__dirname, "..");

// A full-bleed band or banner is not a row; it keeps its own h2. Each
// exception names the file AND the expression inside the h2, so swapping the
// band's h2 for a raw row h2 still fails.
const BAND_EXCEPTIONS = [
  // the green «היכרות» band: its eyebrow is the h2, on a dark ground
  { file: "app/[locale]/home/HomeStaticBlocks.jsx", inner: 't("eyebrow")' },
  // the Friday delivery banner strip above the rows
  { file: "components/FridayDeliveryStrip.jsx", inner: 't("title_alt")' },
  // a dialog title, not a row (the city picker HomeClient opens)
  { file: "components/LocationModal.jsx", inner: 't("title")' },
];

const SIZE_TOKEN = /^(?:[a-z0-9-]+:)*!?(?:tracking-\S+|font-(?:sans|serif|mono)|text-(?:2xs|xs|sm|base|lg|xl|[2-9]xl|headline-[a-z]+|body-[a-z]+|label-[a-z]+|\[[^\]]+\])|font-(?:headline-[a-z]+|body-[a-z]+|thin|light|normal|medium|semibold|bold|extrabold|black))$/;

export function homeFiles() {
  const out = new Set();
  const homeDir = path.join(ROOT, "app/[locale]/home");
  for (const n of fs.readdirSync(homeDir, { recursive: true })) {
    if (/\.(jsx|js|tsx|ts)$/.test(n)) out.add(path.join(homeDir, n));
  }
  const compDir = path.join(ROOT, "components");
  for (const n of fs.readdirSync(compDir)) if (/^Home.*\.(jsx|js|tsx|ts)$/.test(n)) out.add(path.join(compDir, n));
  const client = fs.readFileSync(path.join(homeDir, "HomeClient.jsx"), "utf8");
  for (const m of client.matchAll(/from\s+"@\/(components\/[^"]+)"/g)) {
    for (const ext of [".jsx", ".js", ".tsx", ".ts"]) {
      const p = path.join(ROOT, m[1] + ext);
      if (fs.existsSync(p)) { out.add(p); break; }
    }
  }
  return [...out];
}

// The static text of a className; null when it cannot be read statically
// (a variable, cn(...), a conditional) — the guard fails on null rather
// than skipping it.
function staticClass(attr) {
  if (!attr) return "";
  const v = attr.value;
  if (!v) return "";
  if (v.type === "StringLiteral") return v.value;
  if (v.type === "JSXExpressionContainer") {
    const e = v.expression;
    if (e.type === "StringLiteral") return e.value;
    if (e.type === "TemplateLiteral" && e.expressions.length === 0) return e.quasis[0].value.cooked;
  }
  return null;
}

function tagName(n) {
  if (n.type === "JSXIdentifier") return n.name;
  if (n.type === "JSXMemberExpression") return n.property.name; // motion.h2
  return "";
}

export function findOffenders(src) {
  const ast = parse(src, { sourceType: "module", plugins: ["jsx"] });
  const rawH2 = [];
  const sizedSection = [];
  traverse(ast, {
    JSXElement(p) {
      const open = p.node.openingElement;
      const name = tagName(open.name);
      const line = open.loc.start.line;
      const attr = (k) => open.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === k);
      if (name === "h2") {
        const inner = src.slice(open.end, p.node.closingElement ? p.node.closingElement.start : open.end).trim();
        rawH2.push({ line, inner });
      }
      if (name === "SectionHeading") {
        if (attr("as")) sizedSection.push(`${line}: as= (a row heading is the h2)`);
        if (attr("size")) sizedSection.push(`${line}: size= (a home row is the page role)`);
        const cls = staticClass(attr("className"));
        if (cls === null) { sizedSection.push(`${line}: non-literal className`); return; }
        const bad = cls.split(/\s+/).filter((t) => SIZE_TOKEN.test(t));
        if (bad.length) sizedSection.push(`${line}: ${bad.join(" ")}`);
      }
    },
  });
  return { rawH2, sizedSection };
}

function unexcused(rel, rawH2) {
  return rawH2.filter(
    (h) => !BAND_EXCEPTIONS.some((e) => e.file === rel && h.inner.includes(`{${e.inner}}`)),
  );
}

describe("MEH-3020 classifier self-test", () => {
  it("flags the pre-fix categories heading (48px display h2)", () => {
    const old = `export default () => <h2 className="font-headline-display text-headline-display text-text">x</h2>;`;
    expect(findOffenders(old).rawH2.map((h) => h.line)).toEqual([1]);
  });
  it("flags motion.h2 and a raw h2 placed where a band exception is", () => {
    const src = `export default () => <><motion.h2 className="text-5xl">a</motion.h2><h2>{t("home.x")}</h2></>;`;
    const { rawH2 } = findOffenders(src);
    expect(rawH2.length).toBe(2);
    expect(unexcused("app/[locale]/home/HomeStaticBlocks.jsx", rawH2).length).toBe(2);
  });
  it("excuses only the named band h2", () => {
    const src = `export default () => <h2 className="x">{t("eyebrow")}</h2>;`;
    expect(unexcused("app/[locale]/home/HomeStaticBlocks.jsx", findOffenders(src).rawH2)).toEqual([]);
    expect(unexcused("app/[locale]/home/HomeCategoryGrid.jsx", findOffenders(src).rawH2).length).toBe(1);
  });
  it("flags a size class smuggled into SectionHeading", () => {
    const smuggled = `export default () => <SectionHeading className="md:text-5xl mb-4">x</SectionHeading>;`;
    expect(findOffenders(smuggled).sizedSection).toEqual(["1: md:text-5xl"]);
    for (const t of ["max-md:text-sm", "!text-xs", "md:hover:text-lg", "tracking-wide", "font-sans"]) {
      expect(findOffenders(`export default () => <SectionHeading className="${t}">x</SectionHeading>;`).sizedSection.length, t).toBe(1);
    }
    expect(findOffenders(`export default () => <SectionHeading className={c ? "a" : "b"}>x</SectionHeading>;`).sizedSection).toEqual(["1: non-literal className"]);
    expect(findOffenders(`export default () => <SectionHeading as="h3">x</SectionHeading>;`).sizedSection.length).toBe(1);
    expect(findOffenders(`export default () => <SectionHeading size="content">x</SectionHeading>;`).sizedSection.length).toBe(1);
  });
  it("passes layout-only classes", () => {
    const ok = `export default () => <SectionHeading id="a" className="mb-4">x</SectionHeading>;`;
    expect(findOffenders(ok)).toEqual({ rawH2: [], sizedSection: [] });
  });
});

describe("MEH-3020 home row headings share one size", () => {
  const files = homeFiles();

  it("scans the real home files (derived list, incl. the categories row)", () => {
    const rel = files.map((f) => path.relative(ROOT, f));
    expect(rel).toContain("app/[locale]/home/HomeCategoryGrid.jsx");
    expect(rel).toContain("components/HomeWhatsOn.jsx");
    expect(rel).toContain("components/rescue/RescueHomeModule.jsx");
  });

  for (const f of files) {
    const rel = path.relative(ROOT, f);
    it(`${rel}: no hand-sized h2`, () => {
      const { rawH2, sizedSection } = findOffenders(fs.readFileSync(f, "utf8"));
      expect(sizedSection, `${rel}: size classes on <SectionHeading>`).toEqual([]);
      const bad = unexcused(rel, rawH2);
      expect(bad.map((h) => h.line), `${rel}: raw <h2> — use <SectionHeading>`).toEqual([]);
    });
  }

  it("every band exception still exists (a stale exception is a hole)", () => {
    for (const e of BAND_EXCEPTIONS) {
      const { rawH2 } = findOffenders(fs.readFileSync(path.join(ROOT, e.file), "utf8"));
      expect(rawH2.some((h) => h.inner.includes(`{${e.inner}}`)), `${e.file} ${e.inner}`).toBe(true);
    }
  });

  it("the categories row uses SectionHeading (the 13/11 report)", () => {
    const src = fs.readFileSync(path.join(ROOT, "app/[locale]/home/HomeCategoryGrid.jsx"), "utf8");
    expect(src).toMatch(/<SectionHeading>\s*\{t\("home\.categories\.heading"\)\}/);
  });
});
