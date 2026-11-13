/**
 * MEH-3020 — every row heading on the home page is the shared <SectionHeading>
 * (components/ui/SectionHeading.jsx), never a hand-sized <h2>.
 *
 * Until 13/11 each home row chose its own h2 size: 24px (favourites, recently
 * viewed, in season), 32px (businesses, «מה קורה»), 48px («גלו לפי קטגוריה» —
 * the h1 display size) and a 20px sans caption (the mini map). Nothing shared
 * owned the size, so nothing noticed. This guard fails when:
 *   1. a home file renders a raw <h2> that is not in BAND_EXCEPTIONS, or
 *   2. a <SectionHeading> is handed a size / weight / family class, which
 *      would bring the per-file drift back through the className prop.
 *
 * The file list is DERIVED (everything under app/[locale]/home plus
 * components/Home*.jsx), so a new home row file is covered the day it lands.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import traverseMod from "@babel/traverse";

const traverse = traverseMod.default || traverseMod;
const ROOT = path.resolve(__dirname, "..");

// A full-bleed band is not a row: the green «היכרות» band sets its eyebrow as
// the h2 on a dark ground (HomeStaticBlocks.jsx HomeFeaturedProducer).
// file → number of raw <h2> still allowed, with the reason above.
const BAND_EXCEPTIONS = {
  "app/[locale]/home/HomeStaticBlocks.jsx": 1,
};

const SIZE_TOKEN = /^(?:[a-z]+:)?(?:text-(?:2xs|xs|sm|base|lg|xl|[2-9]xl|headline-[a-z]+|body-[a-z]+|label-[a-z]+|\[[^\]]+\])|font-(?:headline-[a-z]+|body-[a-z]+|thin|light|normal|medium|semibold|bold|extrabold|black))$/;

export function homeFiles() {
  const out = [];
  const homeDir = path.join(ROOT, "app/[locale]/home");
  for (const n of fs.readdirSync(homeDir)) if (/\.(jsx|js)$/.test(n)) out.push(path.join(homeDir, n));
  const compDir = path.join(ROOT, "components");
  for (const n of fs.readdirSync(compDir)) if (/^Home.*\.(jsx|js)$/.test(n)) out.push(path.join(compDir, n));
  return out;
}

function staticClass(attr) {
  const v = attr && attr.value;
  if (!v) return "";
  if (v.type === "StringLiteral") return v.value;
  if (v.type === "JSXExpressionContainer" && v.expression.type === "TemplateLiteral") {
    return v.expression.quasis.map((q) => q.value.cooked).join(" ");
  }
  if (v.type === "JSXExpressionContainer" && v.expression.type === "StringLiteral") return v.expression.value;
  return "";
}

export function findOffenders(src) {
  const ast = parse(src, { sourceType: "module", plugins: ["jsx"] });
  const rawH2 = [];
  const sizedSection = [];
  traverse(ast, {
    JSXOpeningElement(p) {
      const n = p.node.name;
      if (n.type !== "JSXIdentifier") return;
      const line = p.node.loc.start.line;
      if (n.name === "h2") rawH2.push(line);
      if (n.name === "SectionHeading") {
        const cls = p.node.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === "className");
        const bad = staticClass(cls).split(/\s+/).filter((t) => SIZE_TOKEN.test(t));
        if (bad.length) sizedSection.push(`${line}: ${bad.join(" ")}`);
      }
    },
  });
  return { rawH2, sizedSection };
}

describe("MEH-3020 classifier self-test", () => {
  it("flags the pre-fix categories heading (48px display h2)", () => {
    const old = `export default () => <h2 className="font-headline-display text-headline-display text-text">x</h2>;`;
    expect(findOffenders(old).rawH2).toEqual([1]);
  });
  it("flags a size class smuggled into SectionHeading", () => {
    const smuggled = `export default () => <SectionHeading className="md:text-5xl mb-4">x</SectionHeading>;`;
    expect(findOffenders(smuggled).sizedSection).toEqual(["1: md:text-5xl"]);
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
  });

  for (const f of files) {
    const rel = path.relative(ROOT, f);
    it(`${rel}: no hand-sized h2`, () => {
      const { rawH2, sizedSection } = findOffenders(fs.readFileSync(f, "utf8"));
      expect(sizedSection, `${rel}: size classes on <SectionHeading>`).toEqual([]);
      expect(rawH2.length, `${rel}: raw <h2> at lines ${rawH2.join(", ")} — use <SectionHeading>`).toBe(
        BAND_EXCEPTIONS[rel] || 0,
      );
    });
  }

  it("the categories row uses SectionHeading (the 13/11 report)", () => {
    const src = fs.readFileSync(path.join(ROOT, "app/[locale]/home/HomeCategoryGrid.jsx"), "utf8");
    expect(src).toMatch(/<SectionHeading>\s*\{t\("home\.categories\.heading"\)\}/);
  });
});
