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
  // ZERO STATEMENTS is the same defect wearing file entries, and it is WORSE:
  // istanbul's `percent()` returns 100 when total === 0, so a run that
  // instrumented nothing reports **100% and an improvement**, and the gate
  // passes. Proven end-to-end before this guard existed: a summary of
  // {pct:100, covered:0, total:0} with one file key printed
  // "Improved by 33.23%" against the 66.77% baseline and exited 0.
  // The file-count check above cannot see this — the files are present, they
  // just have no statements.
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error(
      `coverage summary reports ${files} file(s) but ${total} total statements. ` +
        "istanbul renders 0/0 as 100%, so this would surface as full coverage and " +
        "an improvement. Refusing to treat a run that instrumented nothing as a result.",
    );
  }
  if (!Number.isFinite(covered) || covered < 0 || covered > total) {
    throw new Error(`coverage summary is internally inconsistent: covered=${covered}, total=${total}`);
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

/** How far the measured universe may shrink before the result is not comparable. */
export const DENOMINATOR_TOLERANCE_PCT = 10;

/**
 * True when the measured universe shrank enough that the percentage is no
 * longer comparable to the baseline's. Deliberately checks BOTH axes: a glob
 * change can drop whole files, and an exclude change can drop statements while
 * leaving the file count alone.
 */
export function checkDenominator(current, baseline, tolerancePct = DENOMINATOR_TOLERANCE_PCT) {
  const floor = (n) => n * (1 - tolerancePct / 100);
  const baseFiles = baseline.files;
  const baseLines = baseline.lines?.total;
  if (Number.isFinite(baseFiles) && current.files < floor(baseFiles)) return true;
  if (Number.isFinite(baseLines) && current.lines.total < floor(baseLines)) return true;
  return false;
}

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

  // --- THE LOOSENING GUARD. Previously untested: deleting the refusal
  // entirely still passed 16/16, so the file's own headline guarantee — "a
  // ratchet that can be loosened by rerunning the tool it gates is not a
  // ratchet" — was unguarded by the suite meant to prove it.
  const tmp2 = mkdtempSync(join(tmpdir(), "coverage-ratchet-loosen-"));
  const blPath = join(tmp2, "bl.json");
  const writeBl = () =>
    writeFileSync(blPath, JSON.stringify({ globalPct: 60, lines: { covered: 600, total: 1000 }, files: 3 }));
  writeBl();
  const dropPath = join(tmp2, "drop.json");
  writeFileSync(dropPath, JSON.stringify(summaryFixture(50)));
  const qL = console.log;
  const qE = console.error;
  let refuseCode, refusedPct, allowCode, allowedPct;
  console.log = () => {};
  console.error = () => {};
  try {
    refuseCode = main(["node", "x", "--update-baseline", "--summary", dropPath, "--baseline", blPath]);
    refusedPct = JSON.parse(readFileSync(blPath, "utf8")).globalPct;
    allowCode = main([
      "node", "x", "--update-baseline", "--allow-drop", "--summary", dropPath, "--baseline", blPath,
    ]);
    allowedPct = JSON.parse(readFileSync(blPath, "utf8")).globalPct;
  } finally {
    console.log = qL;
    console.error = qE;
    rmSync(tmp2, { recursive: true, force: true });
  }
  check("loosening/drop-refused", refuseCode === 1, `got ${refuseCode}`);
  check(
    "loosening/baseline-untouched-on-refusal",
    refusedPct === 60,
    `baseline moved to ${refusedPct} despite the refusal — the exit code alone is not the guarantee`,
  );
  check("loosening/allow-drop-permitted", allowCode === 0, `got ${allowCode}`);
  check("loosening/allow-drop-actually-writes", allowedPct === 50, `got ${allowedPct}`);

  // --- ZERO STATEMENTS. istanbul renders 0/0 as 100%, so a run that
  // instrumented nothing reads as full coverage AND an improvement.
  let threwVacuous = false;
  try {
    parseSummary({ total: { lines: { pct: 100, covered: 0, total: 0 } }, "a.js": { lines: { pct: 100 } } });
  } catch {
    threwVacuous = true;
  }
  check("zero-statements/throws", threwVacuous, "0/0 rendered as 100% must not pass as a result");

  // --- DENOMINATOR SHRINK.
  const bigBase = { globalPct: 60, lines: { covered: 600, total: 1000 }, files: 300 };
  check(
    "denominator/shrink-detected",
    checkDenominator({ files: 100, lines: { total: 300 } }, bigBase),
    "a universe cut to a third must be flagged",
  );
  check(
    "denominator/normal-variation-ignored",
    !checkDenominator({ files: 299, lines: { total: 995 } }, bigBase),
    "ordinary churn must NOT trip it, or the guard is noise and gets disabled",
  );

  // The two cases above exercise `checkDenominator` as a HELPER. Neither
  // reaches main()'s routing block, so deleting that block left all of them
  // green — the same gap this file's comment at the gate-wiring section claims
  // not to be repeating, reopened one guard to the right. Found by the CI
  // reviewer, not by this suite.
  //
  // The pair discriminates: coverage is held EQUAL to the baseline in both, so
  // the only thing that can produce exit 1 is the shrink routing, and
  // --allow-shrink is the control proving the 1 came from there and not from
  // some unrelated refusal.
  const tmp3 = mkdtempSync(join(tmpdir(), "coverage-ratchet-shrink-"));
  const wideBase = join(tmp3, "wide.json");
  writeFileSync(
    wideBase,
    JSON.stringify({ globalPct: 60, lines: { covered: 600, total: 1000 }, files: 300 }),
  );
  const shrunkPath = join(tmp3, "shrunk.json");
  writeFileSync(shrunkPath, JSON.stringify(summaryFixture(60, 1)));
  const qL3 = console.log;
  const qE3 = console.error;
  let shrinkCode, allowShrinkCode;
  console.log = () => {};
  console.error = () => {};
  try {
    shrinkCode = main(["node", "x", "--summary", shrunkPath, "--baseline", wideBase]);
    allowShrinkCode = main([
      "node", "x", "--allow-shrink", "--summary", shrunkPath, "--baseline", wideBase,
    ]);
  } finally {
    console.log = qL3;
    console.error = qE3;
    rmSync(tmp3, { recursive: true, force: true });
  }
  check(
    "gate-wiring/shrink-exits-1",
    shrinkCode === 1,
    `got ${shrinkCode} — 300 files -> 1 at unchanged coverage must fail through main(), not just through the helper`,
  );
  check(
    "gate-wiring/allow-shrink-exits-0",
    allowShrinkCode === 0,
    `got ${allowShrinkCode} — the control: same input, escape hatch on`,
  );

  // --- THE SAME GUARD ON THE *WRITE* PATH. The compare path refuses a shrunk
  // universe; --update-baseline did not, so the shrink could simply be BANKED.
  // Found by the CI reviewer, one guard to the right of the gap it had just
  // found in the read path — which is the "when a reviewer names two sites,
  // grep for the third" case in .claude/rules/testing.md, arriving on schedule.
  //
  // Coverage RISES here (81 vs a 60 baseline), and that is the whole
  // construction: it makes the drop guard provably inactive, so a 1 can only
  // come from the shrink refusal. It also mirrors the real failure, where a
  // narrowed include glob drops the worst-covered directory and the number
  // goes UP. Asserting the FILE is unmodified matters as much as the exit
  // code — the damage is the write, not the status.
  const tmp4 = mkdtempSync(join(tmpdir(), "coverage-ratchet-bank-"));
  const bankBase = join(tmp4, "bl.json");
  const writeWide = () =>
    writeFileSync(
      bankBase,
      JSON.stringify({ globalPct: 60, lines: { covered: 600, total: 1000 }, files: 300 }),
    );
  writeWide();
  const richPath = join(tmp4, "rich.json");
  writeFileSync(richPath, JSON.stringify(summaryFixture(81, 1)));
  const qL4 = console.log;
  const qE4 = console.error;
  let bankCode, bankedPct, bankAllowCode, bankAllowPct;
  console.log = () => {};
  console.error = () => {};
  try {
    bankCode = main(["node", "x", "--update-baseline", "--summary", richPath, "--baseline", bankBase]);
    bankedPct = JSON.parse(readFileSync(bankBase, "utf8")).globalPct;
    bankAllowCode = main([
      "node", "x", "--update-baseline", "--allow-shrink", "--summary", richPath, "--baseline", bankBase,
    ]);
    bankAllowPct = JSON.parse(readFileSync(bankBase, "utf8")).globalPct;
  } finally {
    console.log = qL4;
    console.error = qE4;
    rmSync(tmp4, { recursive: true, force: true });
  }
  check("banking/shrink-refused", bankCode === 1, `got ${bankCode}`);
  check(
    "banking/baseline-untouched-on-refusal",
    bankedPct === 60,
    `baseline was BANKED at ${bankedPct} from a universe cut to a third — the exit code alone is not the guarantee`,
  );
  check("banking/allow-shrink-permitted", bankAllowCode === 0, `got ${bankAllowCode}`);
  check("banking/allow-shrink-actually-writes", bankAllowPct === 81, `got ${bankAllowPct}`);

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
      // DENOMINATOR SHRINK, on the WRITE path. The drop check below cannot
      // stand in for this one, and that is the whole point: a shrunk universe
      // makes the percentage go UP, so `current.globalPct < prior.globalPct` is
      // false exactly when this is most dangerous. Narrow the vitest `include`
      // to `lib/**`, and app/[locale] (56.6%, the largest directory) silently
      // stops being measured — the run reports ~81% against a 66.77% baseline
      // and banks it. Every later correct-config run then fails as a
      // "regression" against a baseline that was never real.
      if (checkDenominator(current, prior) && !args.has("--allow-shrink")) {
        console.error(
          `REFUSING to update the baseline: the measured universe SHRANK by ` +
            `more than ${DENOMINATOR_TOLERANCE_PCT}%.\n` +
            `  files:      ${prior.files} -> ${current.files}\n` +
            `  statements: ${prior.lines?.total} -> ${current.lines.total}\n` +
            `Coverage can rise because code got tested, or because code stopped ` +
            `being MEASURED — only the first is progress, and banking the second ` +
            `raises the bar against a universe that no longer exists.\n` +
            `Check the vitest coverage \`include\` glob first. If the shrink is ` +
            `real and intended, rerun with --allow-shrink and say why in the PR body.`,
        );
        return 1;
      }
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

  // DENOMINATOR SHRINK. A percentage can rise because code got tested, or
  // because code stopped being MEASURED — and only the first is progress. A
  // one-line typo narrowing the `include` glob to `lib/**` would report ~81.5%
  // against a 66.77% baseline: a false +14.7pt "improvement" with `app/[locale]`
  // (56.6%, the largest directory) silently unmeasured.
  //
  // The baseline has recorded `files` and `lines.total` since it was first
  // written and nothing ever read them back. This is that check.
  const shrink = checkDenominator(current, baseline);
  if (shrink && !args.has("--allow-shrink")) {
    console.error(
      `REFUSING: the measured universe SHRANK by more than ${DENOMINATOR_TOLERANCE_PCT}%.\n` +
        `  files:      ${baseline.files} -> ${current.files}\n` +
        `  statements: ${baseline.lines?.total} -> ${current.lines.total}\n\n` +
        `Coverage can rise because code got tested, or because code stopped being\n` +
        `measured. This is the second one. Check vitest.config.js's coverage\n` +
        `include/exclude globs before believing the percentage.\n` +
        `If the shrink is intended (files genuinely deleted), rerun with --allow-shrink.`,
    );
    return 1;
  }

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
