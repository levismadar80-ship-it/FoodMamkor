#!/usr/bin/env node
/**
 * lint-ratchet — a Knip gate that can only tighten.
 *
 * WHY THIS EXISTS (MEH-1868)
 * --------------------------
 * Knip runs warn-only today, and a warn-only gate is not a soft gate — it is a
 * non-gate. Nobody reads a warning that never blocks anything. The fix is NOT a
 * repo-wide cleanup: industry experience (Notion, Life360) is that "zero
 * warnings" policies read as high-effort/low-reward and simply stall. So we
 * freeze today's counts as a baseline, allow everything already there, and
 * block only what is NEW.
 *
 * THE KEY IS (file, rule, count) — NEVER A LINE NUMBER
 * ---------------------------------------------------
 * Life360's published warning about `lint-baseline.xml`: a baseline keyed by
 * line number is brittle. Any unrelated edit shifts lines, and warnings that
 * were already accounted for come back as "new". Knip's JSON reports one object
 * per file with an array per rule, so (file, rule, count) is available directly
 * from the tool's own output with no text parsing and no positional data.
 *
 * WHY .mjs AND NOT .sh, EVEN THOUGH IT LIVES IN scripts/checks/
 * ------------------------------------------------------------
 * `run-all.sh` auto-discovers guards with `find "$CHECKS_DIR" -maxdepth 1 -type
 * f -name '*.sh'` — extension-matched. A `.mjs` therefore CANNOT join the
 * auto-discovered set, which matters: the required "Repo guards" job has no
 * node_modules and no npx, so an auto-discovered Knip guard would red every
 * backend-only and docs-only PR. Precedent for a non-discovered .mjs in this
 * directory: `scripts/checks/console-sweep.mjs`.
 *
 * This script is invoked explicitly from the frontend lint job, never by
 * run-all.sh. Do not rename it to .sh.
 *
 * USAGE
 *   node scripts/checks/lint-ratchet.mjs                  # compare; exit 1 on any increase
 *   node scripts/checks/lint-ratchet.mjs --update-baseline # rewrite baseline (refuses increases)
 *   node scripts/checks/lint-ratchet.mjs --update-baseline --allow-increase
 *   node scripts/checks/lint-ratchet.mjs --self-test       # prove the comparator discriminates
 *   node scripts/checks/lint-ratchet.mjs --knip-json <path> # compare against a captured run
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const FRONTEND_DIR = join(REPO_ROOT, "frontend");
const BASELINE_PATH = join(HERE, "lint-ratchet-baseline.tsv");
const FIXTURE_PATH = join(HERE, "testdata", "knip-sample.json");

/* ------------------------------------------------------------------ *
 * Aggregation
 * ------------------------------------------------------------------ */

/**
 * Knip's JSON is { issues: [ { file, exports: [...], files: [...], ... } ] }.
 *
 * Every array-valued property is a rule bucket. We count them GENERICALLY
 * rather than against a hardcoded rule list, so that a Knip upgrade adding a
 * new rule category cannot be silently dropped on the floor. A hardcoded list
 * would make new-rule findings invisible, which is the same defect class the
 * ratchet exists to close.
 *
 * @returns {Map<string, number>} key `${file}\t${rule}` -> count
 */
export function aggregate(knipJson) {
  if (!knipJson || typeof knipJson !== "object" || !Array.isArray(knipJson.issues)) {
    throw new Error("unrecognised Knip payload: expected an object with an `issues` array");
  }
  const counts = new Map();
  for (const entry of knipJson.issues) {
    const file = entry?.file;
    if (typeof file !== "string" || file === "") continue;
    for (const [rule, value] of Object.entries(entry)) {
      if (!Array.isArray(value) || value.length === 0) continue;
      const key = `${file}\t${rule}`;
      counts.set(key, (counts.get(key) ?? 0) + value.length);
    }
  }
  return counts;
}

/* ------------------------------------------------------------------ *
 * Baseline I/O — TSV, one line per (file, rule), sorted for diffability
 * ------------------------------------------------------------------ */

export function parseBaseline(text) {
  const counts = new Map();
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const parts = raw.split("\t");
    if (parts.length !== 3) {
      throw new Error(`malformed baseline line (expected 3 tab-separated fields): ${raw}`);
    }
    const [file, rule, countStr] = parts;
    const count = Number.parseInt(countStr.trim(), 10);
    if (!Number.isInteger(count) || count < 0) {
      throw new Error(`malformed baseline count: ${raw}`);
    }
    counts.set(`${file}\t${rule}`, count);
  }
  return counts;
}

function serialiseBaseline(counts, total) {
  const header = [
    "# Knip ratchet baseline — MEH-1868",
    "#",
    "# Format: <file>\\t<rule>\\t<count>, sorted. One line per (file, rule).",
    "#",
    "# Keyed by file+rule+count and deliberately NOT by line number: a",
    "# line-keyed baseline resurrects already-accounted-for warnings on any",
    "# unrelated code shift (Life360's documented failure with lint-baseline.xml).",
    "#",
    "# Everything listed here is GRANDFATHERED — allowed, not endorsed. The gate",
    "# blocks only counts that RISE above these numbers, and any (file, rule) not",
    "# listed here has an implicit baseline of 0, so genuinely new findings block.",
    "#",
    "# Regenerate:  node scripts/checks/lint-ratchet.mjs --update-baseline",
    "# Raising a number requires an explicit --allow-increase and should be justified in the PR.",
    `#`,
    `# as-of: this file is a measurement, not a target. Total at freeze: ${total}.`,
    "",
  ].join("\n");
  const body = [...counts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, count]) => `${key}\t${count}`)
    .join("\n");
  return `${header}${body}\n`;
}

/* ------------------------------------------------------------------ *
 * Comparison
 * ------------------------------------------------------------------ */

/**
 * Compares current counts against the baseline.
 *
 * Iterates the UNION of both key sets, not just the baseline's. A (file, rule)
 * absent from the baseline has an implicit baseline of 0 — otherwise a brand
 * new unused export in a brand new file would be invisible to the gate, which
 * is precisely the finding the ratchet is meant to catch.
 */
export function compare(current, baseline) {
  const violations = [];
  const improvements = [];
  for (const key of new Set([...current.keys(), ...baseline.keys()])) {
    const cur = current.get(key) ?? 0;
    const base = baseline.get(key) ?? 0;
    if (cur > base) violations.push({ key, cur, base });
    else if (cur < base) improvements.push({ key, cur, base });
  }
  const bykey = (x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0);
  violations.sort(bykey);
  improvements.sort(bykey);
  return { violations, improvements };
}

const total = (counts) => [...counts.values()].reduce((a, b) => a + b, 0);
const show = (key) => key.replace("\t", "  ·  ");

/* ------------------------------------------------------------------ *
 * Running Knip
 * ------------------------------------------------------------------ */

function runKnip() {
  let stdout;
  try {
    // Knip exits 1 when it finds issues — that is its normal reporting path,
    // NOT a failure of this script. Only unparseable output is a real failure.
    stdout = execFileSync("npx", ["--no-install", "knip", "--reporter", "json"], {
      cwd: FRONTEND_DIR,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    stdout = err?.stdout ?? "";
    if (stdout.trim() === "") {
      const stderr = (err?.stderr ?? "").toString().trim();
      throw new Error(
        `knip produced no stdout. Is frontend/node_modules installed?\n${stderr.slice(-2000)}`,
      );
    }
  }
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`knip stdout was not valid JSON:\n${stdout.slice(0, 2000)}`);
  }
}

/* ------------------------------------------------------------------ *
 * Self-test — the comparator must DISCRIMINATE, not merely run
 * ------------------------------------------------------------------ */

function selfTest() {
  const failures = [];
  const ran = [];
  const check = (name, cond, detail = "") => {
    ran.push(name);
    if (cond) {
      console.log(`  PASS  ${name}`);
    } else {
      console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
      failures.push(name);
    }
  };

  // ---- Case 0: anchored to a REAL captured Knip payload from this repo.
  // Synthetic fixtures only prove the probe works on shapes I invented; they
  // cannot prove it recognises the shape this repo's tooling actually emits.
  // (testing.md / MEH-1909: an ast probe passed four synthetic cases and
  // returned None for all 14 real files, because every fixture used a shape
  // the repo does not use.)
  if (!existsSync(FIXTURE_PATH)) {
    check("real-payload fixture exists", false, `missing ${FIXTURE_PATH}`);
  } else {
    const real = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
    const realCounts = aggregate(real);
    check(
      "real-payload/parses-non-empty",
      realCounts.size > 0,
      `parsed ${realCounts.size} keys from the captured run — a column of zeros here means the parser does not understand this repo's actual Knip output`,
    );
    check(
      "real-payload/keys-are-file-and-rule",
      [...realCounts.keys()].every((k) => k.split("\t").length === 2 && k.split("\t")[0] !== ""),
      "every key must be exactly file<TAB>rule",
    );
    check(
      "real-payload/self-identical-is-clean",
      compare(realCounts, realCounts).violations.length === 0,
      "a payload compared against itself must never violate",
    );
  }

  // ---- Case 1: an INCREASE must block. Positive control.
  const base = new Map([
    ["app/a.js\texports", 2],
    ["lib/b.js\tfiles", 1],
  ]);
  const up = new Map(base).set("app/a.js\texports", 3);
  check(
    "increase/blocks",
    compare(up, base).violations.length === 1,
    "an existing key rising by one must produce exactly one violation",
  );

  // ---- Case 2: a DECREASE must pass AND be reported as an improvement.
  const down = new Map(base).set("app/a.js\texports", 1);
  const downRes = compare(down, base);
  check("decrease/passes", downRes.violations.length === 0);
  check(
    "decrease/reported-as-improvement",
    downRes.improvements.length === 1 && downRes.improvements[0].cur === 1,
    "a decrease must be surfaced, not silently accepted",
  );

  // ---- Case 3: a NEW key blocks. This is the edge a baseline-only loop misses.
  // If compare() iterated baseline keys alone, a brand-new finding in a
  // brand-new file would score zero violations — the gate would be green for a
  // second reason (it never looked), indistinguishable from a real pass.
  const newKey = new Map(base).set("app/brand-new.js\texports", 1);
  check(
    "new-key/blocks",
    compare(newKey, base).violations.some((v) => v.key.startsWith("app/brand-new.js")),
    "a (file, rule) absent from the baseline must have an implicit baseline of 0",
  );

  // ---- Case 4: unchanged is clean.
  check("unchanged/clean", compare(new Map(base), base).violations.length === 0);

  // ---- Case 5: a removed key is an improvement, never a violation.
  const removed = new Map(base);
  removed.delete("lib/b.js\tfiles");
  const remRes = compare(removed, base);
  check(
    "removed-key/improvement-not-violation",
    remRes.violations.length === 0 && remRes.improvements.length === 1,
  );

  // ---- Case 6: empty rule arrays must NOT create keys. A zero-length bucket is
  // "nothing found", and recording it as a key would inflate the baseline with
  // entries that can only ever go up.
  check(
    "empty-arrays/ignored",
    aggregate({ issues: [{ file: "x.js", exports: [], files: [] }] }).size === 0,
  );

  // ---- Case 7: the baseline round-trips through serialise/parse unchanged.
  // A baseline that cannot survive a write/read cycle silently drifts.
  const round = parseBaseline(serialiseBaseline(base, total(base)));
  check(
    "baseline/round-trips",
    round.size === base.size && [...base].every(([k, v]) => round.get(k) === v),
  );

  // ---- Case 8: malformed input is loud, not silently empty. A parser that
  // returns {} on garbage reports "no findings" — a null that is also the
  // reassuring answer.
  let threw = false;
  try {
    aggregate({ nope: true });
  } catch {
    threw = true;
  }
  check("malformed-payload/throws", threw, "must not return an empty map on unrecognised input");

  let threwBaseline = false;
  try {
    parseBaseline("a\tb\tc\td\te");
  } catch {
    threwBaseline = true;
  }
  check("malformed-baseline/throws", threwBaseline);

  // The count is DERIVED, never a literal — a stated number goes stale the
  // moment a case is added, and then a passing run misreports its own coverage.
  console.log(`\n  ${ran.length} assertions ran, ${failures.length} failed.`);
  if (failures.length > 0) {
    console.error(`\nlint-ratchet --self-test FAILED: ${failures.join(", ")}`);
    return 1;
  }
  console.log("lint-ratchet --self-test OK.");
  return 0;
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

function main(argv) {
  const args = new Set(argv.slice(2));

  if (args.has("--self-test")) return selfTest();

  let payload;
  const jsonFlagIdx = argv.indexOf("--knip-json");
  if (jsonFlagIdx !== -1) {
    const p = argv[jsonFlagIdx + 1];
    if (!p) {
      console.error("--knip-json requires a path");
      return 2;
    }
    payload = JSON.parse(readFileSync(p, "utf8"));
  } else {
    payload = runKnip();
  }

  const current = aggregate(payload);
  const curTotal = total(current);

  if (args.has("--update-baseline")) {
    const prior = existsSync(BASELINE_PATH)
      ? parseBaseline(readFileSync(BASELINE_PATH, "utf8"))
      : new Map();
    const { violations } = compare(current, prior);
    if (violations.length > 0 && !args.has("--allow-increase")) {
      const firstFreeze = prior.size === 0;
      console.error(
        `REFUSING to update the baseline: ${violations.length} (file, rule) pair(s) would RISE.\n` +
          `A ratchet that can be loosened by rerunning the tool it gates is not a ratchet.\n` +
          (firstFreeze
            ? `\nNOTE: no baseline exists yet, so this is the INITIAL FREEZE and every pair rises\n` +
              `from an implicit 0. That is expected — rerun with --allow-increase.\n` +
              `The flag is still required here on purpose: exempting the no-baseline case would\n` +
              `make "delete the baseline file" a silent way to loosen the gate.\n`
            : ""),
      );
      for (const v of violations) console.error(`  ${show(v.key)}: ${v.base} -> ${v.cur}`);
      console.error(
        `\nEither fix them, or rerun with --allow-increase and justify each rise in the PR body.`,
      );
      return 1;
    }
    writeFileSync(BASELINE_PATH, serialiseBaseline(current, curTotal));
    console.log(
      `Baseline written: ${current.size} (file, rule) pair(s), ${curTotal} finding(s) total.`,
    );
    if (violations.length > 0) {
      console.log(`  (${violations.length} increase(s) accepted via --allow-increase)`);
    }
    return 0;
  }

  if (!existsSync(BASELINE_PATH)) {
    console.error(
      `No baseline at ${BASELINE_PATH}.\nCreate one: node scripts/checks/lint-ratchet.mjs --update-baseline`,
    );
    return 2;
  }

  const baseline = parseBaseline(readFileSync(BASELINE_PATH, "utf8"));
  const { violations, improvements } = compare(current, baseline);

  console.log(
    `Knip ratchet: ${curTotal} finding(s) across ${current.size} (file, rule) pair(s); ` +
      `baseline ${total(baseline)} across ${baseline.size}.`,
  );

  if (improvements.length > 0) {
    console.log(`\n  ${improvements.length} improvement(s) — baseline can be lowered:`);
    for (const i of improvements) console.log(`    ${show(i.key)}: ${i.base} -> ${i.cur}`);
    console.log(`  Run --update-baseline to bank them.`);
  }

  if (violations.length > 0) {
    console.error(`\n  ${violations.length} NEW finding(s) above baseline:`);
    for (const v of violations) console.error(`    ${show(v.key)}: ${v.base} -> ${v.cur}`);
    console.error(
      `\nlint-ratchet FAILED. These are new — everything already in the baseline is` +
        ` grandfathered, so this is not asking you to clean anything up.`,
    );
    return 1;
  }

  console.log("\nlint-ratchet OK — nothing above baseline.");
  return 0;
}

process.exit(main(process.argv));
