# MEH-2895 — E2E in two parallel shards, one merged report

> **Not applied.** `.github/workflows/**` is denied to CC's filesystem tools,
> and the sandbox proxy refuses the Contents API (`.claude/rules/security.md`).
> Sapir pastes the diff below through the GitHub web editor. CC then checks
> the branch file byte-for-byte against this diff before merging.
>
> **Lands first, in the same PR as this file (no workflow change):**
> - `frontend/e2e/login-retry.ts` + `global-setup.ts`: a 429 on login is waited
>   out and retried.
> - The blob reporter in `playwright.config.ts`, switched on by `--shard` on
>   the command line. There is no env var. It does nothing until the workflow
>   runs with `--shard`.

## ⚠️ Decide before pasting: this trades MEH-2398's rule for wall time

`docs/TESTING.md` («One E2E run at a time», MEH-2398) exists because parallel
E2E runs filled the staging backend's connection pool and ended with 0 tests
executed.

- **Today:** at most **two** suites hit staging at once: Chromium
  (`e2e-staging-backend`) and the WebKit shadow (`e2e-staging-backend-webkit`).
- **After this patch:** at most **three**: shard 1, shard 2 and WebKit, each
  with `workers: 2`.

Since MEH-2398, the backend releases its DB connection before background tasks
(#4272, MEH-2886). Whether that headroom covers a third suite has **not been
measured**.

If the first sharded runs show pool exhaustion (0 executed, or
`db_pool_exhausted` in Sentry), there are two fallbacks:
- (א) put the WebKit shadow in shard 2's group (`e2e-staging-backend-2`), so
  three suites become two;
- (ב) instead of sharding, raise `timeout-minutes` to 45 and keep one queue.

**Superseded by this patch:** `docs/ci/e2e-one-backend-queue.patch.md` (MEH-2886
chunk 5, not applied). It still applies cleanly on top of the sharded file. But
it would put WebKit alone in `e2e-staging-backend`, a group no job uses any more:
a no-op that looks like serialization. **Do not paste it after this one.**

**In the PR that verifies the paste,** CC also updates `docs/TESTING.md`
(the MEH-2398 paragraph) to name the three groups.

## Why: measured 10/11/2026

- **The 30-minute cap.** The single `Playwright E2E (Vercel preview)` job has
  `timeout-minutes: 30`. The staging runs on 10/11 were cut there: about 1,419
  of 1,668 tests ran.
- **How the suite splits.** `npx playwright test --list --shard=1/2` gives 834
  tests, against 1,668 in the full list. The split falls **by project**: shard 1
  is the 834 `[desktop]` tests, shard 2 the 834 `[mobile]` tests.
- **What that means for logins and tokens.**
  - Specs that log in by themselves (flows/19, 22, 40) and the mutating specs
    skip on mobile, so they all land in shard 1.
  - Per-IP login exposure is therefore that of today's desktop half.
  - Mobile no longer starts after desktop, which also shortens the token
    lifetime it needs (MEH-2269).
  - The shards run on separate runners. Whether those share an outbound IP is
    not measured.
  - The login retry covers both cases: it waits out a full limiter window
    (20 s × 3) instead of failing the run with 0 tests.

## What changes

1. **`e2e`** becomes a matrix of `shard: [1, 2]`, with `fail-fast: false`.
   - **Name:** `Playwright E2E (Vercel preview) 1/2` and `… 2/2`. This job is
     not in the ruleset (`e2e-gate` is the aggregator), so the rename blocks
     nothing.
   - **Run:** `--shard=N/2`, which also switches on the blob reporter.
   - **Queue:** the job-level queue becomes `e2e-staging-backend-<N>` (see the
     warning above).
   - **Artifacts** get a `-<N>` suffix. Two jobs uploading one name fail with a
     conflict. The blob upload sets `overwrite: true` for re-runs.
   - **The per-shard coverage floor stays.** A shard that executed 0 tests fails
     on its own.
   - **The QA comment step moves out** to `e2e-report`.
2. **New `e2e-report`** (`needs: e2e`, runs unless skipped or cancelled):
   - downloads each shard's blob into its own directory;
   - counts **each shard separately**;
   - names any shard that left **no report** or ran **0 tests**. A shard whose
     global-setup aborted still writes a blob, so counting zips is not enough.
     Such a run gets `partial` set, the job fails, and the comment's headline
     becomes **INCOMPLETE**: never PASS, and never "wait for a newer run";
   - merges the blobs that exist, then posts the comment.

   The comment step runs on `!cancelled()`, so a failed checkout or `npm ci`
   still replaces the previous head's comment with DID NOT RUN.
3. **`e2e-gate` is unchanged.** `needs.e2e.result` is GitHub's aggregate over
   the matrix: any red shard → `failure`.

## Verification (CC, 10/11)

- `git apply --check` of the diff below against `origin/staging`: clean.
- The YAML parses. Jobs: `filter, e2e, e2e-report, e2e-webkit, e2e-gate`.
- `npx playwright test --list --shard=1/2` loads the config with the blob
  reporter on. The default list is unchanged.
- **The merge step's own bash, run locally on real blobs** (`flows/09` against
  a dead host, so every test fails on purpose):

  | Case | Output | Exit |
  |---|---|---|
  | both shards ran (2 + 1 failures) | `executed=3`, `partial=` | 0 |
  | shard 2's global-setup aborted (it still wrote a blob) | `partial= shard 2/2: 0 executed;` | 1 |
  | shard 2's blob missing | `partial= shard 2/2: no report;` | 1 |

- **Not verifiable before the paste:**
  - the sharded wall time;
  - that the two executed counts sum to a full run;
  - pool headroom with three suites.

  These are read from the first staging run after the paste, and are the
  acceptance check on MEH-2895.

## Cost

Each shard repeats `npm ci` + `next build` + server start, about 5 minutes. A
full run costs about 2 × (5 + ~13) ≈ 36 billed minutes, against ~30 (often cut)
today. The wall time drops from ≥ 30 minutes (cut) to about 18. These are
*estimates*. The per-day figures in `docs/release/anchor-plan.md` §E1 assume
them.

## The diff

```diff
--- a/.github/workflows/e2e.yml
+++ b/.github/workflows/e2e.yml
@@ -95,12 +95,27 @@
     # NOTE (MEH-1044): job name kept verbatim although the target is now
     # localhost — required-check identities match on the name: field. Rename
     # only in a follow-up that updates branch protection in the same change.
-    name: Playwright E2E (Vercel preview)
+    #
+    # MEH-2895 — two shards in parallel. The single job hit its 30-minute cap
+    # on staging (~1,419 of ~1,668 tests ran). Each shard runs half the suite
+    # with `--shard=N/2` and keeps every per-job check (coverage floor, report
+    # upload, diagnostics). The PR comment moves to `e2e-report`, which merges
+    # the two blob reports into ONE verdict. `e2e-gate` still reads
+    # `needs.e2e.result`, which GitHub aggregates over the matrix: any red
+    # shard is red.
+    name: Playwright E2E (Vercel preview) ${{ matrix.shard }}/2
     runs-on: ubuntu-latest
     timeout-minutes: 30
     needs: filter
+    strategy:
+      fail-fast: false
+      matrix:
+        shard: [1, 2]
+    # MEH-2895: one queue PER SHARD, so the two halves of one run go in
+    # parallel. The shared-backend protection stays: at most one run's shard N
+    # at a time, so at most two suites hit Railway staging together.
     concurrency:
-      group: e2e-staging-backend
+      group: e2e-staging-backend-${{ matrix.shard }}
       cancel-in-progress: false
       queue: max
 
@@ -247,7 +262,9 @@
         # MEH-484 — --fail-on-flaky-tests turns "passed on retry" into a hard
         # failure so flake stops hiding behind the retry. retries: 1 in CI is
         # preserved (config); the flag detects flake without disabling retries.
-        run: npx playwright test --fail-on-flaky-tests
+        # MEH-2895: `--shard` splits the suite and, by itself, switches on the
+        # blob reporter (playwright.config.ts) so e2e-report can merge both halves.
+        run: npx playwright test --fail-on-flaky-tests --shard=${{ matrix.shard }}/2
         working-directory: frontend
         env:
           PLAYWRIGHT_BASE_URL: http://localhost:3000
@@ -301,6 +318,179 @@
           fi
         id: coverage-floor
 
+      # MEH-2895: the QA report comment moved to the e2e-report job below — two
+      # shards posting into one upserted comment would overwrite each other.
+      - name: Upload blob report (for e2e-report)
+        uses: actions/upload-artifact@v7
+        if: >-
+          always() && steps.e2e-run.outcome != 'cancelled' &&
+          steps.e2e-run.outcome != 'skipped'
+        with:
+          name: blob-report-${{ matrix.shard }}
+          path: frontend/blob-report/
+          retention-days: 1
+          if-no-files-found: warn
+          # A "re-run failed jobs" attempt uploads the same name again.
+          overwrite: true
+
+      - name: Upload Playwright report
+        uses: actions/upload-artifact@v7
+        if: failure()
+        with:
+          name: playwright-report-${{ matrix.shard }}
+          # MEH-484 — also capture per-test trace.zip files so the trace viewer
+          # (playwright.dev/docs/trace-viewer) can replay flake-on-retry runs
+          # without re-running locally.
+          path: |
+            frontend/playwright-report/
+            frontend/test-results/**/trace.zip
+          retention-days: 7
+
+      # MEH-1712 — the same content, in the one place a CC session can actually
+      # read it. An artifact download redirects to Azure blob storage
+      # (productionresultssa18.blob.core.windows.net); the GitHub API hands back
+      # a valid pre-signed URL and the fetch then dies with
+      # `curl: (56) CONNECT tunnel failed, response 403` because that host is
+      # outside the sandbox egress allowlist. No GitHub App permission changes
+      # that — it is the same class as the *.up.railway.app block, and it is
+      # permanent. The probe numbers were diagnosable today for exactly one
+      # reason: they went to the job log, not only to an artifact.
+      #
+      # So this is not a duplicate of the upload below. The upload keeps the
+      # whole file for a human; this step is what removes the human from the
+      # loop. Rule: a diagnostic value that exists only inside an artifact is,
+      # from a CC session, a value that does not exist.
+      #
+      # The empty case prints an explicit line rather than nothing. "No output"
+      # is indistinguishable from "step didn't run" — reporting absence as
+      # silence is the precise failure this ticket spent a day on.
+      - name: Print next-start log (capture-only, MEH-1712)
+        if: always()
+        continue-on-error: true
+        run: |
+          echo "=== /tmp/next-start.log — last 200 lines ==="
+          if [ -s /tmp/next-start.log ]; then
+            tail -200 /tmp/next-start.log
+          else
+            echo "(EMPTY OR MISSING) $(ls -l /tmp/next-start.log 2>&1)"
+          fi
+          echo "=== end /tmp/next-start.log ==="
+
+      # MEH-1712 — the server's own stdout. `next start` has written to
+      # /tmp/next-start.log since MEH-1044 (step "Start Next.js server"), but
+      # nothing ever uploaded it, so every serverFetch failure it recorded was
+      # discarded at job teardown. That is why a half-day of triage could refute
+      # three hypotheses without once seeing the actual error: the file existed
+      # the whole time and was never kept.
+      #
+      # `if: always()` (not `failure()`, unlike the report above) — a PASSING run
+      # is the control. Without it there is nothing to diff a failing log against.
+      # `if-no-files-found: warn` so an empty capture is visible rather than a
+      # silent success, which is the failure mode this whole ticket is about.
+      - name: Upload E2E diagnostics (MEH-1712)
+        uses: actions/upload-artifact@v7
+        if: always()
+        with:
+          name: e2e-diagnostics-${{ matrix.shard }}
+          path: |
+            /tmp/next-start.log
+            /tmp/backend-probe.log
+          retention-days: 7
+          if-no-files-found: warn
+
+  # ─────────────────────────────────────────────────────────────────
+  # MEH-2895 — E2E REPORT: one verdict for the two shards.
+  # Merges the shards' blob reports, re-derives the counts the old single job
+  # computed (executed / unexpected / flaky / skipped), fails if either shard
+  # left no report, and posts the QA comment once. Not in e2e-gate's needs:
+  # each shard already enforces its own coverage floor, and this job only
+  # reports.
+  # ─────────────────────────────────────────────────────────────────
+  e2e-report:
+    name: E2E report (merged shards)
+    runs-on: ubuntu-latest
+    timeout-minutes: 10
+    needs: e2e
+    if: >-
+      always() && needs.e2e.result != 'skipped' &&
+      needs.e2e.result != 'cancelled'
+    steps:
+      - uses: actions/checkout@v7
+
+      - name: Set up Node.js
+        uses: actions/setup-node@v7
+        with:
+          node-version: "22"
+          cache: "npm"
+          cache-dependency-path: frontend/package-lock.json
+
+      - name: Install frontend dependencies
+        run: npm ci
+        working-directory: frontend
+
+      # One directory per shard (no merge-multiple), so a missing shard can be
+      # named rather than merely counted.
+      - name: Download blob reports
+        uses: actions/download-artifact@v8
+        with:
+          pattern: blob-report-*
+          path: frontend/all-blob-reports
+
+      # Per-shard counts first, then the merged totals. A shard whose
+      # global-setup aborted still writes a blob (Playwright's blob reporter
+      # runs onEnd) with 0 executed, and the merged totals of the other shard
+      # would then read as PASS over half the suite. So each shard must have
+      # its own blob AND executed > 0, otherwise `partial` names it and the
+      # comment says INCOMPLETE — never PASS, never "wait for a newer run".
+      - name: Merge reports and count
+        id: coverage-floor
+        working-directory: frontend
+        run: |
+          mkdir -p playwright-report merged-blobs
+          PARTIAL=""
+          for N in 1 2; do
+            DIR="all-blob-reports/blob-report-$N"
+            ZIPS=$(find "$DIR" -name '*.zip' 2>/dev/null | wc -l)
+            if [ "$ZIPS" -eq 0 ]; then
+              echo "::error::Shard $N/2 left no blob report — it timed out, was cancelled, or died before its report step."
+              PARTIAL="$PARTIAL shard $N/2: no report;"
+              continue
+            fi
+            PLAYWRIGHT_JSON_OUTPUT_FILE="playwright-report/shard-$N.json" \
+              npx playwright merge-reports --reporter json "$DIR"
+            E=$(jq '(.stats.expected // 0) + (.stats.unexpected // 0) + (.stats.flaky // 0)' "playwright-report/shard-$N.json")
+            echo "shard $N/2: executed=$E"
+            if [ "$E" -eq 0 ]; then
+              echo "::error::Shard $N/2 executed 0 tests — its global-setup aborted (see that shard's log)."
+              PARTIAL="$PARTIAL shard $N/2: 0 executed;"
+            fi
+            cp "$DIR"/*.zip merged-blobs/
+          done
+          if [ -n "$(ls -A merged-blobs)" ]; then
+            PLAYWRIGHT_JSON_OUTPUT_FILE=playwright-report/results.json \
+              npx playwright merge-reports --reporter json merged-blobs
+            REPORT=playwright-report/results.json
+            STATS_EXPECTED=$(jq '.stats.expected // 0' "$REPORT")
+            STATS_UNEXPECTED=$(jq '.stats.unexpected // 0' "$REPORT")
+            STATS_FLAKY=$(jq '.stats.flaky // 0' "$REPORT")
+            STATS_SKIPPED=$(jq '.stats.skipped // 0' "$REPORT")
+          else
+            STATS_EXPECTED=0; STATS_UNEXPECTED=0; STATS_FLAKY=0; STATS_SKIPPED=0
+          fi
+          EXECUTED=$((STATS_EXPECTED + STATS_UNEXPECTED + STATS_FLAKY))
+          echo "merged: executed=$EXECUTED (expected=$STATS_EXPECTED unexpected=$STATS_UNEXPECTED flaky=$STATS_FLAKY skipped=$STATS_SKIPPED)"
+          {
+            echo "executed=$EXECUTED"
+            echo "skipped=$STATS_SKIPPED"
+            echo "unexpected=$STATS_UNEXPECTED"
+            echo "flaky=$STATS_FLAKY"
+            echo "partial=$PARTIAL"
+          } >> "$GITHUB_OUTPUT"
+          if [ -n "$PARTIAL" ]; then
+            echo "::error::Incomplete run:$PARTIAL"
+            exit 1
+          fi
+
       # MEH-1074 (W0.1) — QA report as a PR comment: one upserted comment per
       # PR (marker-matched, edited in place — no comment spam on re-push).
       # Runs on pass AND fail (if: always()); skipped on push-to-staging runs
@@ -311,9 +501,11 @@
       # step landing). The fresh run upserts the real verdict.
       - name: Post QA report comment
         uses: actions/github-script@v9
+        # !cancelled(): when npm ci / checkout / download fail, the counts are
+        # empty and the verdict module says DID NOT RUN — better than leaving the
+        # previous head's comment up, looking current.
         if: >-
-          always() && github.event_name == 'pull_request' &&
-          steps.e2e-run.outcome != 'cancelled'
+          !cancelled() && github.event_name == 'pull_request'
         with:
           script: |
             const marker = "<!-- e2e-qa-report -->";
@@ -322,7 +514,7 @@
             // and proven without applying a workflow edit:
             //   node scripts/ci/qa-report-verdict.cjs --self-test
             const raw = {
-              outcome:    "${{ steps.e2e-run.outcome }}",
+              outcome:    "${{ needs.e2e.result }}",
               executed:   "${{ steps.coverage-floor.outputs.executed }}",
               unexpected: "${{ steps.coverage-floor.outputs.unexpected }}",
               flaky:      "${{ steps.coverage-floor.outputs.flaky }}",
@@ -350,6 +542,16 @@
                 detail: `**Nothing ran, and the reporter itself could not load** (\`${err.message}\`) — the checkout did not complete. **This is NOT a spec failure.**`,
               };
             }
+            // MEH-2895: a shard missing or with 0 executed is never PASS, and
+            // never "wait for a newer run" — name the shard instead.
+            const partial = `${{ steps.coverage-floor.outputs.partial }}`.trim();
+            if (partial) {
+              report.headline = "Playwright QA — INCOMPLETE";
+              report.detail =
+                `**Not every shard ran:** ${partial} The counts above cover only what did run, ` +
+                "so they are not a verdict on the PR. Open that shard's log. **This is not a pass.**\n\n" +
+                report.detail;
+            }
             const runUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
             const body = [
               marker,
@@ -429,71 +631,6 @@
               });
             }
 
-      - name: Upload Playwright report
-        uses: actions/upload-artifact@v7
-        if: failure()
-        with:
-          name: playwright-report
-          # MEH-484 — also capture per-test trace.zip files so the trace viewer
-          # (playwright.dev/docs/trace-viewer) can replay flake-on-retry runs
-          # without re-running locally.
-          path: |
-            frontend/playwright-report/
-            frontend/test-results/**/trace.zip
-          retention-days: 7
-
-      # MEH-1712 — the same content, in the one place a CC session can actually
-      # read it. An artifact download redirects to Azure blob storage
-      # (productionresultssa18.blob.core.windows.net); the GitHub API hands back
-      # a valid pre-signed URL and the fetch then dies with
-      # `curl: (56) CONNECT tunnel failed, response 403` because that host is
-      # outside the sandbox egress allowlist. No GitHub App permission changes
-      # that — it is the same class as the *.up.railway.app block, and it is
-      # permanent. The probe numbers were diagnosable today for exactly one
-      # reason: they went to the job log, not only to an artifact.
-      #
-      # So this is not a duplicate of the upload below. The upload keeps the
-      # whole file for a human; this step is what removes the human from the
-      # loop. Rule: a diagnostic value that exists only inside an artifact is,
-      # from a CC session, a value that does not exist.
-      #
-      # The empty case prints an explicit line rather than nothing. "No output"
-      # is indistinguishable from "step didn't run" — reporting absence as
-      # silence is the precise failure this ticket spent a day on.
-      - name: Print next-start log (capture-only, MEH-1712)
-        if: always()
-        continue-on-error: true
-        run: |
-          echo "=== /tmp/next-start.log — last 200 lines ==="
-          if [ -s /tmp/next-start.log ]; then
-            tail -200 /tmp/next-start.log
-          else
-            echo "(EMPTY OR MISSING) $(ls -l /tmp/next-start.log 2>&1)"
-          fi
-          echo "=== end /tmp/next-start.log ==="
-
-      # MEH-1712 — the server's own stdout. `next start` has written to
-      # /tmp/next-start.log since MEH-1044 (step "Start Next.js server"), but
-      # nothing ever uploaded it, so every serverFetch failure it recorded was
-      # discarded at job teardown. That is why a half-day of triage could refute
-      # three hypotheses without once seeing the actual error: the file existed
-      # the whole time and was never kept.
-      #
-      # `if: always()` (not `failure()`, unlike the report above) — a PASSING run
-      # is the control. Without it there is nothing to diff a failing log against.
-      # `if-no-files-found: warn` so an empty capture is visible rather than a
-      # silent success, which is the failure mode this whole ticket is about.
-      - name: Upload E2E diagnostics (MEH-1712)
-        uses: actions/upload-artifact@v7
-        if: always()
-        with:
-          name: e2e-diagnostics
-          path: |
-            /tmp/next-start.log
-            /tmp/backend-probe.log
-          retention-days: 7
-          if-no-files-found: warn
-
   # ─────────────────────────────────────────────────────────────────
   # E2E GATE (MEH-1201) — required-check aggregator for the E2E suite.
   # Mirrors ci-gate (pr-checks.yml) / deploy-gate (deploy.yml):
```
