// MEH-3219 B13 — a group-buy deadline arrives as naive UTC ("2026-12-20T21:59:00",
// no Z). `new Date(naive)` reads it in the DEVICE zone, so on an Israeli phone the
// deadline moved two or three hours. Every reader goes through parseNaiveUtc.
// CI runs in UTC, where the bug is invisible at runtime — hence a source guard.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const DIRS = ["app", "components", "lib"];
// A bare deadline handed to a Date constructor or a date formatter.
const BARE_DEADLINE = /(new Date|formatEventDate|formatDate)\(\s*[A-Za-z_.]*\.?deadline\b/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe("group-buy deadline is parsed as UTC (MEH-3219 B13)", () => {
  it("control: the pattern catches the shapes the bug had", () => {
    expect(BARE_DEADLINE.test("const expired = new Date(gb.deadline) < new Date();")).toBe(true);
    expect(BARE_DEADLINE.test("formatEventDate(gb.deadline, locale)")).toBe(true);
    expect(BARE_DEADLINE.test("deadline: new Date(form.deadline).toISOString(),")).toBe(true);
    expect(BARE_DEADLINE.test("parseNaiveUtc(gb.deadline) < new Date()")).toBe(false);
  });

  it("no file reads a deadline without parseNaiveUtc", () => {
    const files = DIRS.flatMap((d) => walk(join(ROOT, d)));
    expect(files.length).toBeGreaterThan(100);
    const hits = files.flatMap((f) =>
      readFileSync(f, "utf8")
        .split("\n")
        .map((line, i) => (BARE_DEADLINE.test(line) ? `${f.slice(ROOT.length + 1)}:${i + 1}` : null))
        .filter(Boolean),
    );
    expect(hits).toEqual([]);
  });
});
