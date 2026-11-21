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
 *   playwright/no-skipped-test         a skip, anywhere
 *   no-restricted-syntax               a `.fixme` (the plugin rule does not see it)
 *   playwright/no-conditional-expect   an expect inside a branch
 *   playwright/no-conditional-in-test  a branch inside a test body
 *
 * WHAT IT DOES NOT CATCH (measured by the reviewer, 20/11)
 * --------------------------------------------------------
 * An alias (`const t = test; t.skip()`), `try { expect } catch {}`, an
 * `expect` inside a loop that may run zero times, `a || b` used as a branch,
 * and an `if` inside a callback. These need review, not this gate.
 *
 * The gate is the per-rule TOTAL across all specs; the per-file rows name
 * where it rose (same comparator as eslint-ratchet.mjs, imported from it).
 *
 * WHEN A NEW ONE IS LEGITIMATE
 * ----------------------------
 * A skip gated on something the product cannot move (project name, env var)
 * is fine. Say so where it lives:
 *   // eslint-disable-next-line playwright/no-skipped-test -- <reason>
 * The reason is required: a disable that names one of the gated rules, or
 * names no rule at all (which hides every rule), with no ` -- reason` inside
 * the same comment is counted as a finding under `disable-without-reason`.
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
 *   node scripts/checks/e2e-self-skip-ratchet.mjs --self-test --no-eslint   # pure cases only
 *
 * Runs inside `npm run lint:ratchet` (frontend lint job); not a .sh, because
 * the Repo guards job has no node_modules. What that job CAN hold without
 * ESLint (the pure self-test, and the baseline not rising) is in
 * e2e-self-skip-guard.sh, which runs on every PR.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compare, parseBaseline } from "./eslint-ratchet.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const FRONTEND_DIR = join(REPO_ROOT, "frontend");
const BASELINE_PATH = join(HERE, "e2e-self-skip-baseline.tsv");
const CONFIG = "e2e/self-skip.eslint.config.mjs";
const MAX_BUFFER = 256 * 1024 * 1024;
const RULES = ["playwright/no-skipped-test", "no-restricted-syntax", "playwright/no-conditional-expect", "playwright/no-conditional-in-test"];
const SPEC_RE = /\.spec\.[cm]?[jt]sx?$/;
const NO_REASON = "disable-without-reason";
const CONTROL_ANCHORS = 5;

/**
 * Disable comments that can hide a gated rule and give no ` -- reason`.
 * "Can hide" = names one of the gated rules, or names no rule at all (a bare
 * `eslint-disable` switches every rule off). The reason must be inside the
 * same comment: text after a closing `*\/` does not count.
 */
export function disablesWithoutReason(source) {
  let count = 0;
  for (const line of source.split("\n")) {
    const match = /(?:\/\/|\/\*)\s*eslint-disable(?:-next-line|-line)?(?![\w-])(.*)$/.exec(line);
    if (!match) continue;
    const body = match[1].split("*/")[0];
    const [ruleList, ...reasonParts] = body.split(" -- ");
    const named = ruleList.trim();
    if (named && !RULES.some((rule) => named.includes(rule))) continue;
    if (!reasonParts.join(" -- ").trim()) count += 1;
  }
  return count;
}

/** Every spec file on disk under frontend/e2e, as paths relative to frontend/. */
export function specFilesOnDisk(dir = join(FRONTEND_DIR, "e2e")) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...specFilesOnDisk(full));
    else if (SPEC_RE.test(entry.name)) out.push(relative(FRONTEND_DIR, full).split(sep).join("/"));
  }
  return out;
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
    ["a bare disable hides every rule and is counted", "/* eslint-disable */", 1],
    ["a bare next-line disable is counted", "// eslint-disable-next-line", 1],
    ["a bare disable with a reason is not counted", "/* eslint-disable -- generated report harness */", 0],
    ["a reason outside the block comment does not count", "/* eslint-disable playwright/no-skipped-test */ // -- x", 1],
    ["a fixme disable with no reason is counted", "// eslint-disable-next-line no-restricted-syntax", 1],
    ["eslint-enable is not a disable", "/* eslint-enable */", 0],
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
  // --no-eslint is for the Repo guards job, which has no node_modules; it
  // says the control did not run instead of printing an OK it did not earn.
  if (process.argv.includes("--no-eslint")) {
    console.log("e2e-self-skip-ratchet control NOT RUN (--no-eslint): the cases above are pure; ESLint itself was not exercised.");
    return;
  }
  control(parseBaseline(readFileSync(BASELINE_PATH, "utf8")));
}

function main() {
  const args = process.argv.slice(2);
  const flag = (name) => args.includes(name);
  if (flag("--self-test")) return selfTest();

  const baselineExists = existsSync(BASELINE_PATH);
  const baseline = baselineExists ? parseBaseline(readFileSync(BASELINE_PATH, "utf8")) : new Map();
  if (baselineExists && !flag("--update-baseline")) control(baseline);

  const results = runEslint(["e2e"]).filter((r) => SPEC_RE.test(r.filePath));
  if (results.length === 0) fail("ESLint returned 0 spec files under e2e/ — nothing was linted, so nothing was checked.");
  const linted = new Set(results.map((r) => relative(FRONTEND_DIR, r.filePath).split(sep).join("/")));
  const unlinted = specFilesOnDisk().filter((file) => !linted.has(file));
  if (unlinted.length) {
    fail(`${unlinted.length} spec file(s) on disk were not linted (first: frontend/${unlinted[0]}). ` +
      `Widen the 'files' glob in frontend/${CONFIG}; an unlinted spec is an unchecked spec.`);
  }
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
