/**
 * MEH-3060 — one way to print a date.
 *
 * Pages and components print dates through `formatDate` / `formatEventDate`
 * (lib/format-date.js: Israel time, one locale map, an Invalid-Date guard) and
 * read "today" through lib/israel-date.js. A page that calls
 * `toLocaleDateString("he-IL")` itself shows Hebrew dates on /en, reads the
 * viewer's own time zone, and prints "Invalid Date" on a bad value — the three
 * things the helper exists to stop (MEH-753, HOT-018).
 *
 * AST: call / `new` sites only, so comments that NAME these APIs don't count.
 * Blind spot: a formatter reached through an alias (`const f = Intl.DateTimeFormat`).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import traverseMod from "@babel/traverse";
import { formatDate } from "@/lib/format-date";

const traverse = traverseMod.default || traverseMod;
const ROOT = path.resolve(__dirname, "..");
const BANNED_METHODS = new Set(["toLocaleDateString", "toLocaleTimeString"]);

export function handFormattedDates(src) {
  const ast = parse(src, { sourceType: "module", plugins: ["jsx"] });
  const hits = [];
  traverse(ast, {
    CallExpression(p) {
      const c = p.node.callee;
      if (c.type === "MemberExpression" && BANNED_METHODS.has(c.property.name)) hits.push(`${c.property.name}@${p.node.loc.start.line}`);
    },
    NewExpression(p) {
      const c = p.node.callee;
      if (c.type === "MemberExpression" && c.object.name === "Intl" && c.property.name === "DateTimeFormat") hits.push(`Intl.DateTimeFormat@${p.node.loc.start.line}`);
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

describe("MEH-3060 — dates print through lib/format-date", () => {
  it("formatDate: Israel calendar, locale map, guard", () => {
    expect(formatDate("2026-11-05", "he")).toBe("05.11.2026");
    // 23:30 UTC is already the next day in Israel
    expect(formatDate("2026-11-05T23:30:00Z", "he")).toBe("06.11.2026");
    expect(formatDate("2026-11-05", "he", "dayMonth")).toBe("5 בנובמבר");
    expect(formatDate("2026-11-05", "en", "dayMonth")).toBe("November 5");
    expect(formatDate("not a date", "he")).toBe("");
    expect(formatDate(null, "he")).toBe("");
  });

  it("self-test: the three hand-rolled shapes red, comments don't", () => {
    // anchored to the pre-MEH-3060 ChangesRequestedBanner.jsx:52 shape
    expect(handFormattedDates('const d = new Date(x).toLocaleDateString("he-IL");')).toEqual(["toLocaleDateString@1"]);
    expect(handFormattedDates('const f = new Intl.DateTimeFormat("he-IL", {});')).toEqual(["Intl.DateTimeFormat@1"]);
    expect(handFormattedDates("const t = d.toLocaleTimeString();")).toEqual(["toLocaleTimeString@1"]);
    expect(handFormattedDates('// toLocaleDateString("he-IL") is banned\nconst a = 1;')).toEqual([]);
  });

  it("no page or component formats a date itself", () => {
    const files = ["app", "components"].flatMap((d) => walk(path.join(ROOT, d)));
    expect(files.length, "corpus control").toBeGreaterThan(200);
    const offenders = [];
    for (const f of files) {
      const hits = handFormattedDates(fs.readFileSync(f, "utf8"));
      if (hits.length) offenders.push(`${path.relative(ROOT, f).split(path.sep).join("/")}: ${hits.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  }, 60_000);
});
