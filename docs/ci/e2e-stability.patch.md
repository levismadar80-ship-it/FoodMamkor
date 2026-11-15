# MEH-2972 — E2E stability: nightly run, flaky = warning on staging, WebKit nightly only

> ✅ **Applied 12/11/2026** — commit `ba20e59` on this PR's branch (pasted
> through the GitHub web editor by Claude in Chrome; CC cannot write
> `.github/**`). CC checked it byte-for-byte: the committed `e2e.yml` has the
> same sha256 (`fadbb25c…`) as the staged full copy, which was then deleted.
> Sapir chose this change on 12/11 («שלב 1 + 2 ביחד»), so it is her decision,
> not CC loosening a gate (rule 32). The diff below is the record.

## Why

Measured 10–12/11: every staging run in which Playwright actually executed was
red (5 of 5), each time from 1–2 tests out of ~1,550. With
`--fail-on-flaky-tests`, a test that fails once and passes on retry fails the
whole run. With that many tests, even a tiny per-test flake rate makes most
full runs red, and rule 41 then freezes all merges. Meanwhile long "green"
stretches on staging were runs that skipped Playwright, so nobody knew.

## What changes (5 edits, one file)

1. **Nightly run** — `schedule: cron "30 1 * * *"` (03:30 Israel winter time).
   Staging gets a real executed E2E result every day even when no frontend
   change landed, so rule 41's "last run that executed" is at most a day old.
2. The `e2e` job's `if:` admits `schedule` next to `workflow_dispatch`.
3. **`--fail-on-flaky-tests` on pull requests only.** On staging pushes and the
   nightly run, a test that passes on retry no longer fails the run. A real
   failure (fails on both tries) still fails it.
4. **The flaky count is not silent.** `e2e-report` prints a `::warning::` with
   the number of flaky tests, and testing.md requires a Linear card for each one
   the same day. A PR that touches the flaky spec still goes red on it, because
   PRs keep the flag.
5. **WebKit shadow job: nightly / manual only, 60-minute timeout.** It was
   cancelled at 20 minutes on every run with no output, so it spent runner time
   and proved nothing.

## Not in this patch (follow-ups)

- `backend/app/**` is still outside the E2E paths filter.
- `E2E gate` still reports `success` for a skipped run (rule 40/41 cover it by
  hand; the nightly run narrows the gap).
- The durable fix for nav-gate 429s from one CI IP is MEH-2947.

## The diff

```diff
--- a/.github/workflows/e2e.yml
+++ b/.github/workflows/e2e.yml
@@ -50,6 +50,13 @@
   # produced no run that would execute it — the data waited on an unrelated
   # future `frontend/**` push.
   workflow_dispatch:
+  # MEH-2972 — one full run every night on staging, whatever was merged. A
+  # staging push runs the suite only when frontend/** changed, so a backend-only
+  # or docs-only day left "is staging green?" unanswered (rule 41, 11/11: five
+  # hours of unknown). 01:30 UTC = 03:30/04:30 Israel, outside working hours.
+  # Like workflow_dispatch it bypasses the paths filter (see the e2e job's if:).
+  schedule:
+    - cron: "30 1 * * *"
 
 permissions:
   contents: read
@@ -142,7 +149,8 @@
     # workflow_dispatch are unchanged.
     if: |
       (needs.filter.outputs.frontend == 'true' ||
-       github.event_name == 'workflow_dispatch') &&
+       github.event_name == 'workflow_dispatch' ||
+       github.event_name == 'schedule') &&
       github.actor != 'dependabot[bot]' &&
       (github.event_name != 'pull_request' ||
        (contains(github.event.pull_request.labels.*.name, 'run-e2e') &&
@@ -264,7 +272,16 @@
         # preserved (config); the flag detects flake without disabling retries.
         # MEH-2895: `--shard` splits the suite and, by itself, switches on the
         # blob reporter (playwright.config.ts) so e2e-report can merge both halves.
-        run: npx playwright test --fail-on-flaky-tests --shard=${{ matrix.shard }}/2
+        #
+        # MEH-2972 (Sapir 12/11, decision card «שלב 1 + 2»): the strict flag
+        # stays on PULL REQUESTS only. On a staging push or the nightly run a
+        # test that passed on retry is reported, not blocking: e2e-report
+        # prints a ::warning:: naming the count, and testing.md makes a card
+        # for it the same day. Measured 10–12/11: every staging run whose
+        # Playwright jobs executed was red (5/5), each on 1–2 of ~1,550 tests,
+        # and rule 41 then froze every PR. A test that FAILS both attempts is
+        # still red everywhere.
+        run: npx playwright test ${{ github.event_name == 'pull_request' && '--fail-on-flaky-tests' || '' }} --shard=${{ matrix.shard }}/2
         working-directory: frontend
         env:
           PLAYWRIGHT_BASE_URL: http://localhost:3000
@@ -490,6 +507,11 @@
             echo "::error::Incomplete run:$PARTIAL"
             exit 1
           fi
+          # MEH-2972: off pull requests a retry-pass no longer reds the run
+          # (see the e2e job's run step), so say it out loud instead.
+          if [ "$STATS_FLAKY" -gt 0 ]; then
+            echo "::warning::$STATS_FLAKY flaky test(s) passed only on retry — each needs a Linear card today (testing.md, MEH-2972). Names: the 'N flaky' block in each shard's log."
+          fi
 
       # MEH-1074 (W0.1) — QA report as a PR comment: one upserted comment per
       # PR (marker-matched, edited in place — no comment spam on re-push).
@@ -673,7 +695,11 @@
   e2e-webkit:
     name: Playwright E2E (WebKit — shadow, non-blocking)
     runs-on: ubuntu-latest
-    timeout-minutes: 20
+    # MEH-2972: was 20 and every run 10–12/11 hit it and was cancelled with no
+    # report — 20 runner-minutes for zero information each time. The full
+    # suite on one runner needs ~30 (the Chromium suite needed two shards to
+    # fit in 30, MEH-2895), so it now runs nightly only, with room to finish.
+    timeout-minutes: 60
     needs: filter
     concurrency:
       group: e2e-staging-backend-webkit
@@ -693,7 +719,7 @@
     # event for any other label does not start it. Push to staging and
     # workflow_dispatch are unchanged.
     if: |
-      (needs.filter.outputs.frontend == 'true' ||
+      (github.event_name == 'schedule' ||
        github.event_name == 'workflow_dispatch') &&
       github.actor != 'dependabot[bot]' &&
       (github.event_name != 'pull_request' ||
```
