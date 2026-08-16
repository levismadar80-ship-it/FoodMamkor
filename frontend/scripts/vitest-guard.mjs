#!/usr/bin/env node
/**
 * Module:   vitest-guard
 * Purpose:  Run the vitest suite and convert "exit 0 with 0 tests executed"
 *           into a loud failure. A startup crash (missing node_modules → npx
 *           resolving a foreign vite; an invalid reporter flag) has returned
 *           exit 0 with zero tests run — twice, measured 08/08 — so every
 *           consumer of the raw command saw an init crash as a green suite.
 *           Same bug class as the CI skip-green aggregator: a green with two
 *           possible causes is not a signal.
 * Does NOT: interpret failures — a non-zero vitest exit propagates untouched.
 *           Only the exit-0 path is audited.
 * Related:  .claude/rules/testing.md ("A green that has two possible causes"),
 *           package.json "test" script (the wrapper's front door),
 *           .claude/skills/mehamakor-dod/check.sh (consumer).
 * Note:     always `vitest run` — `npm test -- --watch` is not supported here
 *           (the guard exists to audit a completed run's summary).
 * History:  MEH-1951 (creation; --self-test added on review — the classifier
 *           ships with proof it discriminates, MEH-1619).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The classifier: does this captured output prove ≥1 test actually passed?
// Strips full ANSI SGR sequences (ESC + bracket) so the regex sees plain text.
// \u001B, not a literal ESC byte: no-control-regex is off in this config, and
// the escape keeps the source ASCII-clean. Stripping only the bracket would
// break the moment vitest colorized the digits themselves. Takes the LAST
// occurrence (review note: defensive against any reporter that emits
// intermediate "Tests N passed" lines before the grand total).
export function classify(output) {
  const plain = output.replace(/\u001B\[[0-9;]*m/g, "");
  const matches = [...plain.matchAll(/Tests\s+(\d+)\s+passed/g)];
  const last = matches.at(-1);
  const passed = last ? Number.parseInt(last[1], 10) : 0;
  return { verified: passed > 0, passed };
}

// --self-test: prove the classifier discriminates BEFORE anyone trusts a run
// through it (MEH-1619: a guard never observed failing is a green light of
// unknown wiring; repo precedent: audit-skills.sh --self-test).
if (process.argv[2] === "--self-test") {
  const cases = [
    // Anchored to a REAL run, verbatim (this repo, 09/08 full suite) — not a
    // synthetic shape the repo never produces (the MEH-1909 ast lesson).
    {
      name: "real full-suite summary",
      output:
        " Test Files  292 passed | 3 skipped (295)\n      Tests  2563 passed | 3 skipped (2566)\n",
      expect: true,
    },
    // The measured incident shape: startup crash, empty output, exit 0.
    { name: "empty output (startup crash)", output: "", expect: false },
    {
      name: "crash text without a summary",
      output: "Cannot find module 'vitest/config'\n",
      expect: false,
    },
    // Colorized DIGITS — the case bracket-only stripping would have broken.
    {
      name: "ANSI inside the count",
      output: " Tests  \u001B[1m12\u001B[22m passed (12)\n",
      expect: true,
    },
    // Zero-passed summary (a run that only skipped) is NOT verification.
    {
      name: "zero passed",
      output: " Tests  0 passed | 4 skipped (4)\n",
      expect: false,
    },
    // Colorized real-shaped summary — the ANSI strip is load-bearing.
    {
      name: "ANSI-colored summary (full ESC sequences)",
      output: " \u001B[32mTests  12 passed\u001B[39m (12)\n",
      expect: true,
    },
  ];
  let bad = 0;
  for (const testCase of cases) {
    const got = classify(testCase.output).verified;
    const ok = got === testCase.expect;
    console.log(`${ok ? "PASS" : "FAIL"}  self-test: ${testCase.name}`);
    if (!ok) bad += 1;
  }
  process.exit(bad === 0 ? 0 : 1);
}

const args = process.argv.slice(2);
// fileURLToPath, not .pathname: the raw pathname is percent-encoded (a space
// in the checkout path → ENOENT reported as "is node_modules installed?") and
// is /C:/… on Windows. Measured both by the reviewer.
const cwd = fileURLToPath(new URL("..", import.meta.url));

// Run vitest's own entry with THIS node — never `npx` (the resolution path
// that produced the foreign-vite incident) and never the .bin shim (on
// Windows that is a .cmd/.ps1 pair CreateProcess cannot exec without a shell,
// which would hard-fail the DoD skill on the machine it is run from).
const entry = fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url));
if (!existsSync(entry)) {
  console.error("\nvitest-guard: vitest is not installed at node_modules/vitest — run 'npm ci' in frontend/.");
  process.exit(1);
}
const child = spawn(process.execPath, [entry, "run", ...args], {
  cwd,
  stdio: ["inherit", "pipe", "pipe"],
});
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");

let captured = "";
child.stdout.on("data", (chunk) => {
  captured += chunk;
  process.stdout.write(chunk);
});
child.stderr.on("data", (chunk) => {
  captured += chunk;
  process.stderr.write(chunk);
});

child.on("error", (err) => {
  console.error(`\nvitest-guard: spawn failed — ${err.message}`);
  process.exit(1);
});

child.on("close", (code) => {
  // Red stays red — the guard only audits the green path.
  if (code !== 0) process.exit(code ?? 1);

  const { verified, passed } = classify(captured);
  if (!verified) {
    console.error(
      "\nvitest-guard: vitest exited 0 but 0 tests were executed. " +
        "Candidates: startup failure (missing node_modules, foreign vite via " +
        "npx, bad flag), a -t name filter matching nothing, or a custom " +
        "reporter with no summary. An empty green is a failure either way."
    );
    process.exit(1);
  }
  console.log(`\nvitest-guard: OK — ${passed} tests passed (summary verified).`);
});
