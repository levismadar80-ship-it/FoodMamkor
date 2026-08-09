#!/usr/bin/env node
/**
 * Module:   vitest-guard
 * Purpose:  Run the vitest suite and convert "exit 0 with 0 tests executed"
 *           into a loud failure. A startup crash (missing node_modules → npx
 *           resolving a foreign vite; an invalid flag) has returned exit 0
 *           with zero tests run — twice, measured 08/08 — so every consumer
 *           of the raw command saw an init crash as a green suite. Same bug
 *           class as the CI skip-green aggregator: a green with two possible
 *           causes is not a signal.
 * Does NOT: interpret failures — a non-zero vitest exit propagates untouched.
 *           Only the exit-0 path is audited.
 * Related:  .claude/rules/testing.md ("A green that has two possible causes"),
 *           package.json "test" script (the wrapper's front door),
 *           .claude/skills/mehamakor-dod/check.sh (consumer).
 * History:  MEH-1951 (creation).
 */
import { spawn } from "node:child_process";

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
child.stdout.on("data", (d) => {
  captured += d;
  process.stdout.write(d);
});
child.stderr.on("data", (d) => {
  captured += d;
  process.stderr.write(d);
});

child.on("error", (err) => {
  console.error(`\nvitest-guard: spawn failed — ${err.message}`);
  console.error("vitest-guard: is node_modules installed? (npm ci in frontend/)");
  process.exit(1);
});

child.on("close", (code) => {
  // Red stays red — the guard only audits the green path.
  if (code !== 0) process.exit(code ?? 1);

  // The summary line looks like: " Tests  2563 passed | 3 skipped (2566)".
  // Strip ANSI color codes first so the regex sees plain text.
  // eslint-disable-next-line no-control-regex
  const plain = captured.replace(/\x1b\[[0-9;]*m/g, "");
  const m = plain.match(/Tests\s+(\d+)\s+passed/);
  const passed = m ? parseInt(m[1], 10) : 0;

  if (!m || passed === 0) {
    console.error(
      "\nvitest-guard: vitest exited 0 but 0 tests were executed — " +
        "startup failure? (missing node_modules, foreign vite via npx, bad flag). " +
        "An empty green is a failure."
    );
    process.exit(1);
  }
  console.log(`\nvitest-guard: OK — ${passed} tests passed (summary verified).`);
});
