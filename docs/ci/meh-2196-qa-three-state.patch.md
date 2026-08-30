# QA bot three-state reporting — YAML patch for `e2e.yml` (MEH-2196)

> **The blocks here are for Sapir to apply by hand.** `.github/workflows/**` is
> CC-deny (`.claude/settings.json`, MEH-671) — CC writes the diff into this `.md`
> and does not touch the workflow. **Nothing here has been applied.**
>
> The logic itself is **already merged as a normal script**,
> [`scripts/ci/qa-report-verdict.cjs`](../../scripts/ci/qa-report-verdict.cjs),
> with a self-test that proves the discrimination. This patch only makes the
> workflow *call* it. That split is deliberate and follows
> `scripts/e2e-gate-selftest.sh`: the part that can be proven lands where CC can
> land it, and the RED edit shrinks to two `require` lines.

---

## The defect, in one line of the shipped code

`.github/workflows/e2e.yml:288-292`:

```js
const executed     = "${{ steps.coverage-floor.outputs.executed }}" || "unknown";
const passed       = outcome === "success";
const zeroCoverage = executed === "0";
```

`zeroCoverage` is an **exact string compare against `"0"`**. When the
coverage-floor step never runs, its output is `""`, `executed` becomes the word
`"unknown"`, and `"unknown" === "0"` is false. The run then falls through to
`passed`, which is also false, and the bot asserts **"At least one spec failed"**
about a run in which no spec was ever loaded.

**Measured, PR #3123 attempt 2, 2026-08-26.** A push concurrency-cancelled the
run at `19:56:38` while `actions/checkout` was still going. The bot commented
*"Playwright QA — FAIL … At least one spec failed"* with, one line above it, its
own count reading **"unknown tests executed"**.

### Why widening the existing guard is not the fix

The comment step already carries `steps.e2e-run.outcome != 'cancelled'`
(`e2e.yml:283-285`). It did not help, and the reason is worth stating exactly:
**the cancellation landed on the JOB**, so the step that was cancelled was
`checkout` and `Run E2E tests` came out **`skipped`** — a token that guard does
not name. `E2E coverage floor` (`e2e.yml:242-246`) excludes `skipped` too, which
is why there were no counts at all.

Adding `&& steps.e2e-run.outcome != 'skipped'` would buy **silence on one more
token**. It would leave a reporter that treats *"I have no counts"* as *"the
counts say something failed"*, and the next state that produces an empty output
would print the accusation again. The fix has to be in how the verdict is
computed, not in which runs are suppressed.

---

## Step 1 — export the failure counts the reporter needs

The coverage-floor step already computes `STATS_UNEXPECTED` and `STATS_FLAKY`
(`e2e.yml:257-258`) and throws them away. **Add two lines** beside the two
existing `>> "$GITHUB_OUTPUT"` writes at `e2e.yml:261-262`:

```yaml
          echo "executed=$EXECUTED" >> "$GITHUB_OUTPUT"
          echo "skipped=$STATS_SKIPPED" >> "$GITHUB_OUTPUT"
          # MEH-2196: the reporter decides from the COUNTS, not the exit code,
          # so it needs the failing ones too. Already computed four lines up.
          echo "unexpected=$STATS_UNEXPECTED" >> "$GITHUB_OUTPUT"
          echo "flaky=$STATS_FLAKY" >> "$GITHUB_OUTPUT"
```

Nothing else in that step changes. **Leave its `if:` exactly as it is** — a
coverage-floor that refuses to run on a cancelled/skipped step is correct; the
reporter's job is to say so honestly rather than to guess.

> ### ⚠️ Step 1 is the easy one to skip, and skipping it used to be worse than not applying the patch at all
>
> `executed` is **already exported today**, so applying Step 2 without Step 1
> left it arriving fine while `unexpected` and `flaky` came through empty —
> summing to zero. A run with 26 real failures was then headlined **PASS**, over
> the words *"All 300 executed specs green."* A false claim about a red suite:
> the same defect class this patch removes, pointed the other way.
>
> **That is now caught.** Counts that cannot be read are never counts of zero,
> so the module refuses a verdict and names the missing step:
>
> ```
> Playwright QA — NO VERDICT (counts incomplete)
> executed=300 · unexpected=unknown · flaky=unknown · skipped=54
> **300 specs executed, but the failure counts are missing** … Step 1 … was not
> applied … **Do not read this as PASS.**
> ```
>
> The verdict bucket stays `DID_NOT_RUN` — no fourth state — but the headline
> does not claim nothing ran, because 300 specs did. `--self-test` pins it as
> its own case, so it cannot regress.
>
> **The guard is `||`, not `&&`, deliberately.** `&&` would refuse only when
> *both* counts are missing, so an asymmetric export (`unexpected=0`,
> `flaky=null`) would come out `PASS` with the flaky count unknown — under
> `--fail-on-flaky-tests` that is a failing run reported green. Step 1 exports
> both in one sequential block, so that state is unreachable today; `||` keeps
> it unreachable if the block is ever split, rather than resting on an
> assumption nobody re-checks. Its own self-test case pins it.
>
> _Found by the CI reviewer across two rounds, each confirmed by running the
> payload before fixing it rather than taken on faith: **#3132** for the
> both-counts-missing case, **#3133** for the asymmetric one that motivated
> `||` over `&&`._

## Step 2 — replace the two ternaries with the committed module

Replace `e2e.yml:286-306` — from `const marker = …` down to and including the
`].join("\n");` line — with:

```js
            const marker = "<!-- e2e-qa-report -->";
            // MEH-2196: PASS / FAIL / DID-NOT-RUN, decided from the counts.
            // The logic and its self-test live in the repo so they can be run
            // and proven without applying a workflow edit:
            //   node scripts/ci/qa-report-verdict.cjs --self-test
            const raw = {
              outcome:    "${{ steps.e2e-run.outcome }}",
              executed:   "${{ steps.coverage-floor.outputs.executed }}",
              unexpected: "${{ steps.coverage-floor.outputs.unexpected }}",
              flaky:      "${{ steps.coverage-floor.outputs.flaky }}",
              skipped:    "${{ steps.coverage-floor.outputs.skipped }}",
            };
            let report;
            try {
              report = require("./scripts/ci/qa-report-verdict.cjs").verdict(raw);
            } catch (err) {
              // The module is unreachable only when `actions/checkout` did not
              // complete — which IS the did-not-run condition, so fall back to
              // it rather than to an accusation. This step runs under
              // `always()`, so it fires on a job cancelled mid-checkout: the
              // exact 26/08 case. Never let a missing file become "a spec
              // failed".
              report = {
                headline: "Playwright QA — DID NOT RUN",
                outcome: raw.outcome || "unknown",
                counts: { text: "executed=unknown · unexpected=unknown · flaky=unknown · skipped=unknown" },
                detail: `**Nothing ran, and the reporter itself could not load** (\`${err.message}\`) — the checkout did not complete. **This is NOT a spec failure.**`,
              };
            }
            const runUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
            const body = [
              marker,
              `## ${report.headline}`,
              "",
              `${report.counts.text} · step outcome \`${report.outcome}\` · ([run](${runUrl})), commit ${context.payload.pull_request.head.sha.slice(0, 7)}.`,
              "",
              report.detail,
            ].join("\n");
```

Everything below that — the `listComments` / `updateComment` / `createComment`
upsert — is unchanged.

`actions/github-script` resolves `require` from the workspace root — the
`const script = require('./path/to/script.js')` form is the pattern in its own
README — so `./scripts/ci/qa-report-verdict.cjs` works as written and needs no
extra step. The file is `.cjs` on purpose: `github-script`'s `require` is
CommonJS.

> **This is the one line in the patch that CC could not execute to verify**, and
> it is stated as an expectation rather than a measurement. If the relative form
> does not resolve on the runner, the absolute one does:
> `require(`${process.env.GITHUB_WORKSPACE}/scripts/ci/qa-report-verdict.cjs`)`.
> Either way the `try/catch` above means a resolution failure degrades to
> DID-NOT-RUN, never to a false spec-failure claim — so the worst case of
> guessing wrong here is a less informative comment, not a wrong one.

**Counts are always printed**, in every state, including the DID-NOT-RUN one
where they read `unknown` — which is the fact the old comment buried in a
subclause while its headline said the opposite.

---

## What changes on the surfaces that exist today

Run `node scripts/ci/qa-report-verdict.cjs --self-test` for the live table. As of
2026-08-27 it is 10 cases, 0 failed, **7 verdicts changed**:

| payload | shipped today | after this patch |
|---|---|---|
| **the 26/08 cancelled run** (`outcome=skipped`, no counts) | `FAIL` — "At least one spec failed" | **`DID NOT RUN`** |
| job cancelled outright, no counts | `FAIL` | **`DID NOT RUN`** |
| a garbage/unparseable count | `FAIL` | **`DID NOT RUN`** |
| `executed=0` (global-setup aborted) | `ZERO COVERAGE` | **`DID NOT RUN`**, with the zero-coverage wording kept in the body |
| specs all passed, the step failed afterwards (the 142 MB upload cut off on #3123) | `FAIL` | **`PASS`**, with an explicit "counts and exit code disagree" note |
| **Step 2 applied without Step 1** (counts missing) | `FAIL` | **`NO VERDICT (counts incomplete)`**, naming the unapplied step |
| **asymmetric export** — `unexpected` arrives, `flaky` does not | `FAIL` | **`NO VERDICT (counts incomplete)`** |
| a genuine failing run (300 executed / 28 unexpected / 3 flaky) | `FAIL` | `FAIL` — **unchanged**, which is the half that matters |
| flake-only under `--fail-on-flaky-tests` | `FAIL` | `FAIL` — unchanged |
| a clean green run | `PASS` | `PASS` — unchanged |

`ZERO COVERAGE` is folded into `DID-NOT-RUN` rather than kept as a fourth
headline: both mean "there is no E2E signal on this commit", the AC asks for
three states, and the *distinction* survives where it is useful — in the body,
which says whether the suite loaded and executed nothing or never produced
counts at all.

## The self-test carries its own control

A rewrite that agreed with the shipped reporter on every case would satisfy every
assertion in the file and fix nothing. So the self-test **also asserts that at
least one verdict differs**, and fails loudly if none does:

```
CONTROL FAILED: not one verdict differs from the shipped reporter. Either the
payloads do not reach the defect or the rewrite is a no-op; nothing above is
evidence of a fix.
```

Demonstrated rather than asserted: with `verdict()` sabotaged to delegate to the
frozen shipped implementation, the self-test exits **1** and prints that line;
unsabotaged it exits **0**. The frozen copy of today's reporter lives in the same
file as `shippedVerdictToday()` for exactly this purpose — a regression witness,
not the thing under test.

## Out of scope, deliberately

- **The concurrency policy is untouched.** Which runs get cancelled is not this
  card's business; only what the bot says about them.
- **The `cancelled` guard on the comment step stays.** With three-state
  reporting it would now be *safe* to drop, so a superseded run said
  `DID NOT RUN` instead of staying silent — but that is a behaviour change
  beyond the AC, and the comment is an upsert the fresh run overwrites anyway.
  Recorded as an option, not applied.
- **`e2e-gate`'s own `cancelled → FAIL` mapping** is a different reporter, one
  level up, and is not touched here.
