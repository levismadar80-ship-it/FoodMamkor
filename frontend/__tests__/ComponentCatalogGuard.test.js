/**
 * The shared-component table in components/CLAUDE.md is what a new session
 * reads before writing a component. It is only useful while it is true:
 *   1. every file in components/ui/ has a row (a new primitive nobody can
 *      find gets copied instead of reused),
 *   2. every file the table names exists,
 *   3. every guard the table names exists.
 * The list of ui files is read from the folder, never written here.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const CATALOG = path.join(ROOT, "components", "CLAUDE.md");
const HEADING = "## Shared components";

function catalogSection() {
  const text = fs.readFileSync(CATALOG, "utf8");
  const start = text.indexOf(HEADING);
  if (start === -1) throw new Error(`components/CLAUDE.md has no "${HEADING}" section`);
  const next = text.indexOf("\n## ", start + HEADING.length);
  return next === -1 ? text.slice(start) : text.slice(start, next);
}

function tableRows(section) {
  return section.split("\n").filter((l) => l.startsWith("|") && !/^\|\s*-/.test(l)).slice(1);
}

function uiFiles() {
  return fs
    .readdirSync(path.join(ROOT, "components", "ui"))
    .filter((f) => /\.(jsx?|tsx?)$/.test(f) && f !== "index.js");
}

describe("components/CLAUDE.md shared-component table", () => {
  const section = catalogSection();
  const rows = tableRows(section);

  it("names every file in components/ui", () => {
    // Owner column only: a mention in prose is not a row.
    const owners = rows.map((r) => r.split("|")[2] || "").join(" ");
    const missing = uiFiles().filter((f) => !owners.includes(`\`ui/${f}\``));
    expect(missing, `add a row to components/CLAUDE.md «${HEADING}» for`).toEqual([]);
  });

  it("ui/index.js re-exports every component in the folder", () => {
    const barrel = fs.readFileSync(path.join(ROOT, "components", "ui", "index.js"), "utf8");
    // A component file is one with a default export (field.jsx holds helpers).
    const components = uiFiles()
      .filter((f) => f.endsWith(".jsx"))
      .filter((f) => /^export default /m.test(fs.readFileSync(path.join(ROOT, "components", "ui", f), "utf8")))
      .map((f) => f.replace(/\.jsx$/, ""));
    expect(components.length).toBeGreaterThan(0);
    const missing = components.filter((n) => !new RegExp(`default as ${n} \\} from "\\./${n}"`).test(barrel));
    expect(missing, "add to components/ui/index.js").toEqual([]);
  });

  it("names only files that exist", () => {
    const owners = rows.map((r) => r.split("|")[2] || "");
    const named = owners.flatMap((o) => [...o.matchAll(/`([^`(]+\.(?:jsx?|tsx?))`/g)].map((m) => m[1].trim()));
    expect(named.length).toBeGreaterThan(0);
    const gone = named.filter((p) => {
      const rel = /^(lib|hooks|app)\//.test(p) ? p : path.join("components", p);
      return !fs.existsSync(path.join(ROOT, rel));
    });
    expect(gone).toEqual([]);
  });

  it("names only guards that exist", () => {
    const cells = rows.map((r) => (r.split("|")[3] || "").trim());
    // A guard cell is «—», an ESLint rule, or backticked test names (+ a note).
    const unreadable = cells.filter((c) => c !== "—" && !c.startsWith("ESLint") && !/`[A-Za-z]\w*`/.test(c));
    expect(unreadable, "guard cell with no backticked test name").toEqual([]);
    const guards = cells
      .filter((c) => !c.startsWith("ESLint"))
      .flatMap((c) => [...c.matchAll(/`([A-Za-z]\w*)`/g)].map((m) => m[1]));
    expect(guards.length).toBeGreaterThan(0);
    const gone = guards.filter(
      (g) => !["js", "jsx"].some((ext) => fs.existsSync(path.join(ROOT, "__tests__", `${g}.test.${ext}`))),
    );
    expect(gone).toEqual([]);
  });
});
