/**
 * MEH-3142: .claude/rules/frontend.md lists the shared helpers in frontend/lib
 * so a session imports the owner instead of writing a second one. The table is
 * only useful while it is true: every file it names exists, and every export
 * it names is really exported by one of that row's files.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const RULE = path.join(ROOT, "..", ".claude", "rules", "frontend.md");
const HEADING = "## Shared helpers";

function rows() {
  const text = fs.readFileSync(RULE, "utf8");
  const start = text.indexOf(HEADING);
  if (start === -1) throw new Error(`frontend.md has no "${HEADING}" section`);
  const next = text.indexOf("\n## ", start + HEADING.length);
  const section = next === -1 ? text.slice(start) : text.slice(start, next);
  return section
    .split("\n")
    .filter((l) => l.startsWith("|") && !/^\|\s*-/.test(l))
    .slice(1)
    .map((l) => {
      const cells = l.split("|");
      const ticks = (c) => [...(c || "").matchAll(/`([^`]+)`/g)].map((m) => m[1]);
      return { need: (cells[1] || "").trim(), files: ticks(cells[2]), names: ticks(cells[3]) };
    });
}

/** Is `name` exported (function / const / re-export list) by this source? */
function exportsName(src, name) {
  const direct = new RegExp(`export\\s+(?:async\\s+)?(?:function|const|let|class)\\s+${name}\\b`);
  const listed = new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`);
  return direct.test(src) || listed.test(src);
}

describe("frontend.md shared-helpers table", () => {
  const table = rows();

  it("recognises an export, and a missing one (self-test)", () => {
    const src = "export function formatDate() {}\nconst hidden = 1;\nexport { a, shareOrCopy };";
    expect(exportsName(src, "formatDate")).toBe(true);
    expect(exportsName(src, "shareOrCopy")).toBe(true);
    expect(exportsName(src, "hidden")).toBe(false);
    expect(exportsName(src, "format")).toBe(false);
  });

  it("has rows, each with a file and an export", () => {
    expect(table.length).toBeGreaterThanOrEqual(10);
    expect(table.filter((r) => r.files.length === 0 || r.names.length === 0).map((r) => r.need)).toEqual([]);
  });

  it("names only files that exist in frontend/lib", () => {
    const gone = table.flatMap((r) => r.files).filter((f) => !fs.existsSync(path.join(ROOT, "lib", f)));
    expect(gone).toEqual([]);
  });

  it("names only exports that one of the row's files really exports", () => {
    const missing = table.flatMap((r) => {
      const sources = r.files
        .filter((f) => fs.existsSync(path.join(ROOT, "lib", f)))
        .map((f) => fs.readFileSync(path.join(ROOT, "lib", f), "utf8"));
      return r.names.filter((n) => !sources.some((s) => exportsName(s, n))).map((n) => `${r.need}: ${n}`);
    });
    expect(missing).toEqual([]);
  });
});
