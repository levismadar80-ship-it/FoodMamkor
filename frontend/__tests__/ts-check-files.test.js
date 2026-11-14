/**
 * Module:   ts-check-files.test.js
 * Purpose:  Type-check every app/components/lib file that opts in with
 *           `// @ts-check` (new files must — scripts/checks/typed-new-modules.sh).
 *           Gives an AI agent (and a person) a red on a wrong prop or a wrong
 *           argument instead of a runtime bug. No TypeScript conversion.
 * Does NOT: check files without the marker, or tests.
 * Control:  fixtures/ts-check/known-error.js must produce an error, so a
 *           checker that silently checks nothing goes red.
 * History:  13/11/2026 — created (AI-friendliness review).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(__dirname, "..");
const DIRS = ["app", "components", "lib"];
const SKIP = /(^|\/)(__tests__|e2e|node_modules|generated)\//;

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(js|jsx)$/.test(entry.name) && !SKIP.test(path.relative(ROOT, p))) out.push(p);
  }
  return out;
}

function optedIn() {
  return DIRS.flatMap((d) => walk(path.join(ROOT, d), [])).filter((f) =>
    fs.readFileSync(f, "utf8").split("\n", 5).some((l) => l.trim() === "// @ts-check"),
  );
}

function diagnose(files) {
  const cfgPath = path.join(ROOT, "tsconfig.json");
  const cfg = ts.readConfigFile(cfgPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, ROOT);
  const program = ts.createProgram(files, {
    ...parsed.options,
    noEmit: true,
    allowJs: true,
    // Gentle mode for JS: catch wrong props, wrong arguments, typos and missing
    // imports, without demanding a JSDoc type on every parameter.
    noImplicitAny: false,
    strictNullChecks: false,
    useUnknownInCatchVariables: false,
  });
  const wanted = new Set(files.map((f) => path.resolve(f)));
  return ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.file && wanted.has(path.resolve(d.file.fileName)))
    .map((d) => {
      const { line } = d.file.getLineAndCharacterOfPosition(d.start ?? 0);
      return `${path.relative(ROOT, d.file.fileName)}:${line + 1}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`;
    });
}

describe("// @ts-check files type-check", () => {
  it("control: the known-error fixture is reported", () => {
    const errs = diagnose([path.join(__dirname, "fixtures/ts-check/known-error.js")]);
    expect(errs.length).toBeGreaterThan(0);
    // Building a TS program takes longer than vitest's 5 s default on a loaded
    // CI runner (timed out on 13/11, job 132093632531).
  }, 60_000);

  it("every opted-in file has 0 type errors", () => {
    const files = optedIn();
    // Anchor: these real files opted in on 13/11, so optedIn() must find them.
    // If the marker scan breaks, this goes red instead of checking nothing.
    for (const anchor of ["lib/dates.js", "lib/css-url.js", "lib/label-in-name.js"]) {
      expect(files.map((f) => path.relative(ROOT, f))).toContain(anchor);
    }
    expect(diagnose(files)).toEqual([]);
  }, 120_000);
});
