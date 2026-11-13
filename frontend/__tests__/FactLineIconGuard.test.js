/**
 * MEH-3028 — icons on the business page live on FACT LINES, never in a
 * section heading.
 *
 * Sapir's decision (13/11, option א, research artifact FGymGHjHMLDCstmSEDP2Bm):
 * a section heading is text only, everywhere; an icon marks one KIND of fact
 * (delivery fee → truck, order cutoff / hours → clock, city → pin, pickup →
 * package) and is drawn by <FactLine>, which fixes its size and colour. Before
 * this, «משלוחים» was the only heading on the site with an icon, the truck sat
 * on every day label too, and the city pin was grey 14 while the fee truck was
 * green 16 — three different answers to one question.
 *
 * Two guards:
 *  1. Site-wide: no Phosphor icon (or raw <svg>) inside a <SectionHeading>.
 *  2. Business-page files: a Phosphor icon rendered RAW (not via FactLine's
 *     `icon` prop) is allowed only as listed in RAW_ALLOWED, with its reason —
 *     buttons, links, answer states, the nationwide chip, the legal note. The
 *     counts are exact, so a new raw icon AND a stale entry both go red.
 *
 * Blind spot, on purpose: an icon reached through a variable (`const Icon =
 * …; <Icon/>`) is not a Phosphor-named element and is not counted; the hours
 * card headers in OrderWindowStrip use that shape and are card titles, not
 * fact lines.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import traverseMod from "@babel/traverse";

const traverse = traverseMod.default || traverseMod;
const ROOT = path.resolve(__dirname, "..");
const OUT_OF_SCOPE = /__tests__|\.(test|spec)\.|(^|\/)node_modules(\/|$)|(^|\/)\.next(\/|$)/;

const parseSrc = (src) =>
  parse(src, { sourceType: "module", plugins: ["jsx"], errorRecovery: true });

/** Local names bound to an import from @phosphor-icons/react (aliases too). */
function phosphorNames(ast) {
  const names = new Set();
  traverse(ast, {
    ImportDeclaration(p) {
      if (!/^@phosphor-icons\/react(\/|$)/.test(p.node.source.value)) return;
      for (const s of p.node.specifiers) names.add(s.local.name);
    },
  });
  return names;
}

const elName = (opening) => (opening.name.type === "JSXIdentifier" ? opening.name.name : null);

/** Icons (Phosphor-named, or a raw <svg>) found inside any <SectionHeading>. */
export function iconsInSectionHeadings(src) {
  const ast = parseSrc(src);
  const icons = phosphorNames(ast);
  const hits = [];
  traverse(ast, {
    JSXElement(p) {
      if (elName(p.node.openingElement) !== "SectionHeading") return;
      p.traverse({
        JSXOpeningElement(q) {
          const n = elName(q.node);
          if (n && (icons.has(n) || n === "svg")) hits.push(`${n}@${q.node.loc.start.line}`);
        },
      });
    },
  });
  return hits;
}

/** name → count of Phosphor icons rendered as JSX elements in the file. */
export function rawIconCounts(src) {
  const ast = parseSrc(src);
  const icons = phosphorNames(ast);
  const counts = {};
  traverse(ast, {
    JSXOpeningElement(p) {
      const n = elName(p.node);
      if (n && icons.has(n)) counts[n] = (counts[n] || 0) + 1;
    },
  });
  return counts;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (OUT_OF_SCOPE.test(path.relative(ROOT, full))) continue;
    if (e.isDirectory()) walk(full, out);
    else if (/\.(jsx|js)$/.test(e.name)) out.push(full);
  }
  return out;
}

// Business-page files → the raw Phosphor icons each may render, and why.
// Everything else on these files that wants an icon goes through <FactLine>.
const RAW_ALLOWED = {
  "components/DeliveryBlock.jsx": {
    Truck: 1, // the «משלוח לכל הארץ» chip — a badge, not a fact line
    CaretDown: 3, // the three show-more / show-less toggle buttons
    CaretUp: 3, // (delivery areas, compact cities, pickup stands)
    Phone: 1, // tap-to-call link on a pickup stand
  },
  "components/DeliveryChecker.jsx": {
    CheckCircle: 1, // «כן, מגיעים» answer state
    XCircle: 1, // «לא מגיעים» answer state
  },
  "app/[locale]/producer/[id]/components/ProducerSections.jsx": {
    CaretLeft: 2, // row chevrons on tappable product / recipe rows
    Info: 1, // the legal disclaimer in the fine print (MEH-2999)
  },
  "app/[locale]/producer/[id]/components/OrderWindowStrip.jsx": {
    CaretDown: 1, // special-dates disclosure button
  },
};

describe("MEH-3028 — the matchers work on known answers (control)", () => {
  it("finds an icon inside a SectionHeading, and nothing when there is none", () => {
    const bad = `import { Truck } from "@phosphor-icons/react";
      export default () => <SectionHeading><Truck size={22} />משלוחים</SectionHeading>;`;
    const aliased = `import { Truck as T } from "@phosphor-icons/react";
      export default () => <SectionHeading size="content"><span><T /></span>x</SectionHeading>;`;
    const svg = `export default () => <SectionHeading><svg />x</SectionHeading>;`;
    const ok = `import { Truck } from "@phosphor-icons/react";
      export default () => <><SectionHeading>משלוחים</SectionHeading><Truck size={16} /></>;`;
    expect(iconsInSectionHeadings(bad)).toEqual(["Truck@2"]);
    expect(iconsInSectionHeadings(aliased)).toEqual(["T@2"]);
    expect(iconsInSectionHeadings(svg)).toEqual(["svg@1"]);
    expect(iconsInSectionHeadings(ok)).toEqual([]);
  });

  it("counts raw icons but not an icon handed to FactLine", () => {
    const src = `import { Truck, Clock } from "@phosphor-icons/react";
      export default () => <><Truck size={14} /><Truck /><FactLine icon={Clock}>x</FactLine></>;`;
    expect(rawIconCounts(src)).toEqual({ Truck: 2 });
  });

  it("anchored to a real file: the matcher sees DeliveryBlock's imports", () => {
    const src = fs.readFileSync(path.join(ROOT, "components/DeliveryBlock.jsx"), "utf8");
    // The file renders Phosphor icons today (the toggle carets at least), so a
    // dead matcher returning {} would fail here rather than pass the guards.
    expect(Object.keys(rawIconCounts(src)).length).toBeGreaterThan(0);
  });
});

describe("MEH-3028 — no icon in any section heading (site-wide)", () => {
  const files = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "components"))];

  it("scans a real corpus", () => {
    // Control against a silent empty walk: the site has well over 100 such files.
    expect(files.length).toBeGreaterThan(100);
  });

  it("every <SectionHeading> is text only", () => {
    const offenders = files.flatMap((f) =>
      iconsInSectionHeadings(fs.readFileSync(f, "utf8")).map(
        (h) => `${path.relative(ROOT, f)} ${h}`,
      ),
    );
    expect(
      offenders,
      "A section heading is text only (MEH-3028). Put the icon on the first fact line " +
        "under it, through <FactLine icon={…}> (components/ui/FactLine.jsx).",
    ).toEqual([]);
  });
});

describe("MEH-3028 — business page: icons go through FactLine", () => {
  for (const [rel, allowed] of Object.entries(RAW_ALLOWED)) {
    it(`${rel} renders only its listed raw icons`, () => {
      const counts = rawIconCounts(fs.readFileSync(path.join(ROOT, rel), "utf8"));
      expect(
        counts,
        "A fact line's icon goes through <FactLine icon={…}> (MEH-3028), which fixes " +
          "its size and colour. A raw icon here needs a reason in RAW_ALLOWED " +
          "(button, link, chip, answer state); a removed one lowers its count.",
      ).toEqual(allowed);
    });
  }
});
