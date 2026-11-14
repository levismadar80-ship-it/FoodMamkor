#!/usr/bin/env node
/**
 * eslint-ratchet — ESLint warnings that can only go down (MEH-3160).
 *
 * WHY THIS EXISTS
 * ---------------
 * `frontend/eslint.config.mjs` downgrades every plugin rule to "warn"
 * (MEH-443, "until the refactors ship + a 30-day soak"). A warning that never
 * blocks is a line in a log nobody reads: on 14/11/2026 the tree carried
 * 17,440 of them and the owner learned about the oversized files by asking.
 * Same remedy as the Knip gate next door (lint-ratchet.mjs, MEH-1868): freeze
 * today's counts, allow what is already there, block only what is NEW.
 *
 * WHAT IT GATES — AND WHAT IT DELIBERATELY DOES NOT
 * -------------------------------------------------
 * Only product code (`app/`, `components/`, `lib/`) and only the rules in
 * GATED below: the ones whose finding is a likely bug or a bypass of a repo
 * rule (the repo's own `no-restricted-syntax` selectors, React hooks,
 * `eqeqeq`, Next's rules, dead stores / unused code, unsafe regex, eval).
 * Style rules (`id-length`, `no-magic-numbers`, most of `unicorn/*`) and the
 * size rules stay warnings: gating 137 rules would fail every new test file
 * on a two-letter variable, and a gate like that gets routed around. File
 * size has its own owner (file-size-ratchet.sh).
 *
 * THE GATE IS THE PER-RULE TOTAL; (file, rule) IS THE DIAGNOSTIC
 * --------------------------------------------------------------
 * A baseline keyed only by file breaks on every move or split: the count
 * leaves one path and "appears" at another. So the pass/fail question is
 * asked per rule across the whole scanned tree — the total may not rise —
 * and the per-file rows exist to NAME where it rose. Moving code between
 * files therefore passes, with a note that the baseline rows are stale.
 *
 * A NULL RESULT IS NOT A PASS
 * ---------------------------
 * "0 findings" is also what a dead ESLint prints. Every real run first lints
 * ONE real file that the baseline says carries a gated finding and requires
 * ESLint to report it (the control). If the control is silent, the run fails
 * and says every zero in it is void.
 *
 * USAGE (from anywhere; it locates frontend/ itself)
 *   node scripts/checks/eslint-ratchet.mjs                    # compare; exit 1 if a gated total rose
 *   node scripts/checks/eslint-ratchet.mjs --update-baseline  # rewrite rows (refuses a higher total)
 *   node scripts/checks/eslint-ratchet.mjs --update-baseline --allow-increase
 *   node scripts/checks/eslint-ratchet.mjs --self-test        # comparator cases + the control
 *   node scripts/checks/eslint-ratchet.mjs --eslint-json <p>  # compare a captured `eslint -f json`
 *
 * Runs inside `npm run lint:ratchet` (frontend lint job). Not a .sh on
 * purpose: run-all.sh auto-discovers *.sh and the Repo guards job has no
 * node_modules (same reason as lint-ratchet.mjs).
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const FRONTEND_DIR = join(REPO_ROOT, "frontend");
const BASELINE_PATH = join(HERE, "eslint-ratchet-baseline.tsv");
const SCAN_DIRS = ["app", "components", "lib"];
const MAX_BUFFER = 512 * 1024 * 1024;

/** Exact rule ids, or a `prefix/` that gates every rule of that plugin. */
const GATED = [
  "no-restricted-syntax",
  "eqeqeq",
  "react-hooks/",
  "@next/next/",
  "sonarjs/no-dead-store",
  "sonarjs/no-unused-vars",
  "sonarjs/unused-import",
  "sonarjs/no-unused-collection",
  "sonarjs/no-identical-functions",
  "sonarjs/no-duplicated-branches",
  "sonarjs/super-linear-regex",
  "sonarjs/code-eval",
  "security/detect-unsafe-regex",
  "security/detect-eval-with-expression",
];

export function isGated(ruleId) {
  if (!ruleId) return false;
  return GATED.some((g) => (g.endsWith("/") ? ruleId.startsWith(g) : ruleId === g));
}

/**
 * @param {Array<{filePath: string, messages: Array<{ruleId: string|null}>}>} results `eslint -f json`
 * @param {string} frontendDir absolute path the file paths are made relative to
 * @returns {Map<string, number>} "frontend/<path>\t<rule>" -> count, gated rules only
 */
export function aggregate(results, frontendDir = FRONTEND_DIR) {
  const out = new Map();
  for (const file of results) {
    const rel = "frontend/" + relative(frontendDir, file.filePath).split(sep).join("/");
    for (const message of file.messages || []) {
      if (!isGated(message.ruleId)) continue;
      const key = `${rel}\t${message.ruleId}`;
      out.set(key, (out.get(key) || 0) + 1);
    }
  }
  return out;
}

export function totalsByRule(rows) {
  const totals = new Map();
  for (const [key, count] of rows) {
    const rule = key.split("\t")[1];
    totals.set(rule, (totals.get(rule) || 0) + count);
  }
  return totals;
}

/**
 * @returns {{ risen: Array<{rule: string, was: number, now: number, where: string[]}>,
 *             fallen: Array<{rule: string, was: number, now: number}>, moved: number }}
 */
export function compare(baseline, current) {
  const was = totalsByRule(baseline);
  const now = totalsByRule(current);
  const risen = [];
  const fallen = [];
  for (const rule of new Set([...was.keys(), ...now.keys()])) {
    const a = was.get(rule) || 0;
    const b = now.get(rule) || 0;
    if (b > a) {
      const where = [];
      for (const [key, count] of current) {
        if (key.split("\t")[1] !== rule) continue;
        const before = baseline.get(key) || 0;
        if (count > before) where.push(`${key.split("\t")[0]} (${before} -> ${count})`);
      }
      risen.push({ rule, was: a, now: b, where });
    } else if (b < a) {
      fallen.push({ rule, was: a, now: b });
    }
  }
  let moved = 0;
  for (const [key, count] of current) if ((baseline.get(key) || 0) !== count) moved += 1;
  for (const key of baseline.keys()) if (!current.has(key)) moved += 1;
  return { risen, fallen, moved };
}

export function parseBaseline(text) {
  const rows = new Map();
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const [file, rule, count] = line.split("\t");
    rows.set(`${file}\t${rule}`, Number(count));
  }
  return rows;
}

function serialize(rows) {
  const header = [
    "# eslint-ratchet baseline (MEH-3160) — file<TAB>rule<TAB>count, gated rules only.",
    "# The gate is the per-rule TOTAL; these rows name where a rise happened.",
    "# Regenerate: node scripts/checks/eslint-ratchet.mjs --update-baseline (refuses a higher total).",
  ];
  const body = [...rows].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([key, count]) => `${key}\t${count}`);
  return [...header, ...body].join("\n") + "\n";
}

function runEslint(targets) {
  try {
    const stdout = execFileSync("npx", ["eslint", ...targets, "-f", "json"], {
      cwd: FRONTEND_DIR,
      maxBuffer: MAX_BUFFER,
      stdio: ["ignore", "pipe", "inherit"],
    });
    return JSON.parse(stdout.toString("utf8"));
  } catch (error) {
    // eslint exits 1 when it finds errors; its JSON is still on stdout.
    if (error.stdout && error.stdout.length) return JSON.parse(error.stdout.toString("utf8"));
    throw error;
  }
}

function fail(message) {
  console.error(`eslint-ratchet FAILED — ${message}`);
  process.exit(1);
}

/** Lint ONE real file the baseline says has a gated finding; ESLint must report it. */
function control(baseline) {
  const anchor = [...baseline].find(([key]) => existsSync(join(REPO_ROOT, key.split("\t")[0])));
  if (!anchor) fail("control: no baseline row points at a file that exists; every zero in this run is void.");
  const [file, rule] = anchor[0].split("\t");
  const seen = aggregate(runEslint([relative(FRONTEND_DIR, join(REPO_ROOT, file))]));
  if (!seen.get(`${file}\t${rule}`)) {
    fail(`control: ESLint reported no '${rule}' in ${file}, which the baseline says has ${anchor[1]}. ` +
      "Either that file was cleaned (run --update-baseline) or ESLint is not really running; every zero in this run is void.");
  }
  console.log(`eslint-ratchet control OK — ESLint still reports '${rule}' in ${file}.`);
}

function selfTest() {
  const rows = (pairs) => new Map(pairs);
  const cases = [
    ["same counts pass", rows([["a.js\teqeqeq", 2]]), rows([["a.js\teqeqeq", 2]]), 0],
    ["a new finding in a new file is a rise", rows([["a.js\teqeqeq", 2]]), rows([["a.js\teqeqeq", 2], ["b.js\teqeqeq", 1]]), 1],
    ["a higher count in the same file is a rise", rows([["a.js\teqeqeq", 2]]), rows([["a.js\teqeqeq", 3]]), 1],
    ["moving findings between files is not a rise", rows([["a.js\teqeqeq", 2]]), rows([["b.js\teqeqeq", 2]]), 0],
    ["a rule never seen before is a rise", rows([]), rows([["a.js\treact-hooks/rules-of-hooks", 1]]), 1],
    ["a fix elsewhere does not pay for a different rule", rows([["a.js\teqeqeq", 2]]), rows([["a.js\teqeqeq", 1], ["a.js\tsonarjs/no-dead-store", 1]]), 1],
  ];
  let bad = 0;
  for (const [name, baseline, current, expected] of cases) {
    const got = compare(baseline, current).risen.length;
    if (got !== expected) { bad += 1; console.error(`  self-test FAIL: ${name} — expected ${expected} risen rule(s), got ${got}`); }
  }
  const sample = [{ filePath: join(FRONTEND_DIR, "lib", "x.js"), messages: [{ ruleId: "eqeqeq" }, { ruleId: "id-length" }, { ruleId: null }, { ruleId: "react-hooks/refs" }] }];
  const agg = aggregate(sample);
  if (agg.size !== 2 || agg.get("frontend/lib/x.js\teqeqeq") !== 1 || agg.get("frontend/lib/x.js\treact-hooks/refs") !== 1) {
    bad += 1; console.error("  self-test FAIL: aggregate must keep gated rules only (eqeqeq, react-hooks/refs) and drop id-length / null");
  }
  if (bad) fail(`${bad} self-test case(s) failed; the comparator cannot be trusted.`);
  console.log(`eslint-ratchet self-test PASS — ${cases.length + 1} case(s).`);
  // The anchored case: the real ESLint, the real config, one real repo file.
  control(parseBaseline(readFileSync(BASELINE_PATH, "utf8")));
}

function main() {
  const args = process.argv.slice(2);
  const flag = (name) => args.includes(name);
  if (flag("--self-test")) return selfTest();

  const jsonAt = args.indexOf("--eslint-json");
  const captured = jsonAt !== -1 ? args[jsonAt + 1] : null;
  const baselineExists = existsSync(BASELINE_PATH);
  const baseline = baselineExists ? parseBaseline(readFileSync(BASELINE_PATH, "utf8")) : new Map();

  if (!captured && baselineExists && !flag("--update-baseline")) control(baseline);

  const results = captured ? JSON.parse(readFileSync(captured, "utf8")) : runEslint(SCAN_DIRS);
  const scanned = results.filter((r) => SCAN_DIRS.some((d) => relative(FRONTEND_DIR, r.filePath).split(sep)[0] === d));
  if (scanned.length === 0) fail("ESLint returned 0 files under app/, components/, lib/ — nothing was linted, so nothing was checked.");
  const current = aggregate(scanned);
  const { risen, fallen, moved } = compare(baseline, current);
  const total = (rows) => [...rows.values()].reduce((a, b) => a + b, 0);

  if (flag("--update-baseline")) {
    if (risen.length && baselineExists && !flag("--allow-increase")) {
      for (const r of risen) console.error(`  ${r.rule}: ${r.was} -> ${r.now}`);
      fail("refusing to write a baseline with a higher total. Fix the new findings, or pass --allow-increase and say why in the PR.");
    }
    writeFileSync(BASELINE_PATH, serialize(current));
    console.log(`eslint-ratchet baseline written — ${total(current)} finding(s) in ${current.size} (file, rule) row(s), ${scanned.length} files scanned.`);
    return;
  }

  if (!baselineExists) fail(`no baseline at ${relative(REPO_ROOT, BASELINE_PATH)}; run --update-baseline once.`);
  console.log(`eslint-ratchet: ${scanned.length} files scanned; gated findings ${total(current)} (baseline ${total(baseline)}).`);
  for (const f of fallen) console.log(`  improved: ${f.rule} ${f.was} -> ${f.now} (run --update-baseline to lock it in)`);
  if (risen.length) {
    for (const r of risen) {
      console.error(`  NEW: ${r.rule} ${r.was} -> ${r.now}`);
      for (const w of r.where) console.error(`       ${w}`);
    }
    fail(`${risen.length} gated rule(s) have more findings than the baseline. These were warnings until MEH-3160; fix them (npx eslint <file>).`);
  }
  if (moved) console.log(`  note: ${moved} baseline row(s) are stale (code moved or was fixed); totals did not rise.`);
  console.log("eslint-ratchet OK — no gated rule above its baseline.");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
