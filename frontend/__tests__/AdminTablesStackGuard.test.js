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

describe("admin tables stack on a phone (MEH-2426)", () => {
  it("the scan found the admin tables at all (a dead glob would pass every check below)", () => {
    // Nine tables today; the floor only has to prove the walk reached them.
    expect(files.length).toBeGreaterThanOrEqual(9);
    expect(files.map((f) => f.rel)).toContain("experiences/page.js");
  });

  it("the shared rule exists in globals.css, scoped below md", () => {
    const css = fs.readFileSync(path.join(__dirname, "..", "app", "globals.css"), "utf8");
    expect(css).toMatch(/@media \(max-width: 767\.98px\)\s*\{[\s\S]*?\.table-stack tr/);
    expect(css).toMatch(/\.table-stack td\[data-label\]::before\s*\{[^}]*content:\s*attr\(data-label\)/);
  });

  for (const { rel, src } of files) {
    if (EXCEPTIONS.has(rel)) continue;
    it(`${rel}: every <table> is a .table-stack with labelled cells`, () => {
      const tables = src.match(/<table\b[^>]*>/g) || [];
      for (const tag of tables) expect(tag).toMatch(/table-stack/);
      expect(src).toMatch(/data-label=/);
      // A wrapper that hides overflow is what made the actions unreachable.
      expect(src).not.toMatch(/overflow-hidden"?>\s*\n\s*(\{\/\*[\s\S]*?\*\/\}\s*)?<table/);
    });
  }
});
