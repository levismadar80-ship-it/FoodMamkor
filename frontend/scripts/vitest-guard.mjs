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
 * History:  MEH-1951 (creation; --self-test added on review — the classifier
 *           ships with proof it discriminates, MEH-1619).
 */
import { spawn } from "node:child_process";

// The classifier: does this captured output prove ≥1 test actually passed?
// Strips ANSI color first so the regex sees plain text (the ESC byte itself
// may remain; the summary match does not care). Takes the LAST summary
// occurrence (review note: defensive against any reporter that emits
// intermediate "Tests N passed" lines before the grand total).
export function classify(output) {
  const plain = output.replace(/\[[0-9;]*m/g, "");
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
    // Zero-passed summary (a run that only skipped) is NOT verification.
    {
      name: "zero passed",
      output: " Tests  0 passed | 4 skipped (4)\n",
      expect: false,
    },
    // Colorized real-shaped summary — the ANSI strip is load-bearing.
    {
      name: "ANSI-colored summary",
      output: " [32mTests  12 passed[39m (12)\n",
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
const cwd = new URL("..", import.meta.url).pathname;

// Invoke the local binary directly — `npx vitest` is exactly the resolution
// path that produced the foreign-vite incident this guard exists to catch.
// A missing binary is then a loud spawn error, not a silent substitute.
const child = spawn("./node_modules/.bin/vitest", ["run", ...args], {
  cwd,
  stdio: ["inherit", "pipe", "pipe"],
});

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
  console.error("vitest-guard: is node_modules installed? (npm ci in frontend/)");
  process.exit(1);
});

child.on("close", (code) => {
  // Red stays red — the guard only audits the green path.
  if (code !== 0) process.exit(code ?? 1);

  const { verified, passed } = classify(captured);
  if (!verified) {
    console.error(
      "\nvitest-guard: vitest exited 0 but 0 tests were executed — " +
        "startup failure? (missing node_modules, foreign vite via npx, bad flag). " +
        "An empty green is a failure."
    );
    process.exit(1);
  }
  console.log(`\nvitest-guard: OK — ${passed} tests passed (summary verified).`);
});
