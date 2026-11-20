#!/usr/bin/env node
/**
 * e2e-self-skip-ratchet — Playwright specs that neutralise themselves can only
 * go down (MEH-3520, replaces the warn-only patch of MEH-1696).
 *
 * WHY THIS EXISTS
 * ---------------
 * `if (count === 0) test.skip(...)` turns "the element is gone" into a green
 * run. That is how the language toggle stayed missing on desktop for five
 * weeks (MEH-896): the spec that should have caught it skipped itself.
 * testing.md already says it in prose ("a guard that consults its own subject
 * can never fail"); prose is not a gate. The first attempt at a gate was two
 * warn-only ESLint blocks, and a warning that never blocks is not read
 * (MEH-3160 counted 17,440 of them). So: freeze today's counts, allow what is
 * there, block what is NEW.
 *
 * WHAT IT GATES
 * -------------
 * Spec files under frontend/e2e/ (`*.spec.*`), three rules of
 * eslint-plugin-playwright, run from frontend/e2e/self-skip.eslint.config.mjs
 * (the main config ignores e2e/** globally and that cannot be undone from a
 * later block):
 *   playwright/no-skipped-test         a skip or fixme, anywhere
 *   playwright/no-conditional-expect   an expect inside a branch
 *   playwright/no-conditional-in-test  a branch inside a test body
 *
 * The gate is the per-rule TOTAL across all specs; the per-file rows name
 * where it rose (same comparator as eslint-ratchet.mjs, imported from it).
 *
 * WHEN A NEW ONE IS LEGITIMATE
 * ----------------------------
 * A skip gated on something the product cannot move (project name, env var)
 * is fine. Say so where it lives:
 *   // eslint-disable-next-line playwright/no-skipped-test -- <reason>
 * The reason is required: a disable for one of the three rules with no
 * ` -- reason` is counted as a finding under `disable-without-reason`.
 *
 * A NULL RESULT IS NOT A PASS
 * ---------------------------
 * Every real run first lints baseline files that carry a finding and requires
 * ESLint to report one (the control). A dead ESLint, a missing plugin or a
 * config that matches no file prints the same zero as a clean tree.
 *
 * USAGE
 *   node scripts/checks/e2e-self-skip-ratchet.mjs                    # compare
 *   node scripts/checks/e2e-self-skip-ratchet.mjs --update-baseline  # refuses a higher total
 *   node scripts/checks/e2e-self-skip-ratchet.mjs --update-baseline --allow-increase
 *   node scripts/checks/e2e-self-skip-ratchet.mjs --self-test
 *
 * Runs inside `npm run lint:ratchet` (frontend lint job); not a .sh, because
 * the Repo guards job has no node_modules.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compare, parseBaseline } from "./eslint-ratchet.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const FRONTEND_DIR = join(REPO_ROOT, "frontend");
const BASELINE_PATH = join(HERE, "e2e-self-skip-baseline.tsv");
const CONFIG = "e2e/self-skip.eslint.config.mjs";
const MAX_BUFFER = 256 * 1024 * 1024;
const RULES = ["playwright/no-skipped-test", "playwright/no-conditional-expect", "playwright/no-conditional-in-test"];
const NO_REASON = "disable-without-reason";
const CONTROL_ANCHORS = 5;

/** A disable comment that names one of the three rules and gives no ` -- reason`. */
export function disablesWithoutReason(source) {
  let count = 0;
  for (const line of source.split("\n")) {
    const at = line.indexOf("eslint-disable");
    if (at === -1) continue;
    const directive = line.slice(at).replace(/\*\/\s*$/, "");
    if (!RULES.some((rule) => directive.includes(rule))) continue;
    const reason = directive.split(" -- ")[1];
    if (!reason || !reason.trim()) count += 1;
  }
  return count;
}

/**
 * @param {Array<{filePath: string, messages: Array<{ruleId: string|null}>, source?: string}>} results
 * @param {(path: string) => string} read returns a file's text (injected in the self-test)
 * @returns {Map<string, number>} "frontend/<path>\t<rule>" -> count
 */
export function aggregate(results, read = (path) => readFileSync(path, "utf8"), frontendDir = FRONTEND_DIR) {
  const out = new Map();
  for (const file of results) {
    const rel = "frontend/" + relative(frontendDir, file.filePath).split(sep).join("/");
    for (const message of file.messages || []) {
      if (!RULES.includes(message.ruleId)) continue;
      const key = `${rel}\t${message.ruleId}`;
      out.set(key, (out.get(key) || 0) + 1);
    }
    const bare = disablesWithoutReason(read(file.filePath));
    if (bare) out.set(`${rel}\t${NO_REASON}`, bare);
  }
  return out;
}

function serialize(rows) {
  const header = [
    "# e2e-self-skip-ratchet baseline (MEH-3520) — file<TAB>rule<TAB>count.",
    "# The gate is the per-rule TOTAL; these rows name where a rise happened.",
    "# Regenerate: node scripts/checks/e2e-self-skip-ratchet.mjs --update-baseline (refuses a higher total).",
  ];
  const body = [...rows].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([key, count]) => `${key}\t${count}`);
  return [...header, ...body].join("\n") + "\n";
}

function fail(message) {
  console.error(`e2e-self-skip-ratchet FAILED — ${message}`);
  process.exit(1);
}

function runEslint(targets) {
  const args = ["eslint", "--no-config-lookup", "-c", CONFIG, ...targets, "-f", "json"];
  let stdout;
  try {
    stdout = execFileSync("npx", args, { cwd: FRONTEND_DIR, maxBuffer: MAX_BUFFER, stdio: ["ignore", "pipe", "inherit"] });
  } catch (error) {
    if (!error.stdout || !error.stdout.length) throw error;
    stdout = error.stdout;
  }
  const results = JSON.parse(stdout.toString("utf8"));
  const broken = results.filter((r) => (r.messages || []).some((m) => m.fatal));
  if (broken.length) {
    fail(`ESLint could not parse ${broken.length} file(s) (first: ${relative(REPO_ROOT, broken[0].filePath)}); ` +
      "an unparsed spec is an unchecked spec.");
  }
  return results;
}

function control(baseline) {
  const anchors = [];
  for (const [key] of baseline) {
    const [file, rule] = key.split("\t");
    if (rule === NO_REASON || anchors.some((a) => a.file === file) || !existsSync(join(REPO_ROOT, file))) continue;
    anchors.push({ file, rule });
    if (anchors.length === CONTROL_ANCHORS) break;
  }
  if (!anchors.length) fail("control: no baseline row points at a file that exists; every zero in this run is void.");
  const seen = aggregate(runEslint(anchors.map((a) => relative(FRONTEND_DIR, join(REPO_ROOT, a.file)))));
  const hit = anchors.find((a) => seen.get(`${a.file}\t${a.rule}`));
  if (!hit) {
    fail(`control: ESLint reported none of the ${anchors.length} baseline findings it was pointed at ` +
      `(first: '${anchors[0].rule}' in ${anchors[0].file}). ESLint is not really running, or all of those ` +
      "specs were cleaned at once (then run --update-baseline); every zero in this run is void.");
  }
  console.log(`e2e-self-skip-ratchet control OK — ESLint still reports '${hit.rule}' in ${hit.file}.`);
}

function selfTest() {
  const cases = [
    ["a disable with a reason is not counted", "// eslint-disable-next-line playwright/no-skipped-test -- mobile project only", 0],
    ["a disable with no reason is counted", "// eslint-disable-next-line playwright/no-skipped-test", 1],
    ["a disable with an empty reason is counted", "// eslint-disable-next-line playwright/no-conditional-expect -- ", 1],
    ["a block disable with no reason is counted", "/* eslint-disable playwright/no-conditional-in-test */", 1],
    ["a block disable with a reason is not counted", "/* eslint-disable playwright/no-conditional-in-test -- report builder */", 0],
    ["a disable for another rule is not ours", "// eslint-disable-next-line no-console", 0],
    ["two bare disables are two", "// eslint-disable-line playwright/no-skipped-test\n// eslint-disable-line playwright/no-skipped-test", 2],
  ];
  let ran = 0;
  let bad = 0;
  for (const [name, source, expected] of cases) {
    ran += 1;
    const got = disablesWithoutReason(source);
    if (got !== expected) { bad += 1; console.error(`  self-test FAIL: ${name} — expected ${expected}, got ${got}`); }
  }
  ran += 1;
  const sample = [{ filePath: join(FRONTEND_DIR, "e2e", "x.spec.ts"), messages: [{ ruleId: "playwright/no-skipped-test" }, { ruleId: "no-console" }, { ruleId: null }] }];
  const agg = aggregate(sample, () => "// eslint-disable-next-line playwright/no-skipped-test\n");
  if (agg.size !== 2 || agg.get("frontend/e2e/x.spec.ts\tplaywright/no-skipped-test") !== 1 || agg.get(`frontend/e2e/x.spec.ts\t${NO_REASON}`) !== 1) {
    bad += 1; console.error("  self-test FAIL: aggregate must keep the three rules, drop the rest, and count the bare disable");
  }
  ran += 1;
  const risen = compare(new Map([["a.spec.ts\tplaywright/no-skipped-test", 1]]), new Map([["a.spec.ts\tplaywright/no-skipped-test", 1], ["b.spec.ts\tplaywright/no-skipped-test", 1]])).risen.length;
  if (risen !== 1) { bad += 1; console.error("  self-test FAIL: a new skip in a new spec must be a rise"); }
  if (bad) fail(`${bad} of ${ran} self-test case(s) failed.`);
  console.log(`e2e-self-skip-ratchet self-test PASS — ${ran} case(s).`);
  // The anchored case: the real ESLint, the real plugin, real spec files.
  control(parseBaseline(readFileSync(BASELINE_PATH, "utf8")));
}

function main() {
  const args = process.argv.slice(2);
  const flag = (name) => args.includes(name);
  if (flag("--self-test")) return selfTest();

  const baselineExists = existsSync(BASELINE_PATH);
  const baseline = baselineExists ? parseBaseline(readFileSync(BASELINE_PATH, "utf8")) : new Map();
  if (baselineExists && !flag("--update-baseline")) control(baseline);

  const results = runEslint(["e2e"]).filter((r) => /\.spec\.[cm]?[jt]sx?$/.test(r.filePath));
  if (results.length === 0) fail("ESLint returned 0 spec files under e2e/ — nothing was linted, so nothing was checked.");
  const current = aggregate(results);
  const { risen, fallen, moved } = compare(baseline, current);
  const total = (rows) => [...rows.values()].reduce((a, b) => a + b, 0);

  if (flag("--update-baseline")) {
    if (risen.length && baselineExists && !flag("--allow-increase")) {
      for (const r of risen) console.error(`  ${r.rule}: ${r.was} -> ${r.now}`);
      fail("refusing to write a baseline with a higher total. Fix the new findings, or pass --allow-increase and say why in the PR.");
    }
    writeFileSync(BASELINE_PATH, serialize(current));
    console.log(`e2e-self-skip-ratchet baseline written — ${total(current)} finding(s) in ${current.size} (file, rule) row(s), ${results.length} spec files scanned.`);
    return;
  }

  if (!baselineExists) fail(`no baseline at ${relative(REPO_ROOT, BASELINE_PATH)}; run --update-baseline once.`);
  console.log(`e2e-self-skip-ratchet: ${results.length} spec files scanned; findings ${total(current)} (baseline ${total(baseline)}).`);
  for (const f of fallen) console.log(`  improved: ${f.rule} ${f.was} -> ${f.now} (run --update-baseline to lock it in)`);
  if (risen.length) {
    for (const r of risen) {
      console.error(`  NEW: ${r.rule} ${r.was} -> ${r.now}`);
      for (const w of r.where) console.error(`       ${w}`);
    }
    fail(`${risen.length} rule(s) have more findings than the baseline. A spec that skips, returns early or asserts ` +
      "inside a branch can pass when the thing it tests is gone. Assert unconditionally, or gate on something the " +
      "product cannot move and add `// eslint-disable-next-line <rule> -- <reason>`.");
  }
  if (moved) console.log(`  note: ${moved} baseline row(s) are stale (code moved or was fixed); totals did not rise.`);
  console.log("e2e-self-skip-ratchet OK — no rule above its baseline.");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
