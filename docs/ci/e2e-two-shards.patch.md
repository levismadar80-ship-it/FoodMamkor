# MEH-2895 — E2E in two parallel shards, one merged report

> **Not applied.** `.github/workflows/**` is denied to CC's filesystem tools and
> the Contents API is refused at the sandbox proxy (`.claude/rules/security.md`).
> Sapir pastes the diff below through the GitHub web editor; CC then checks the
> branch file byte-for-byte against this diff before merging.
>
> **Lands first, in the same PR as this file (no workflow change):**
> `frontend/e2e/login-retry.ts` + `global-setup.ts` (a 429 on login is waited
> out and retried) and the `PW_BLOB=1` blob reporter in `playwright.config.ts`
> (inert until the workflow sets it).

## Why — measured 10/11/2026

- The single `Playwright E2E (Vercel preview)` job has `timeout-minutes: 30`.
  The staging runs on 10/11 were cut at the cap: ~1,419 of 1,668 tests ran.
- `npx playwright test --list --shard=1/2` → **834** tests; the full list is
  **1,668**. The split is even by count.
- `/auth/login` is 5/minute per client IP, and global-setup logs in 3–4 accounts.
  Two shards on one runner IP would spend 8. The retry in global-setup waits a
  full window out (20 s × 3) instead of failing the run with 0 tests.

## What changes

1. **`e2e`** becomes a matrix of `shard: [1, 2]`, `fail-fast: false`.
   - Name: `Playwright E2E (Vercel preview) 1/2` and `… 2/2`. This job is not in
     the ruleset (`e2e-gate` is the aggregator), so the rename blocks nothing.
   - Runs `npx playwright test --fail-on-flaky-tests --shard=N/2` with
     `PW_BLOB=1`.
   - The job-level queue becomes `e2e-staging-backend-<N>`. The two halves of one
     run go in parallel. At most one run's shard N runs at a time, so at most two
     suites hit Railway staging together (before: one).
   - Artifacts get a `-<N>` suffix (`playwright-report-N`, `e2e-diagnostics-N`).
     Two jobs uploading one artifact name fail with a conflict.
   - New step: upload `blob-report/` as `blob-report-N` (1 day).
   - The per-shard **coverage floor stays**. A shard that executed 0 tests fails
     by itself.
   - The **QA comment step moves out** (two shards upserting one comment would
     overwrite each other).
2. **New `e2e-report`** (`needs: e2e`, runs unless the run was skipped or
   cancelled):
   - downloads both blobs;
   - **fails if there are not exactly 2** ("a shard died before writing its
     blob");
   - runs `npx playwright merge-reports --reporter json`;
   - re-derives executed / unexpected / flaky / skipped;
   - fails on 0 executed;
   - posts the same QA comment, with `outcome` = `needs.e2e.result`.
3. **`e2e-gate` is unchanged.** `needs.e2e.result` is GitHub's aggregate over the
   matrix (any red shard → `failure`).

## Verification (CC, 10/11)

- `git apply --check` of the diff below against `origin/staging`: clean.
- YAML parses; jobs = `filter, e2e, e2e-report, e2e-webkit, e2e-gate`.
- `PW_BLOB=1 npx playwright test --list` loads the config.
- **Merge mechanics, locally, same commands as the patch.**
  - Ran `flows/09-login-console-clean.spec.ts` as `--shard=1/2` and
    `--shard=2/2` with `PW_BLOB=1` against a dead host, so every test fails on
    purpose.
  - Shard 1: 2 failed; shard 2: 1 failed.
  - `PLAYWRIGHT_JSON_OUTPUT_FILE=playwright-report/results.json npx playwright
    merge-reports --reporter json all-blob-reports` → `stats.unexpected = 3`.
    The merged counts are the sum, not either shard.
- **Not verifiable before the paste:**
  - the first sharded run's wall time;
  - that its two `executed` counts sum to a full run;
  - that both shards finish under 30 minutes.

  These are the acceptance check on MEH-2895, read from the first staging run
  after the paste.

## Cost

Each shard repeats `npm ci` + `next build` + server start, about 5 minutes. A
full run costs about 2 × (5 + ~13) ≈ 36 billed minutes, against ~30 (often cut)
today. The wall time drops from ≥ 30 minutes (cut) to about 18. The per-day
figures in `docs/release/anchor-plan.md` §E1 assume this.

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
 
@@ -247,11 +262,14 @@
         # MEH-484 — --fail-on-flaky-tests turns "passed on retry" into a hard
         # failure so flake stops hiding behind the retry. retries: 1 in CI is
         # preserved (config); the flag detects flake without disabling retries.
-        run: npx playwright test --fail-on-flaky-tests
+        # MEH-2895: `--shard` splits the suite; PW_BLOB=1 adds the blob reporter
+        # (playwright.config.ts) so e2e-report can merge both halves.
+        run: npx playwright test --fail-on-flaky-tests --shard=${{ matrix.shard }}/2
         working-directory: frontend
         env:
           PLAYWRIGHT_BASE_URL: http://localhost:3000
           CI: "true"
+          PW_BLOB: "1"
           # MEH-999: unlock the authenticated specs. global-setup.ts provisions
           # e2e/.auth/{producer,consumer,admin}.json by logging in through the
           # /api proxy to the Railway staging backend, where these accounts are
@@ -301,6 +319,151 @@
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
+      - name: Download blob reports
+        uses: actions/download-artifact@v8
+        with:
+          pattern: blob-report-*
+          path: frontend/all-blob-reports
+          merge-multiple: true
+
+      - name: Merge reports and count
+        id: coverage-floor
+        working-directory: frontend
+        env:
+          PLAYWRIGHT_JSON_OUTPUT_FILE: playwright-report/results.json
+        run: |
+          BLOBS=$(find all-blob-reports -name '*.zip' 2>/dev/null | wc -l)
+          echo "blob reports found: $BLOBS (expected 2)"
+          if [ "$BLOBS" -ne 2 ]; then
+            echo "::error::Expected 2 shard reports, found $BLOBS — a shard died before writing its blob. The counts below would describe part of the suite only."
+            exit 1
+          fi
+          mkdir -p playwright-report
+          npx playwright merge-reports --reporter json all-blob-reports
+          REPORT=playwright-report/results.json
+          STATS_EXPECTED=$(jq '.stats.expected // 0' "$REPORT")
+          STATS_UNEXPECTED=$(jq '.stats.unexpected // 0' "$REPORT")
+          STATS_FLAKY=$(jq '.stats.flaky // 0' "$REPORT")
+          STATS_SKIPPED=$(jq '.stats.skipped // 0' "$REPORT")
+          EXECUTED=$((STATS_EXPECTED + STATS_UNEXPECTED + STATS_FLAKY))
+          echo "merged: executed=$EXECUTED (expected=$STATS_EXPECTED unexpected=$STATS_UNEXPECTED flaky=$STATS_FLAKY skipped=$STATS_SKIPPED)"
+          echo "executed=$EXECUTED" >> "$GITHUB_OUTPUT"
+          echo "skipped=$STATS_SKIPPED" >> "$GITHUB_OUTPUT"
+          echo "unexpected=$STATS_UNEXPECTED" >> "$GITHUB_OUTPUT"
+          echo "flaky=$STATS_FLAKY" >> "$GITHUB_OUTPUT"
+          if [ "$EXECUTED" -eq 0 ]; then
+            echo "::error::ZERO COVERAGE across both shards — 0 tests executed."
+            exit 1
+          fi
+
       # MEH-1074 (W0.1) — QA report as a PR comment: one upserted comment per
       # PR (marker-matched, edited in place — no comment spam on re-push).
       # Runs on pass AND fail (if: always()); skipped on push-to-staging runs
@@ -313,7 +476,7 @@
         uses: actions/github-script@v9
         if: >-
           always() && github.event_name == 'pull_request' &&
-          steps.e2e-run.outcome != 'cancelled'
+          steps.coverage-floor.outcome != 'skipped'
         with:
           script: |
             const marker = "<!-- e2e-qa-report -->";
@@ -322,7 +485,7 @@
             // and proven without applying a workflow edit:
             //   node scripts/ci/qa-report-verdict.cjs --self-test
             const raw = {
-              outcome:    "${{ steps.e2e-run.outcome }}",
+              outcome:    "${{ needs.e2e.result }}",
               executed:   "${{ steps.coverage-floor.outputs.executed }}",
               unexpected: "${{ steps.coverage-floor.outputs.unexpected }}",
               flaky:      "${{ steps.coverage-floor.outputs.flaky }}",
@@ -429,71 +592,6 @@
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
