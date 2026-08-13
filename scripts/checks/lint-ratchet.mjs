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
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const FRONTEND_DIR = join(REPO_ROOT, "frontend");
const BASELINE_PATH = join(HERE, "lint-ratchet-baseline.tsv");
const FIXTURE_PATH = join(HERE, "testdata", "knip-sample.json");

/* ------------------------------------------------------------------ *
 * Aggregation
 * ------------------------------------------------------------------ */

/**
 * Rule buckets Knip is known to emit as arrays, observed in the captured
 * payload this baseline was frozen from.
 *
 * This list is NOT used to decide what to count — counting stays generic, so a
 * Knip upgrade that adds a rule category is still picked up. It is used only to
 * detect SHAPE DRIFT: if one of these known buckets ever stops being an array,
 * that is a silent-zeroing bug and must be loud. Without this, a bucket that
 * changed from `[...]` to `{count: 5, items: [...]}` would be skipped by the
 * `!Array.isArray` guard, its real findings counted as 0, and the difference
 * reported as an *improvement*.
 */
const KNOWN_RULE_BUCKETS = new Set([
  "binaries", "catalog", "catalogReferences", "dependencies", "devDependencies",
  "duplicates", "enumMembers", "exports", "files", "namespaceMembers",
  "optionalPeerDependencies", "types", "unlisted", "unresolved",
]);

/**
 * Knip's JSON is { issues: [ { file, exports: [...], files: [...], ... } ] }.
 *
 * Every array-valued property is a rule bucket. We count them GENERICALLY
 * rather than against a hardcoded rule list, so that a Knip upgrade adding a
 * new rule category cannot be silently dropped on the floor. A hardcoded list
 * would make new-rule findings invisible, which is the same defect class the
 * ratchet exists to close. (`KNOWN_RULE_BUCKETS` above is consulted only for
 * shape-drift detection, never to filter what gets counted.)
 *
 * @returns {Map<string, number>} key `${file}\t${rule}` -> count
 */
export function aggregate(knipJson) {
  if (!knipJson || typeof knipJson !== "object" || !Array.isArray(knipJson.issues)) {
    throw new Error("unrecognised Knip payload: expected an object with an `issues` array");
  }
  const counts = new Map();
  const drift = [];
  for (const entry of knipJson.issues) {
    const file = entry?.file;
    if (typeof file !== "string" || file === "") continue;
    for (const [rule, value] of Object.entries(entry)) {
      if (!Array.isArray(value)) {
        // A known bucket that is no longer an array means Knip's shape changed
        // under us. Skipping it silently would zero out real findings and
        // report them as improvements — fail instead.
        if (KNOWN_RULE_BUCKETS.has(rule)) {
          drift.push(`${file} · ${rule} is ${value === null ? "null" : typeof value}, expected an array`);
        }
        continue; // non-array, unknown key => scalar metadata, legitimately ignored
      }
      if (value.length === 0) continue;
      const key = `${file}\t${rule}`;
      counts.set(key, (counts.get(key) ?? 0) + value.length);
    }
  }
  if (drift.length > 0) {
    throw new Error(
      `Knip payload SHAPE DRIFT — ${drift.length} known rule bucket(s) are no longer arrays:\n  ` +
        drift.join("\n  ") +
        `\nRefusing to report counts: a bucket skipped as "not an array" is silently counted as 0,` +
        ` which surfaces as an improvement rather than a failure.`,
    );
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

const parseBaselineIfPresent = () =>
  existsSync(BASELINE_PATH) ? parseBaseline(readFileSync(BASELINE_PATH, "utf8")) : new Map();

/* ------------------------------------------------------------------ *
 * Running Knip
 * ------------------------------------------------------------------ */

function runKnip() {
  // Invoke the installed binary directly rather than through `npx`. npx's flag
  // semantics changed between npm 6 and 7+ (`--no-install` became `--no`), and
  // an unrecognised flag can be forwarded to the wrapped command. Resolving the
  // bin path ourselves removes the npm-version dependency entirely.
  const knipBin = join(FRONTEND_DIR, "node_modules", ".bin", "knip");
  if (!existsSync(knipBin)) {
    throw new Error(
      `knip binary not found at ${knipBin}. Run \`npm ci\` in frontend/ first.\n` +
        `(Not falling back to npx on purpose: a fallback that silently fetches a` +
        ` DIFFERENT knip version would change the counts this gate compares.)`,
    );
  }
  let stdout;
  try {
    // Knip exits 1 when it finds issues — that is its normal reporting path,
    // NOT a failure of this script. Only unparseable output is a real failure.
    stdout = execFileSync(knipBin, ["--reporter", "json"], {
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
  // NOTE: the fixture is a deliberately-trimmed subset — 5 of the freeze
  // capture's 24 entries, chosen to cover six distinct rule buckets between
  // them, kept small on purpose. It is a real capture, not the FULL one; every
  // value in it matches the corresponding baseline row (asserted below).
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
    // Pin actual NUMBERS, not just shape. `size > 0` and "keys look right" are
    // both true of a systematically miscounting aggregate() — e.g. one that
    // drops a whole rule bucket. These expectations were read off the freeze
    // capture and each matches the committed baseline row for the same key.
    const expected = [
      ["lib/places.js\texports", 1],
      ["lib/env.server.js\tfiles", 1],
      ["package.json\tdependencies", 1],
      ["package.json\tdevDependencies", 1],
      ["eslint.config.mjs\tunlisted", 1],
      ["lib/schemas.js\tduplicates", 1],
    ];
    const wrong = expected.filter(([k, v]) => realCounts.get(k) !== v);
    check(
      "real-payload/counts-match-known-values",
      wrong.length === 0,
      wrong.map(([k, v]) => `${k.replace("\t", " · ")}: expected ${v}, got ${realCounts.get(k)}`).join("; "),
    );
    // Every expectation above must also agree with the committed baseline —
    // otherwise the fixture and the baseline have drifted apart and one of them
    // is lying about the same freeze.
    const bl = parseBaselineIfPresent();
    check(
      "real-payload/agrees-with-baseline",
      bl.size === 0 || expected.every(([k, v]) => bl.get(k) === v),
      "fixture counts disagree with lint-ratchet-baseline.tsv for the same keys",
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

  // ---- Case 9: SHAPE DRIFT on a known rule bucket must throw, not zero out.
  // If Knip ever emits `exports` as an object, the old `!Array.isArray` guard
  // skipped it, counted the file's real findings as 0, and reported the
  // difference as an IMPROVEMENT — a regression wearing the costume of progress.
  let driftThrew = false;
  try {
    aggregate({ issues: [{ file: "lib/places.js", exports: { count: 5, items: [1, 2, 3, 4, 5] } }] });
  } catch {
    driftThrew = true;
  }
  check("shape-drift/throws", driftThrew, "a known bucket that stops being an array must fail loudly");

  // An UNKNOWN non-array key is scalar metadata and must NOT trip the drift
  // check — otherwise a benign Knip upgrade reds the gate. This is the other
  // half of case 9: the check has to discriminate, not just fire.
  check(
    "shape-drift/ignores-unknown-scalar",
    aggregate({ issues: [{ file: "a.js", someNewScalar: 7, exports: ["x"] }] }).get("a.js\texports") === 1,
  );

  // ---- Case 10: THE GATE'S OWN WIRING. Cases 1-9 test helpers in isolation;
  // none of them reaches main()'s `if (violations.length > 0) return 1`, which
  // is the single line that makes this a gate at all. A one-line regression
  // there would ship with the whole suite green.
  //
  // The payloads are reconstructed FROM the committed baseline, so this runs
  // against the real file the real gate reads — not a fixture of my invention.
  const liveBaseline = parseBaselineIfPresent();
  if (liveBaseline.size === 0) {
    check("gate-wiring/baseline-present", false, `no baseline at ${BASELINE_PATH}`);
  } else {
    const payloadFrom = (counts) => ({
      issues: [...counts.entries()].map(([key, n]) => {
        const [file, rule] = key.split("\t");
        return { file, [rule]: Array.from({ length: n }, (_, i) => ({ name: `stub${i}` })) };
      }),
    });
    const tmp = mkdtempSync(join(tmpdir(), "lint-ratchet-selftest-"));
    const cleanPath = join(tmp, "clean.json");
    const dirtyPath = join(tmp, "dirty.json");

    writeFileSync(cleanPath, JSON.stringify(payloadFrom(liveBaseline)));

    const bumped = new Map(liveBaseline);
    const firstKey = [...bumped.keys()].sort()[0];
    bumped.set(firstKey, bumped.get(firstKey) + 1);
    writeFileSync(dirtyPath, JSON.stringify(payloadFrom(bumped)));

    const argv = (p) => ["node", "lint-ratchet.mjs", "--knip-json", p];
    let cleanCode, dirtyCode;
    // Silence BOTH channels: the dirty run deliberately reports violations on
    // stderr, which would otherwise interleave "1 NEW finding(s) above
    // baseline" into a *passing* self-test's output and read as a real failure.
    const quietLog = console.log;
    const quietErr = console.error;
    console.log = () => {};
    console.error = () => {};
    try {
      cleanCode = main(argv(cleanPath));
      dirtyCode = main(argv(dirtyPath));
    } finally {
      console.log = quietLog;
      console.error = quietErr;
      rmSync(tmp, { recursive: true, force: true });
    }

    check(
      "gate-wiring/clean-payload-exits-0",
      cleanCode === 0,
      `main() returned ${cleanCode} on a payload equal to the baseline`,
    );
    check(
      "gate-wiring/violation-exits-1",
      dirtyCode === 1,
      `main() returned ${dirtyCode} on a payload one above baseline at "${firstKey?.replace("\t", " · ")}" — ` +
        `this is the assertion that catches a regression in the exit-code decision itself`,
    );
  }

  // ---- Case 11: an empty issues array must NOT pass as a clean sweep.
  // Against a non-empty baseline it renders as all-improvements and exits 0,
  // and the output then invites --update-baseline, which would collapse the
  // baseline entirely. "Nothing found" and "nothing scanned" are the same output.
  if (liveBaseline.size > 0) {
    const tmp2 = mkdtempSync(join(tmpdir(), "lint-ratchet-empty-"));
    const emptyPath = join(tmp2, "empty.json");
    writeFileSync(emptyPath, JSON.stringify({ issues: [] }));
    const quietErr = console.error;
    const quietLog = console.log;
    console.error = () => {};
    console.log = () => {};
    let emptyCode, allowedCode;
    try {
      emptyCode = main(["node", "x", "--knip-json", emptyPath]);
      allowedCode = main(["node", "x", "--knip-json", emptyPath, "--allow-empty"]);
    } finally {
      console.error = quietErr;
      console.log = quietLog;
      rmSync(tmp2, { recursive: true, force: true });
    }
    check("empty-payload/refused", emptyCode === 2, `expected exit 2, got ${emptyCode}`);
    check(
      "empty-payload/escape-hatch-works",
      allowedCode !== 2,
      "--allow-empty must let a genuinely-clean run through",
    );
  }

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

  // A zero-finding payload is indistinguishable from "Knip did not actually
  // scan anything" — a broken knip.json, an entry glob resolving to nothing, a
  // half-installed node_modules. Against a non-empty baseline it renders as a
  // clean sweep of "improvements" and the gate passes; worse, the output then
  // invites --update-baseline, which would collapse the baseline to empty and
  // silently retire the ratchet. Treat it as suspicious, with an explicit
  // escape hatch rather than a silent default (same shape as --allow-increase).
  if (payload.issues.length === 0 && !args.has("--allow-empty")) {
    console.error(
      `Knip reported ZERO issues. Refusing to treat that as a result.\n\n` +
        `"Nothing found" and "nothing was scanned" produce identical output here, and the\n` +
        `second is far more likely: a broken knip.json, an entry glob matching no files, or\n` +
        `an incomplete npm ci. Against the current baseline (${total(parseBaselineIfPresent())} finding(s)) this would\n` +
        `otherwise report a clean sweep of improvements and pass.\n\n` +
        `If the codebase genuinely has zero Knip findings, rerun with --allow-empty.`,
    );
    return 2;
  }

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

// Guarded so the module can be imported (its helpers are exported) without the
// CLI running as an import side effect — an unguarded `process.exit` here would
// abort any process that merely imported this file to unit-test `compare()`.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    process.exit(main(process.argv));
  } catch (err) {
    // These functions throw deliberately-readable messages ("knip binary not
    // found…", "SHAPE DRIFT…"). Without this catch they surface as a Node
    // stack trace, which buries the one line that tells you what to do.
    console.error(`lint-ratchet: ${err?.message ?? err}`);
    process.exit(2);
  }
}
