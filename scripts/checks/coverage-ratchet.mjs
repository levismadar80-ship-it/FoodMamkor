#!/usr/bin/env node
/**
 * coverage-ratchet — a frontend coverage gate that can only tighten.
 *
 * WHY THIS EXISTS (MEH-1980)
 * --------------------------
 * The frontend had thousands of tests and no coverage number at all, so nobody
 * could say which areas were exposed. Same remedy as the Knip ratchet
 * (MEH-1868, Notion/Life360): freeze today's numbers, demand no improvement,
 * block only regression.
 *
 * SCOPE — FRONTEND ONLY, AND THAT IS DELIBERATE
 * ---------------------------------------------
 * The card asked for "frontend + backend". The backend already has BOTH a
 * coverage measurement and a gate: the PR-checks workflow runs pytest with
 * `--cov=backend/app … --cov-fail-under=70`, and the comment above that step
 * records its own frozen baseline. Adding a second backend coverage mechanism
 * would be two parallel owners of one job — the exact "Smell #1" this repo has
 * a rule against, and it would be introduced by the very card that cites the
 * ratchet pattern approvingly.
 *
 * What the backend actually needs is its existing *floor* (a static 70) turned
 * into a *ratchet*. That is a one-line change to a workflow file, so it lives
 * in the docs/ci/ patch, not here.
 *
 * WHY A GLOBAL DELTA AND NOT PER-FILE
 * -----------------------------------
 * Knip counts discrete findings, so a per-(file, rule) key is exact. Coverage
 * is a ratio over changing denominators: adding a well-tested file moves every
 * other file's share of the total without anyone touching them. A per-file
 * ratchet on that basis produces constant false reds. So the gate is a global
 * floor with a tolerance, plus a per-directory record for the humans.
 *
 * USAGE
 *   node scripts/checks/coverage-ratchet.mjs                   # compare, exit 1 on regression
 *   node scripts/checks/coverage-ratchet.mjs --update-baseline # rewrite (refuses a DROP)
 *   node scripts/checks/coverage-ratchet.mjs --update-baseline --allow-drop
 *   node scripts/checks/coverage-ratchet.mjs --self-test
 *   node scripts/checks/coverage-ratchet.mjs --summary <path>  # compare a captured run
 */

import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const FRONTEND_DIR = join(REPO_ROOT, "frontend");
const SUMMARY_PATH = join(FRONTEND_DIR, "coverage", "coverage-summary.json");
const BASELINE_PATH = join(HERE, "coverage-ratchet-baseline.json");

/** How far global line coverage may fall below the frozen baseline. */
export const TOLERANCE_PCT = 0.5;

/* ------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------ */

/**
 * istanbul/v8 `coverage-summary.json` is
 *   { total: {lines:{pct,covered,total}, …}, "<abs path>": {…}, … }
 *
 * @returns {{globalPct:number, lines:{covered:number,total:number}, files:number}}
 */
export function parseSummary(json) {
  if (!json || typeof json !== "object" || !json.total || !json.total.lines) {
    throw new Error(
      "unrecognised coverage summary: expected an object with `total.lines`. " +
        "Was it produced by `vitest run --coverage` with the json-summary reporter?",
    );
  }
  const { pct, covered, total } = json.total.lines;
  if (typeof pct !== "number" || Number.isNaN(pct)) {
    throw new Error(`coverage summary has a non-numeric total.lines.pct: ${JSON.stringify(pct)}`);
  }
  const files = Object.keys(json).filter((k) => k !== "total").length;
  // A summary with `total` but zero file entries means the reporter ran and
  // measured nothing — a null that reads exactly like a real result.
  if (files === 0) {
    throw new Error(
      "coverage summary contains `total` but ZERO file entries — the reporter ran " +
        "without measuring anything. Refusing to treat that as a coverage figure.",
    );
  }
  return { globalPct: pct, lines: { covered, total }, files };
}

/** Per-directory rollup, for the human-readable record (not gated on). */
export function byDirectory(json, rootDir = FRONTEND_DIR) {
  const dirs = new Map();
  for (const [key, value] of Object.entries(json)) {
    if (key === "total" || !value?.lines) continue;
    const rel = key.startsWith(rootDir) ? key.slice(rootDir.length + 1) : key;
    // Drop the filename FIRST, then take up to two directory segments.
    // Slicing the raw path instead would make `lib/foo.js` group under
    // "lib/foo.js" — the file as its own directory — while `app/[locale]/x.js`
    // grouped correctly, so the bug only shows on shallow paths. Caught by
    // `by-directory/rolls-up` in the self-test, not by reading the code.
    const segments = rel.split("/").slice(0, -1);
    const top = segments.slice(0, 2).join("/") || ".";
    const acc = dirs.get(top) ?? { covered: 0, total: 0, files: 0 };
    acc.covered += value.lines.covered ?? 0;
    acc.total += value.lines.total ?? 0;
    acc.files += 1;
    dirs.set(top, acc);
  }
  return [...dirs.entries()]
    .map(([dir, a]) => ({ dir, ...a, pct: a.total === 0 ? 100 : (a.covered / a.total) * 100 }))
    .sort((a, b) => a.pct - b.pct);
}

/** The N least-covered files, excluding anything with no statements. */
export function leastCovered(json, n = 10, rootDir = FRONTEND_DIR) {
  return Object.entries(json)
    .filter(([k, v]) => k !== "total" && v?.lines?.total > 0)
    .map(([k, v]) => ({
      file: k.startsWith(rootDir) ? k.slice(rootDir.length + 1) : k,
      pct: v.lines.pct,
      covered: v.lines.covered,
      total: v.lines.total,
    }))
    .sort((a, b) => a.pct - b.pct || b.total - a.total)
    .slice(0, n);
}

/* ------------------------------------------------------------------ *
 * Comparison
 * ------------------------------------------------------------------ */

export function compare(current, baseline, tolerance = TOLERANCE_PCT) {
  const delta = current.globalPct - baseline.globalPct;
  return {
    delta,
    // Strictly greater than the tolerance is a regression. A drop of exactly
    // the tolerance is allowed, which is what "within 0.5%" means.
    regressed: delta < 0 && Math.abs(delta) > tolerance,
    improved: delta > 0,
  };
}

const fmt = (n) => `${n.toFixed(2)}%`;

/* ------------------------------------------------------------------ *
 * Self-test
 * ------------------------------------------------------------------ */

function summaryFixture(pct, files = 3) {
  const out = {
    total: { lines: { pct, covered: Math.round(pct * 10), total: 1000 } },
  };
  for (let i = 0; i < files; i++) {
    out[`${FRONTEND_DIR}/lib/f${i}.js`] = { lines: { pct, covered: 10, total: 100 } };
  }
  return out;
}

function selfTest() {
  const ran = [];
  const failures = [];
  const check = (name, cond, detail = "") => {
    ran.push(name);
    if (cond) console.log(`  PASS  ${name}`);
    else {
      console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
      failures.push(name);
    }
  };

  const base = { globalPct: 60, lines: { covered: 600, total: 1000 }, files: 3 };

  // --- Regression must block, and the boundary must be on the right side.
  check("drop-beyond-tolerance/blocks", compare({ globalPct: 59.0 }, base).regressed);
  check("drop-within-tolerance/passes", !compare({ globalPct: 59.6 }, base).regressed);
  check(
    "drop-exactly-tolerance/passes",
    !compare({ globalPct: 59.5 }, base).regressed,
    "a drop of exactly the tolerance is inside the allowance, not outside it",
  );
  check("improvement/passes", !compare({ globalPct: 61 }, base).regressed);
  check("improvement/reported", compare({ globalPct: 61 }, base).improved);
  check("unchanged/passes", !compare({ globalPct: 60 }, base).regressed);

  // --- A zero-file summary must throw, not report a number. This is the
  // coverage analogue of the empty-payload bypass found in the Knip ratchet:
  // "the reporter measured nothing" and "everything is covered" must not be
  // the same output.
  let threwEmpty = false;
  try {
    parseSummary({ total: { lines: { pct: 100, covered: 0, total: 0 } } });
  } catch {
    threwEmpty = true;
  }
  check("zero-file-summary/throws", threwEmpty, "a summary with no file entries is not a result");

  let threwShape = false;
  try {
    parseSummary({ nope: true });
  } catch {
    threwShape = true;
  }
  check("malformed-summary/throws", threwShape);

  let threwNaN = false;
  try {
    parseSummary({ total: { lines: { pct: "eighty", covered: 1, total: 2 } }, "a.js": {} });
  } catch {
    threwNaN = true;
  }
  check("non-numeric-pct/throws", threwNaN);

  // --- Rollups
  const fx = summaryFixture(50, 4);
  check("parse/reads-global-pct", parseSummary(fx).globalPct === 50);
  check("parse/counts-files", parseSummary(fx).files === 4);
  check("least-covered/limits", leastCovered(fx, 2).length === 2);
  check(
    "least-covered/strips-root-prefix",
    leastCovered(fx, 1)[0].file.startsWith("lib/"),
    "paths must be repo-relative so the report is readable",
  );
  check(
    "by-directory/rolls-up",
    byDirectory(fx).some((d) => d.dir === "lib"),
  );

  // --- THE GATE'S OWN WIRING. The cases above test helpers; none of them
  // reaches main()'s exit-code decision. That gap shipped once already in the
  // Knip ratchet and was only caught by adversarial review — not repeating it.
  const tmp = mkdtempSync(join(tmpdir(), "coverage-ratchet-selftest-"));
  const write = (name, obj) => {
    const p = join(tmp, name);
    writeFileSync(p, JSON.stringify(obj));
    return p;
  };
  const baseFile = join(tmp, "baseline.json");
  writeFileSync(
    baseFile,
    JSON.stringify({ globalPct: 60, lines: { covered: 600, total: 1000 }, files: 3 }),
  );

  const okPath = write("ok.json", summaryFixture(60));
  const badPath = write("bad.json", summaryFixture(50));
  const quietLog = console.log;
  const quietErr = console.error;
  let okCode, badCode;
  console.log = () => {};
  console.error = () => {};
  try {
    okCode = main(["node", "x", "--summary", okPath, "--baseline", baseFile]);
    badCode = main(["node", "x", "--summary", badPath, "--baseline", baseFile]);
  } finally {
    console.log = quietLog;
    console.error = quietErr;
    rmSync(tmp, { recursive: true, force: true });
  }
  check("gate-wiring/at-baseline-exits-0", okCode === 0, `got ${okCode}`);
  check(
    "gate-wiring/regression-exits-1",
    badCode === 1,
    `got ${badCode} — this is the assertion that catches a regression in the exit-code decision itself`,
  );

  console.log(`\n  ${ran.length} assertions ran, ${failures.length} failed.`);
  if (failures.length) {
    console.error(`\ncoverage-ratchet --self-test FAILED: ${failures.join(", ")}`);
    return 1;
  }
  console.log("coverage-ratchet --self-test OK.");
  return 0;
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

function main(argv) {
  const args = new Set(argv.slice(2));
  if (args.has("--self-test")) return selfTest();

  const flagValue = (flag) => {
    const i = argv.indexOf(flag);
    if (i === -1) return null;
    const val = argv[i + 1];
    // `--summary` with no path following it must be LOUD. Returning undefined
    // here would `??`-fall-through to the built-in default and silently measure
    // a leftover summary from a previous run — a wrong answer that looks like a
    // real one. Same for a bare `--summary --baseline x`.
    if (val === undefined || val.startsWith("--")) {
      throw new Error(`${flag} requires a path (got ${val === undefined ? "nothing" : val})`);
    }
    return val;
  };
  const summaryPath = flagValue("--summary") ?? SUMMARY_PATH;
  const baselinePath = flagValue("--baseline") ?? BASELINE_PATH;

  if (!existsSync(summaryPath)) {
    console.error(
      `No coverage summary at ${summaryPath}.\n` +
        `Produce one first:  cd frontend && npx vitest run --coverage`,
    );
    return 2;
  }
  const current = parseSummary(JSON.parse(readFileSync(summaryPath, "utf8")));

  if (args.has("--update-baseline")) {
    if (existsSync(baselinePath)) {
      const prior = JSON.parse(readFileSync(baselinePath, "utf8"));
      if (current.globalPct < prior.globalPct && !args.has("--allow-drop")) {
        console.error(
          `REFUSING to update the baseline: coverage would DROP ` +
            `${fmt(prior.globalPct)} -> ${fmt(current.globalPct)}.\n` +
            `A ratchet that can be loosened by rerunning the tool it gates is not a ratchet.\n` +
            `Fix the coverage, or rerun with --allow-drop and justify it in the PR body.`,
        );
        return 1;
      }
    }
    writeFileSync(
      baselinePath,
      `${JSON.stringify(
        {
          _comment:
            "MEH-1980 frontend coverage ratchet baseline. Global LINE coverage only; " +
            "per-directory detail lives in docs/reports/. Regenerate with " +
            "`node scripts/checks/coverage-ratchet.mjs --update-baseline`. Lowering it " +
            "requires --allow-drop and a justification in the PR body.",
          _tolerancePct: TOLERANCE_PCT,
          globalPct: current.globalPct,
          lines: current.lines,
          files: current.files,
        },
        null,
        2,
      )}\n`,
    );
    console.log(
      `Baseline written: ${fmt(current.globalPct)} line coverage ` +
        `(${current.lines.covered}/${current.lines.total} across ${current.files} files).`,
    );
    return 0;
  }

  if (!existsSync(baselinePath)) {
    console.error(
      `No baseline at ${baselinePath}.\n` +
        `Create one: node scripts/checks/coverage-ratchet.mjs --update-baseline`,
    );
    return 2;
  }
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  const tolerance = baseline._tolerancePct ?? TOLERANCE_PCT;
  const { delta, regressed, improved } = compare(current, baseline, tolerance);

  console.log(
    `Coverage ratchet: ${fmt(current.globalPct)} lines ` +
      `(${current.lines.covered}/${current.lines.total}, ${current.files} files); ` +
      `baseline ${fmt(baseline.globalPct)}, tolerance ${tolerance}pt.`,
  );

  if (improved) {
    console.log(
      `\n  Improved by ${fmt(delta)} — run --update-baseline to bank it.\n` +
        `  (Banking is optional; an unbanked improvement just leaves headroom.)`,
    );
  }

  if (regressed) {
    console.error(
      `\n  REGRESSION: ${fmt(Math.abs(delta))} below baseline, tolerance is ${tolerance}pt.\n` +
        `  Nothing here asks you to RAISE coverage — only not to lower it.`,
    );
    return 1;
  }

  console.log("\ncoverage-ratchet OK — not below baseline.");
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    process.exit(main(process.argv));
  } catch (err) {
    console.error(`coverage-ratchet: ${err?.message ?? err}`);
    process.exit(2);
  }
}
