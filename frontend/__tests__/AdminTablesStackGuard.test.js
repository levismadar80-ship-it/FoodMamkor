import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// MEH-2426: at 375 the admin tables either clipped their actions column behind
// `overflow-hidden` (/admin/experiences — approve/reject at x < 0, no way to
// reach them) or pushed it behind a sideways scroll. The fix is one shared
// rule: a table under /admin carries `.table-stack` (globals.css), which turns
// each row into a card below md. This guard reads every admin source file and
// fails when a <table> is added without it, so the next queue cannot regress
// the phone silently.
//
// AdminProducersTable is the one sanctioned exception, by decision (MEH-2070):
// it drops four triage columns on mobile and keeps a 3-column table, measured
// on-screen at 375 in that ticket and again here.

const ADMIN_DIR = path.join(__dirname, "..", "app", "[locale]", "admin");
const EXCEPTIONS = new Set(["producers/AdminProducersTable.jsx"]);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return /\.(js|jsx)$/.test(e.name) ? [full] : [];
  });
}

const files = walk(ADMIN_DIR)
  .map((f) => ({ rel: path.relative(ADMIN_DIR, f).split(path.sep).join("/"), src: fs.readFileSync(f, "utf8") }))
  .filter((f) => /<table\b/.test(f.src));

const count = (src, re) => (src.match(re) || []).length;

// Every <th> except one identity column (the row's title, which heads the
// card) needs a labelled or actions cell. Counted per file, so one labelled
// cell can no longer stand in for a whole table.
function unlabelledColumns(src) {
  const headers = count(src, /<th\b/g);
  const tables = count(src, /<table\b/g);
  const covered = count(src, /data-label=/g) + count(src, /data-cell="actions"/g);
  return Math.max(0, headers - tables - covered);
}

// An `overflow-hidden` className that reaches a <table> without an
// `overflow-x-auto` element in between is the experiences bug: whatever
// overflows is clipped with no way to scroll to it. Comments are ignored —
// only className strings count.
function clippingWrappers(src) {
  const hits = [];
  const re = /className=(?:"[^"]*|\{`[^`]*)\boverflow-hidden\b/g;
  let m;
  while ((m = re.exec(src))) {
    const rest = src.slice(m.index);
    const tableAt = rest.search(/<table\b/);
    if (tableAt === -1) continue;
    const between = rest.slice(0, tableAt);
    if (!/className=(?:"[^"]*|\{`[^`]*)\boverflow-x-auto\b/.test(between.slice(m[0].length))) {
      hits.push(src.slice(0, m.index).split("\n").length);
    }
  }
  return hits;
}

describe("guard self-test (MEH-1619 — the checks must be able to fail)", () => {
  // Verbatim shape of the pre-MEH-2426 /admin/experiences wrapper.
  const OLD_EXPERIENCES = `
        <div className="bg-white border border-border rounded-[16px] overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr><th>t</th><th>h</th><th>d</th><th>c</th><th>ai</th><th>a</th></tr></thead>
            <tbody><tr><td>x</td><td data-label="h">y</td></tr></tbody>
          </table>
        </div>`;

  it("flags the old experiences wrapper and its unlabelled columns", () => {
    expect(clippingWrappers(OLD_EXPERIENCES)).toHaveLength(1);
    expect(unlabelledColumns(OLD_EXPERIENCES)).toBe(4);
  });

  it("passes a clipped-corner card whose table scrolls inside it (real file: AdminProducersTable.jsx)", () => {
    const real = fs.readFileSync(path.join(ADMIN_DIR, "producers", "AdminProducersTable.jsx"), "utf8");
    expect(real).toMatch(/overflow-hidden/);
    expect(clippingWrappers(real)).toEqual([]);
  });
});

describe("admin tables stack on a phone (MEH-2426)", () => {
  it("the scan found the admin tables at all (a dead glob would pass every check below)", () => {
    // Ten files carry a <table> today; the floor only has to prove the walk reached them.
    expect(files.length).toBeGreaterThanOrEqual(9);
    expect(files.map((f) => f.rel)).toContain("experiences/page.js");
  });

  it("the shared rule exists in globals.css, scoped below md", () => {
    const css = fs.readFileSync(path.join(__dirname, "..", "app", "globals.css"), "utf8");
    expect(css).toMatch(/@media \(max-width: 767\.98px\)\s*\{[\s\S]*?\.table-stack tr/);
    expect(css).toMatch(/\.table-stack td\[data-label\]::before\s*\{[^}]*content:\s*attr\(data-label\)/);
  });

  for (const { rel, src } of files) {
    it(`${rel}: no overflow-hidden wrapper clips a table`, () => {
      expect(clippingWrappers(src)).toEqual([]);
    });
    if (EXCEPTIONS.has(rel)) continue;
    it(`${rel}: every <table> is a .table-stack`, () => {
      for (const tag of src.match(/<table\b[^>]*>/g) || []) expect(tag).toMatch(/table-stack/);
    });
    it(`${rel}: every column but the row's title has a labelled cell`, () => {
      expect(unlabelledColumns(src)).toBe(0);
    });
  }
});
