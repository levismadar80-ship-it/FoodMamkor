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
  const onCall = (p) => {
    const c = p.node.callee;
    if (!/MemberExpression$/.test(c.type) || !c.property) return;
    const name = c.property.name;
    if (BANNED_METHODS.has(name)) hits.push(`${name}@${p.node.loc.start.line}`);
    // toLocaleString is also a number formatter; flag it only on a stored
    // date — `new Date(value)`. `new Date()` with no args is a clock read.
    const o = c.object;
    if (name === "toLocaleString" && o.type === "NewExpression" && o.callee.name === "Date" && o.arguments.length) {
      hits.push(`toLocaleString@${p.node.loc.start.line}`);
    }
  };
  traverse(ast, {
    CallExpression: onCall,
    OptionalCallExpression: onCall,
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
    expect(formatDate("2026-11-05T08:07:00Z", "he", "dateTime")).toBe("05.11.2026, 10:07");
  });

  it("self-test: the three hand-rolled shapes red, comments don't", () => {
    // anchored to the pre-MEH-3060 ChangesRequestedBanner.jsx:52 shape
    expect(handFormattedDates('const d = new Date(x).toLocaleDateString("he-IL");')).toEqual(["toLocaleDateString@1"]);
    expect(handFormattedDates('const f = new Intl.DateTimeFormat("he-IL", {});')).toEqual(["Intl.DateTimeFormat@1"]);
    expect(handFormattedDates("const t = d.toLocaleTimeString();")).toEqual(["toLocaleTimeString@1"]);
    // reviewer finding (13/11): AdminProducersTable.jsx:145 shape, and optional calls
    expect(handFormattedDates('const w = new Date(stamp).toLocaleString("he-IL");')).toEqual(["toLocaleString@1"]);
    expect(handFormattedDates("const w = d?.toLocaleDateString();")).toEqual(["toLocaleDateString@1"]);
    expect(handFormattedDates('const n = price.toLocaleString("he-IL");')).toEqual([]);
    expect(handFormattedDates('const a = new Date().toLocaleString("en-US", { weekday: "short" });')).toEqual([]);
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
