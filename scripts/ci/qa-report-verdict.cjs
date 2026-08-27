/**
 * Module:   qa-report-verdict
 * Purpose:  Decide the Playwright QA bot's headline from the run's COUNTS, so
 *           it can say PASS / FAIL / DID-NOT-RUN instead of collapsing the
 *           third state into the second.
 * Touches:  nothing — pure. No fs, no network, no process state.
 * Does NOT: read the JSON report, post the comment, or decide which runs get
 *           cancelled. The counts arrive as strings from the workflow's own
 *           step outputs; the concurrency policy is untouched.
 * Related:  .github/workflows/e2e.yml (the caller, once the staged patch in
 *           docs/ci/meh-2196-qa-three-state.patch.md is applied),
 *           scripts/e2e-gate-selftest.sh (same shape: prove the discrimination
 *           in a committed script before the workflow edit is applied).
 * History:  MEH-2196 (creation, 2026-08-27).
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT THIS REPLACES
 * ---------------------------------------------------------------------------
 * The shipped reporter is two ternaries:
 *
 *     const executed     = "${{ steps.coverage-floor.outputs.executed }}" || "unknown";
 *     const passed       = outcome === "success";
 *     const zeroCoverage = executed === "0";
 *
 * `zeroCoverage` is an EXACT string compare against "0". When the coverage-floor
 * step never runs, its output is the empty string, `executed` becomes the word
 * "unknown", and `"unknown" === "0"` is false — so the run falls through to the
 * `passed` ternary, which is also false, and the bot asserts
 * **"At least one spec failed"** about a run in which no spec was ever loaded.
 *
 * That is not hypothetical. PR #3123, attempt 2, 2026-08-26: a push
 * concurrency-cancelled the run at 19:56:38 while `actions/checkout` was still
 * going. `Run E2E tests` therefore reported `skipped`, and `E2E coverage floor`
 * — whose own `if:` excludes `skipped` — never ran either. The bot commented
 * "Playwright QA — FAIL … At least one spec failed" with, one line above it,
 * its own count reading "unknown tests executed".
 *
 * Note WHERE the hole is. The comment step already guards
 * `steps.e2e-run.outcome != 'cancelled'` — but the cancellation landed on the
 * JOB, so the step that got cancelled was `checkout`, and `Run E2E tests` came
 * out `skipped`, which that guard does not name. Widening the guard would only
 * buy silence on one more token; it would not fix a reporter that treats
 * "I have no counts" as "the counts say something failed".
 *
 * ---------------------------------------------------------------------------
 * THE RULE
 * ---------------------------------------------------------------------------
 * The COUNTS decide, not the exit code. In order:
 *
 *   executed is unknown / unparseable / 0   ->  DID_NOT_RUN   (never PASS, never FAIL)
 *   executed >= 1 and (unexpected + flaky) >= 1  ->  FAIL
 *   executed >= 1 and no failing spec       ->  PASS
 *
 * `flaky` counts as a failure because the suite runs with
 * `--fail-on-flaky-tests`, which is the whole point of that flag.
 *
 * The one case where counts and exit code can disagree is a step that failed
 * AFTER every spec passed — a teardown error, or the 142 MB artifact upload
 * that got cut off on this same PR. The AC forbids asserting a spec failure
 * without one, so the headline follows the counts and the body says, in as many
 * words, that the two disagree. An honest PASS with a stated caveat beats a
 * FAIL nobody can act on.
 */

"use strict";

const VERDICTS = { PASS: "PASS", FAIL: "FAIL", DID_NOT_RUN: "DID_NOT_RUN" };

/**
 * Parse a workflow step output into a count.
 * Returns null — NOT 0 — for "" / undefined / non-numeric. The distinction is
 * the entire bug: 0 means "the probe ran and saw nothing", null means "there is
 * no probe result", and collapsing them is how a silence became an accusation.
 */
function toCount(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (text === "") return null;
  if (!/^\d+$/.test(text)) return null;
  return Number(text);
}

/**
 * @param {{outcome?: string, executed?: string, unexpected?: string,
 *          flaky?: string, skipped?: string}} raw  step outputs, as strings
 */
function verdict(raw = {}) {
  const outcome = String(raw.outcome ?? "").trim() || "unknown";
  const executed = toCount(raw.executed);
  const unexpected = toCount(raw.unexpected);
  const flaky = toCount(raw.flaky);
  const skipped = toCount(raw.skipped);

  const counts = {
    executed,
    unexpected,
    flaky,
    skipped,
    // for display: null renders as the word "unknown", never as 0
    text: [
      `executed=${executed === null ? "unknown" : executed}`,
      `unexpected=${unexpected === null ? "unknown" : unexpected}`,
      `flaky=${flaky === null ? "unknown" : flaky}`,
      `skipped=${skipped === null ? "unknown" : skipped}`,
    ].join(" · "),
  };

  if (executed === null || executed === 0) {
    return {
      verdict: VERDICTS.DID_NOT_RUN,
      headline: "Playwright QA — DID NOT RUN",
      counts,
      outcome,
      detail:
        executed === 0
          ? "**Zero coverage.** The suite loaded but executed no spec — `global-setup` aborted before any test ran. This is not a test failure; there is no E2E signal on this commit at all."
          : `**Nothing ran, and there are no counts to report.** \`Run E2E tests\` came out \`${outcome}\`, so the coverage-floor step produced no numbers. Usually a concurrency-cancel from a newer push, or the job dying in setup. **This is NOT a spec failure** — do not read it as one, and wait for the newer run rather than re-running this one.`,
    };
  }

  // PARTIAL APPLICATION of the staged patch. Step 2 (require this module)
  // without Step 1 (export `unexpected` / `flaky`) leaves both counts empty
  // while `executed` — which the workflow ALREADY exports today — arrives
  // fine. `failing` would then be 0 + 0, and a run with 26 real failures
  // would be headlined PASS over the words "All 300 executed specs green".
  //
  // That is a FALSE CLAIM, and it is the same defect class this module was
  // written to remove — pointed the other way. It is also the likelier half
  // to be missed: the two `>> "$GITHUB_OUTPUT"` lines are the small, easy
  // step to skip, and nothing enforces applying both together.
  //
  // So: counts we cannot read are never counts of zero. Refuse a verdict.
  //
  // `||`, not `&&`, and the operator is the whole point. `&&` would refuse only
  // when BOTH counts are missing, so an asymmetric export (`unexpected=0`,
  // `flaky=null`) would slip through as PASS while the flaky count is unknown —
  // under `--fail-on-flaky-tests` that is a failing run reported green. Today
  // Step 1 exports both in one sequential block, so the asymmetric state is
  // unreachable; `||` means it stays unreachable even if that block is ever
  // split, instead of resting on an assumption nobody re-checks.
  //
  // testing.md's "watch the shape of the pass condition" says to prefer `&&`
  // over `||`. That rule is about a PASS condition, where `||` lets either cue
  // carry the assertion. This is a REFUSAL condition, so the polarity inverts:
  // here `||` is the strict form (refuse if EITHER count is unreadable) and
  // `&&` is the lax one. Same principle, opposite operator.
  if (unexpected === null || flaky === null) {
    return {
      verdict: VERDICTS.DID_NOT_RUN,
      headline: "Playwright QA — NO VERDICT (counts incomplete)",
      counts,
      outcome,
      detail: `**${executed} specs executed, but a failure count is missing**, so there is no honest verdict to give. This is a configuration fault, not a test result: \`unexpected\` and \`flaky\` are not reaching the reporter, which means **Step 1 of \`docs/ci/meh-2196-qa-three-state.patch.md\` was not applied** (the two \`>> "$GITHUB_OUTPUT"\` lines beside the existing \`executed\` / \`skipped\` exports). Apply it, then re-run. **Do not read this as PASS** — the specs ran and nobody here knows how they went.`,
    };
  }

  const failing = (unexpected ?? 0) + (flaky ?? 0);
  if (failing >= 1) {
    return {
      verdict: VERDICTS.FAIL,
      headline: "Playwright QA — FAIL",
      counts,
      outcome,
      detail: `**${failing} failing spec result(s)** out of ${executed} executed (\`--fail-on-flaky-tests\` counts flaky as failing). The playwright-report artifact on the run has traces and screenshots.`,
    };
  }

  const disagreement =
    outcome === "success"
      ? ""
      : `\n\n> ⚠️ **The counts and the exit code disagree.** Every executed spec passed, but \`Run E2E tests\` reported \`${outcome}\` — so something failed *after* the specs did, e.g. a teardown or an artifact upload. The headline follows the counts, because asserting a spec failure with zero failing specs is the bug this reporter was rewritten to remove.`;

  return {
    verdict: VERDICTS.PASS,
    headline: "Playwright QA — PASS",
    counts,
    outcome,
    detail: `All ${executed} executed specs green (flake gate \`--fail-on-flaky-tests\` included).${disagreement}`,
  };
}

/* -------------------------------------------------------------------------
 * The reporter EXACTLY as it ships today, frozen, for the discrimination run.
 * Not the thing under test — a regression witness. Without it, "the new logic
 * says DID-NOT-RUN" is a claim about one implementation with nothing to
 * compare against, and the self-test could not show that the change changes
 * anything (.claude/rules/testing.md — the construction has to discriminate).
 * ---------------------------------------------------------------------------*/
function shippedVerdictToday(raw = {}) {
  const outcome = raw.outcome;
  const executed = `${raw.executed ?? ""}` || "unknown";
  const passed = outcome === "success";
  const zeroCoverage = executed === "0";
  const headline = zeroCoverage
    ? "Playwright QA — ZERO COVERAGE"
    : `Playwright QA — ${passed ? "PASS" : "FAIL"}`;
  const detail = zeroCoverage
    ? "**Nothing ran.**"
    : passed
      ? "All E2E specs green (flake gate --fail-on-flaky-tests included)."
      : "At least one spec failed — the playwright-report artifact on the run has traces and screenshots.";
  return { headline, detail, executedText: `${executed} tests executed` };
}

module.exports = { verdict, toCount, VERDICTS, shippedVerdictToday };

/* ---------------------------------- CLI ---------------------------------- */
if (require.main === module) {
  const args = process.argv.slice(2);
  if (!args.includes("--self-test")) {
    // dry-run one payload from the command line:
    //   node scripts/ci/qa-report-verdict.cjs --outcome skipped --executed ""
    const raw = {};
    for (let i = 0; i < args.length; i += 2) {
      if (args[i].startsWith("--")) raw[args[i].slice(2)] = args[i + 1] ?? "";
    }
    const out = verdict(raw);
    console.log(`${out.headline}\n${out.counts.text}\n${out.detail}`);
    process.exit(0);
  }

  // ---- self-test -----------------------------------------------------------
  // Cases 1 and 2 are the two the card demands, and they are REAL payloads read
  // off PR #3123, not invented shapes. The rest are the boundaries.
  const CASES = [
    {
      name: "(a) the 26/08 cancelled run — PR #3123 attempt 2, checkout cancelled 19:56:38",
      raw: { outcome: "skipped", executed: "", unexpected: "", flaky: "", skipped: "" },
      want: VERDICTS.DID_NOT_RUN,
      // what the shipped reporter actually posted on that run
      shippedWas: "Playwright QA — FAIL",
    },
    {
      name: "(b) a genuine failing run — PR #3123, run 33007824149 on 7c1ab99",
      raw: { outcome: "failure", executed: "300", unexpected: "28", flaky: "3", skipped: "54" },
      want: VERDICTS.FAIL,
      shippedWas: "Playwright QA — FAIL",
    },
    {
      name: "job cancelled outright, no counts",
      raw: { outcome: "cancelled", executed: "" },
      want: VERDICTS.DID_NOT_RUN,
      shippedWas: "Playwright QA — FAIL",
    },
    {
      name: "zero coverage — global-setup aborted, suite loaded nothing",
      raw: { outcome: "failure", executed: "0", unexpected: "0", flaky: "0", skipped: "0" },
      want: VERDICTS.DID_NOT_RUN,
      shippedWas: "Playwright QA — ZERO COVERAGE",
    },
    {
      name: "a clean green run",
      raw: { outcome: "success", executed: "300", unexpected: "0", flaky: "0", skipped: "54" },
      want: VERDICTS.PASS,
      shippedWas: "Playwright QA — PASS",
    },
    {
      name: "flake-only — 0 unexpected, 2 flaky, under --fail-on-flaky-tests",
      raw: { outcome: "failure", executed: "300", unexpected: "0", flaky: "2", skipped: "0" },
      want: VERDICTS.FAIL,
      shippedWas: "Playwright QA — FAIL",
    },
    {
      name: "specs all passed, the step failed afterwards (the 142 MB upload cut off)",
      raw: { outcome: "failure", executed: "300", unexpected: "0", flaky: "0", skipped: "54" },
      want: VERDICTS.PASS,
      shippedWas: "Playwright QA — FAIL",
    },
    {
      // The reviewer's finding on #3133: ONE count missing, not both. Under
      // `&&` this returned PASS with flaky unknown.
      name: "asymmetric export — unexpected arrives, flaky does not",
      raw: { outcome: "failure", executed: "300", unexpected: "0", flaky: "", skipped: "54" },
      want: VERDICTS.DID_NOT_RUN,
      shippedWas: "Playwright QA — FAIL",
    },
    {
      // The reviewer's finding on #3132, kept as a case so it cannot come back.
      name: "patch applied HALFWAY — executed exported, failure counts not",
      raw: { outcome: "failure", executed: "300", unexpected: "", flaky: "", skipped: "54" },
      want: VERDICTS.DID_NOT_RUN,
      shippedWas: "Playwright QA — FAIL",
    },
    {
      name: "a garbage count is unknown, not zero",
      raw: { outcome: "failure", executed: "n/a" },
      want: VERDICTS.DID_NOT_RUN,
      shippedWas: "Playwright QA — FAIL",
    },
  ];

  const failures = [];
  let changed = 0;
  for (const c of CASES) {
    const got = verdict(c.raw);
    const old = shippedVerdictToday(c.raw);
    const ok = got.verdict === c.want;
    if (!ok) failures.push(`${c.name}: want ${c.want}, got ${got.verdict}`);
    // `shippedWas` is ASSERTED, not displayed. Left unread it is a field that
    // looks like an assertion target and verifies nothing — the "artifact that
    // asserts coverage" smell this repo keeps paying for, in the one file whose
    // whole subject is a reporter that claimed more than it knew.
    if (old.headline !== c.shippedWas) {
      failures.push(`${c.name}: frozen witness drifted — expected the shipped reporter to say ${JSON.stringify(c.shippedWas)}, it said ${JSON.stringify(old.headline)}`);
    }
    const moved = old.headline !== got.headline;
    if (moved) changed += 1;
    console.log(`${ok ? "  ok  " : " FAIL "} ${c.name}`);
    console.log(`         input      ${JSON.stringify(c.raw)}`);
    console.log(`         shipped -> ${old.headline}  ("${old.executedText}")`);
    console.log(`         new     -> ${got.headline}  (${got.counts.text})${moved ? "   <-- CHANGED" : ""}`);
  }

  // Derived, never stated: a literal would go stale the moment a case is added.
  console.log(`\n${CASES.length} cases ran · ${failures.length} failed · ${changed} verdicts changed vs the shipped reporter`);

  // The discrimination guard. A rewrite that agreed with the shipped reporter
  // on every case would pass every assertion above and fix nothing — the exact
  // "green with two possible causes" this repo keeps paying for.
  if (changed === 0) {
    console.error("\nCONTROL FAILED: not one verdict differs from the shipped reporter. Either the payloads do not reach the defect or the rewrite is a no-op; nothing above is evidence of a fix.");
    process.exit(1);
  }
  if (failures.length) {
    failures.forEach((f) => console.error("  FAIL " + f));
    process.exit(1);
  }
  console.log("qa-report-verdict self-test: PASS");
}
