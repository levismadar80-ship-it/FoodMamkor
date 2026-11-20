# MEH-3153 — a blocking WebKit (iPhone) job: `e2e-webkit-core`

**Who applies it:** Claude in Chrome, in GitHub's web editor, on the PR branch
(`.github/**` is denied to Claude Code, security.md). The whole change is the
diff at the end. The patched `.github/workflows/e2e.yml` has sha256
`4c36ed670b04fcacd2f4dddee77ba7d24ae3fbf25f9e0bc87679f9659af1a813`.

## What it does

- **A new job, `e2e-webkit-core`** («Playwright E2E (WebKit core — blocking)»).
  It runs the spec files listed in `frontend/e2e/webkit-core.txt` in the
  `webkit-iphone13` project, against Railway staging, with
  `--fail-on-flaky-tests`. A run that executed 0 tests fails.
- **When it runs:**
  - every push to staging, in public CI mode;
  - every PR that carries `run-e2e`, in **both** modes;
  - a manual run.
  - Never on the nightly or weekly cron; the shadow job `e2e-webkit` keeps
    running the whole suite there, unchanged.
- **How it blocks:**
  - It is a leg of `E2E gate` (`needs` plus a check). When the event had to
    run it, only `success` passes; a skip passes only where the job was not
    meant to run.
  - `scripts/ci/staging_health.py` (rule 41, in this PR) gives it its own
    vote: the newest staging run in which it executed decides its half, and
    red there makes staging red. This also covers a push on which the
    Chromium suite skipped and `E2E gate` posted nothing (MEH-1799).

## Why the label, and not only the push (Sapir 20/11)

Sapir asked what happens once CI goes private: in private mode a push to
staging runs no E2E at all (MEH-3453), so a push-only job would stop. Rule 40
puts `run-e2e` on every PR that touches `frontend/` or `backend/app` before it
merges, and the label starts this job in both modes. So in private mode the
iPhone check blocks at the PR, before the merge. In public mode it blocks at
both points.

## Which specs, and why those

`frontend/e2e/webkit-core.txt` (in this PR), 9 files, 50 tests: the new
chip-row spec plus home, the business page, the map, the producers list and the
owner dashboard. Each was green in the two latest nightly WebKit runs
(44437769648 on 19/11, 44654487659 on 20/11). Left out: `37-outreach-prefill`
(6 reds both nights), `manual/map.spec.ts` and `manual/home.spec.ts` (one red
test each night). The list lives in `frontend/`, so it can change in a normal
PR; `frontend/__tests__/WebkitCoreList.test.js` fails on a listed path that is
gone.

## What it costs

One `ubuntu-latest` job per staging push and per labelled PR, ~10 minutes
(build plus 50 tests on 2 workers). In private mode it runs on the self-hosted
runner only for a labelled PR, the same as the Chromium suite.

**Load on staging.** A push or manual run joins `e2e-staging-backend-webkit`,
the queue the nightly shadow job already holds (`queue: max`), so it waits for
that job instead of loading the one Railway backend beside it (MEH-2398). A PR
run gets its own group, the same shape as the Chromium shards on a PR.

**Risk, stated plainly.** The list rests on two clean nights. The job runs
with `--fail-on-flaky-tests`, so one flaky test reds it, and on a push that
makes staging red under rule 41 until a green push run lands. If that happens,
the flaky spec comes off the list in a normal PR with a card, rather than the
gate being loosened.

## How to check it after it lands

- The PR that carries this patch has `run-e2e`, so its own run must show the
  job executing and `E2E gate` listing `Playwright E2E (WebKit core — blocking)`.
- The first push to staging after the merge must show the job, with its
  `executed=` line.

## The diff

```diff
--- e2e.orig.yml	2026-11-20 22:45:35.674249016 +0000
+++ e2e.yml	2026-11-20 22:54:57.114698632 +0000
@@ -1083,6 +1083,171 @@
             frontend/test-results/**/trace.zip
           retention-days: 7
 
+  # ─────────────────────────────────────────────────────────────────────────
+  # MEH-3153 — WebKit (iPhone 13) CORE, BLOCKING.
+  #
+  # The shadow job above runs the whole suite in WebKit at night and votes on
+  # nothing. This one runs only the specs in frontend/e2e/webkit-core.txt (core
+  # pages, green on the nightly runs it was chosen from) and it DOES vote:
+  #   - it is a leg of `E2E gate` (needs + check below), so a red here reds the
+  #     required check on a PR, and on a staging push where the gate posts
+  #     (the gate posts nothing on a push whose Chromium suite skipped);
+  #   - scripts/ci/staging_health.py counts a red run of it as a red staging
+  #     (rule 41) on every push, including the ones where the gate is silent.
+  #
+  # When it runs:
+  #   - every push to staging, PUBLIC mode only (in private mode a push runs
+  #     no E2E at all — MEH-3453);
+  #   - every PR that carries `run-e2e`, in BOTH modes. Rule 40 puts that label
+  #     on every PR that touches frontend/ or backend/app before it merges, so
+  #     in private mode this is where the iPhone check still blocks;
+  #   - a manual run.
+  # Never on the nightly or weekly cron: the shadow job covers those.
+  #
+  # Backend: Railway staging, like the shadow job — also on a PR. This job
+  # checks the browser engine, not the PR's backend; the Chromium `e2e` job
+  # keeps its local backend for that (MEH-2973).
+  #
+  # Strict like the Chromium gate: --fail-on-flaky-tests (MEH-484), and a run
+  # that executed 0 tests is a failure, not a green.
+  # ─────────────────────────────────────────────────────────────────────────
+  e2e-webkit-core:
+    name: Playwright E2E (WebKit core — blocking)
+    runs-on: ${{ (vars.CI_MODE == 'private' || github.event.repository.private) && 'self-hosted' || 'ubuntu-latest' }}
+    timeout-minutes: 30
+    needs: filter
+    # Same shape as the Chromium shards: a PR run gets its own group (the
+    # workflow-level group already cancels a PR's older run); a push or manual
+    # run joins the staging-backend queue the shadow WebKit job uses, so it
+    # waits for it instead of loading the one Railway backend in parallel
+    # (MEH-2398). queue: max so a waiting run is queued, never cancelled.
+    concurrency:
+      group: ${{ github.event_name == 'pull_request' && format('e2e-webkit-core-pr-{0}', github.run_id) || 'e2e-staging-backend-webkit' }}
+      cancel-in-progress: false
+      queue: max
+    if: |
+      ((github.event_name == 'push' && !(vars.CI_MODE == 'private' || github.event.repository.private)) ||
+       (github.event_name == 'pull_request' && contains(github.event.pull_request.labels.*.name, 'run-e2e') &&
+        (github.event.action != 'labeled' || github.event.label.name == 'run-e2e')) ||
+       github.event_name == 'workflow_dispatch') &&
+      github.actor != 'dependabot[bot]'
+
+    steps:
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
+
+      - name: Set up Node.js 22
+        uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
+        with:
+          node-version: "22"
+          cache: "npm"
+          cache-dependency-path: frontend/package-lock.json
+
+      # Same key as the shadow job: both install webkit only.
+      - name: Cache Playwright browsers (webkit)
+        id: playwright-cache-webkit
+        uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0
+        with:
+          path: ~/.cache/ms-playwright
+          key: playwright-${{ runner.os }}-webkit-${{ hashFiles('frontend/package-lock.json') }}
+
+      - name: Install frontend dependencies
+        run: npm ci
+        working-directory: frontend
+
+      - name: Install Playwright (WebKit only)
+        run: npx playwright install --with-deps webkit
+        working-directory: frontend
+        if: steps.playwright-cache-webkit.outputs.cache-hit != 'true'
+
+      - name: Build frontend
+        run: npm run build
+        working-directory: frontend
+        env:
+          NEXT_TELEMETRY_DISABLED: "1"
+          NEXT_PUBLIC_API_URL: https://foodmamkor-staging.up.railway.app
+          NEXT_PUBLIC_GOOGLE_CLIENT_ID: 591935721343-jjrco2vpmok72to1fm8rq1ss0i2s0cj7.apps.googleusercontent.com
+
+      - name: Start Next.js server (background)
+        run: |
+          nohup npm run start > /tmp/next-start-webkit-core.log 2>&1 &
+        working-directory: frontend
+        env:
+          NEXT_PUBLIC_API_URL: https://foodmamkor-staging.up.railway.app
+
+      - name: Wait for localhost readiness
+        run: |
+          for i in $(seq 1 30); do
+            code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/ || echo 000)
+            echo "attempt $i → HTTP $code"
+            if [ "$code" = "200" ]; then
+              echo "Server ready after ${i} attempt(s)."
+              exit 0
+            fi
+            sleep 3
+          done
+          echo "::error::next start did not serve 200 within ~90s."
+          tail -50 /tmp/next-start-webkit-core.log
+          exit 1
+
+      # The list lives in frontend/ so it can change in a normal PR;
+      # __tests__/WebkitCoreList.test.js fails on a listed file that is gone.
+      - name: Run E2E tests (WebKit core, iPhone 13)
+        id: e2e-webkit-core-run
+        run: |
+          mapfile -t SPECS < <(grep -vE '^[[:space:]]*(#|$)' e2e/webkit-core.txt)
+          echo "WebKit core: ${#SPECS[@]} spec file(s)"
+          if [ "${#SPECS[@]}" -eq 0 ]; then
+            echo "::error::e2e/webkit-core.txt lists no spec — the gate would test nothing."
+            exit 1
+          fi
+          npx playwright test --project=webkit-iphone13 --fail-on-flaky-tests "${SPECS[@]}"
+        working-directory: frontend
+        env:
+          PW_WEBKIT: "1"
+          PLAYWRIGHT_BASE_URL: http://localhost:3000
+          CI: "true"
+          DEMO_OWNER_PASSWORD: ${{ secrets.DEMO_OWNER_PASSWORD }}
+          DEMO_CONSUMER_PASSWORD: ${{ secrets.DEMO_CONSUMER_PASSWORD }}
+          DEMO_ADMIN_PASSWORD: ${{ secrets.DEMO_ADMIN_PASSWORD }}
+
+      # A blocking job that ran nothing must not read as a pass (MEH-1604).
+      - name: Report WebKit core executed count
+        if: always() && steps.e2e-webkit-core-run.outcome != 'cancelled' && steps.e2e-webkit-core-run.outcome != 'skipped'
+        working-directory: frontend
+        run: |
+          REPORT=playwright-report/results.json
+          if [ ! -f "$REPORT" ]; then
+            echo "::error::No JSON report at $REPORT — the WebKit core run produced no results."
+            exit 1
+          fi
+          EXPECTED=$(jq '.stats.expected // 0' "$REPORT")
+          UNEXPECTED=$(jq '.stats.unexpected // 0' "$REPORT")
+          FLAKY=$(jq '.stats.flaky // 0' "$REPORT")
+          SKIPPED=$(jq '.stats.skipped // 0' "$REPORT")
+          EXECUTED=$((EXPECTED + UNEXPECTED + FLAKY))
+          echo "WebKit core — executed=$EXECUTED (passed=$EXPECTED failed=$UNEXPECTED flaky=$FLAKY skipped=$SKIPPED)"
+          {
+            echo "### WebKit (iPhone 13) core — blocking"
+            echo ""
+            echo "| executed | passed | failed | flaky | skipped |"
+            echo "| -- | -- | -- | -- | -- |"
+            echo "| $EXECUTED | $EXPECTED | $UNEXPECTED | $FLAKY | $SKIPPED |"
+          } >> "$GITHUB_STEP_SUMMARY"
+          if [ "$EXECUTED" -eq 0 ]; then
+            echo "::error::WebKit core executed 0 tests — a blocking job that ran nothing is not a pass."
+            exit 1
+          fi
+
+      - name: Upload Playwright report (webkit core)
+        uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
+        if: always() && steps.e2e-webkit-core-run.outcome == 'failure'
+        with:
+          name: playwright-report-webkit-core
+          path: |
+            frontend/playwright-report/
+            frontend/test-results/**/trace.zip
+          retention-days: 7
+
   e2e-gate:
     name: E2E gate 
     # MEH-3453: in private mode no gate job where nothing was meant to run; never on the weekly WebKit cron.
@@ -1096,7 +1261,8 @@
     # change), publish no gate status at all instead of a fresh `success` on
     # the staging tip. PRs are untouched. If the paths filter itself failed the
     # gate still runs, so its R_FILTER guard can go red.
-    needs: [filter, e2e]
+    # MEH-3153: e2e-webkit-core is a leg — see its header.
+    needs: [filter, e2e, e2e-webkit-core]
     runs-on: ${{ (vars.CI_MODE == 'private' || github.event.repository.private) && 'self-hosted' || 'ubuntu-latest' }}
     timeout-minutes: 3
     steps:
@@ -1104,6 +1270,10 @@
         env:
           R_FILTER: ${{ needs.filter.result }}
           R_E2E: ${{ needs.e2e.result }}
+          # MEH-3153: the blocking WebKit core job, and whether this event had to
+          # run it (the same three triggers as its own `if:`).
+          R_WEBKIT_CORE: ${{ needs.e2e-webkit-core.result }}
+          WEBKIT_CORE_MUST_RUN: ${{ (github.event_name == 'push' && !(vars.CI_MODE == 'private' || github.event.repository.private)) || (github.event_name == 'pull_request' && contains(github.event.pull_request.labels.*.name, 'run-e2e') && (github.event.action != 'labeled' || github.event.label.name == 'run-e2e')) || github.event_name == 'workflow_dispatch' }}
           FRONTEND_TOUCHED: ${{ needs.filter.outputs.frontend }}
           # MEH-2956: the backend output only starts the suite on a PR (push
           # runs test Railway staging and ignore it, MEH-2973), so it only
@@ -1160,6 +1330,14 @@
             check "Playwright E2E (Vercel preview)" "$R_E2E"
           fi
 
+          # MEH-3153: WebKit core. When this event had to run it, only `success`
+          # passes; otherwise it skipped by design.
+          if [ "$WEBKIT_CORE_MUST_RUN" = "true" ] && [ "$IS_DEPENDABOT" != "true" ]; then
+            check_ran "Playwright E2E (WebKit core — blocking)" "$R_WEBKIT_CORE"
+          else
+            check "Playwright E2E (WebKit core — blocking)" "$R_WEBKIT_CORE"
+          fi
+
           if [ "$fail" -ne 0 ]; then
             echo "::error::E2E gate failed — Playwright E2E (mobile Pixel 5 + VRT) did not pass."
             exit 1
```
