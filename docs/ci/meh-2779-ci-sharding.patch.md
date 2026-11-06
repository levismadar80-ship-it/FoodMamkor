# MEH-2779 — CI speedup: pytest + vitest in 3 parallel shards, E2E on label

> **For Sapir to commit (Chrome prompt).** `.github/workflows/**` is denied to
> CC's filesystem tools and the Contents API is refused at the sandbox proxy
> (`.claude/rules/security.md`). CC wrote the full new files next to this note
> (`docs/ci/meh-2779/pr-checks.yml`, `docs/ci/meh-2779/e2e.yml`) and the diff
> below; Sapir pastes the two files over the originals on the PR branch, and CC
> then verifies the branch copies byte-for-byte against these two files.

## Why — measured 4–6/11/2026 (≈840 PR runs, `gh api actions/runs` + jobs)

| | median | p90 |
|---|---|---|
| CI gate (PR Checks, success) | 10.8 min | 13.2 min |
| ↳ `Backend tests (pytest)` | 10.4 min | 12.7 min |
| ↳ `Frontend unit tests (vitest)` | 9.1 min | 12.0 min |
| ↳ every other job | ≤ 1.2 min | ≤ 1.3 min |
| Deploy gate (parallel, not critical) | 3.2 min | 4.3 min |
| job queue wait (runner availability) | 0.0 min | ≤ 0.7 min |

E2E: the job-level group `e2e-staging-backend` (`queue: max`) lets one run at a
time repo-wide. Runs waited up to 14 h; 56 of 206 cancelled E2E runs had been
alive > 60 min. E2E carries no merge vote.

## What changes

1. **pytest** → `pytest-shard` (matrix 1..3, own Postgres each, `PYTEST_SHARD=i/3`,
   split in `tests/ci_shard.py`) + `pytest` (same id and name as today) that
   checks the 3 shard reports add up to the whole suite (same size, same
   collection-order fingerprint, kept counts summing to it), combines coverage and
   applies the unchanged 89 floor. The serial pass runs whole on shard 1.
2. **vitest** → `frontend-vitest-shard` (matrix 1..3, `--shard`, blob reporter)
   + `frontend-vitest` (same id and name) that merges with
   `--merge-reports --coverage` and runs the ratchet self-test + ratchet. This is
   the redesign `docs/ci/meh-1912-vitest-shard.patch.md` names as the residual.
3. **E2E** → on a PR only with the `run-e2e` label (`labeled` added to
   `types`); any other label neither starts it nor cancels a run (own
   concurrency bucket). Push to staging collapses to one running + one pending
   (workflow group `e2e-staging-push`, not cancel-in-progress). The job-level
   `e2e-staging-backend` queue is kept: it protects the shared staging backend.

`ci-gate` is untouched: it still reads `needs.pytest` and
`needs.frontend-vitest`, now the combine jobs. A red shard reaches the combine
job (`!cancelled()`), which fails by name.

## Verification (CC)

- `git apply --check` of the diff below against `origin/staging` at 5ee0311: clean.
- YAML parses; `actionlint` reports nothing new (only the pre-existing
  `queue:` key and `github.head_ref` findings it already reports on staging).
- Local, 4 cores, same tree, full run vs 3 shards combined:
  - pytest: 478 s vs 109 / 113 / 114 s per shard; coverage TOTAL 13,288 stmts,
    841 miss in **both**; shard reports 1722 + 1722 + 1721 = 5,165 of 5,165.
  - vitest: 351 s vs 120 / 118 / 117 s per shard; lines 15,290 / 18,169 in
    **both**; 6,261 passed in both; ratchet OK on the merged summary.
- vitest: 2 shards of 40 merged with `--merge-reports --coverage` produced one
  `coverage-summary.json` whose covered lines (3,447) are the union of the two
  shards (2,425 + 1,115 with overlap), not either one.

## The diff

```diff
--- a/.github/workflows/pr-checks.yml
+++ b/.github/workflows/pr-checks.yml
@@ -387,12 +387,22 @@
   # ─────────────────────────────────────────────
   # JOB 2: pytest
   # ─────────────────────────────────────────────
-  pytest:
-    name: Backend tests (pytest)
+  # MEH-2779: the suite runs as 3 parallel shards (one Postgres each) and the
+  # `pytest` job below combines their coverage and applies the floor once.
+  # Measured 4–6/11/2026: this job alone was ~10.4 min of the ~10.8 min
+  # CI-gate median. The split itself lives in tests/ci_shard.py (round-robin
+  # over collection order, PYTEST_SHARD=i/n); it is a no-op without the env.
+  pytest-shard:
+    name: Backend tests (pytest ${{ matrix.shard }}/3)
     needs: changes
     if: ${{ (needs.changes.outputs.backend == 'true' || needs.changes.outputs.workflows == 'true') && github.event.pull_request.draft == false }}
     runs-on: ubuntu-latest
     timeout-minutes: 30
+    strategy:
+      # Every shard reports, so one red shard does not hide another's failures.
+      fail-fast: false
+      matrix:
+        shard: [1, 2, 3]
 
     services:
       postgres:
@@ -510,34 +520,127 @@
       # the 2pt buffer is the backend analogue of the frontend's 0.5pt
       # tolerance (pytest-cov has no tolerance mode). Raise it only from a
       # fresh CI TOTAL line, never from a number quoted elsewhere.
-      - name: Run tests (parallel)
+      # MEH-2779: this shard's third of the parallel suite. No coverage report
+      # here — a third of the suite reports a meaningless percentage; the
+      # floor is applied once, in the `pytest` job, over the combined data.
+      - name: Run tests (parallel, shard ${{ matrix.shard }}/3)
         run: |
           backend/.venv/bin/python -m pytest tests/ \
             -n auto -m "not serial" \
             --cov=backend/app \
-            --cov-report=term \
+            --cov-report= \
             --durations=15 \
             --tb=long --timeout=60
         env:
+          PYTEST_SHARD: ${{ matrix.shard }}/3
+          PYTEST_SHARD_REPORT: shard-report.txt
           TEST_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/mehamakor_test
           SECRET_KEY: ci-test-secret-not-for-production
           DATABASE_URL: postgresql://postgres:postgres@localhost:5432/mehamakor_test
 
-      - name: Run serial tests + coverage gate
+      # The serial pass is NOT sharded (no PYTEST_SHARD): it runs whole, once,
+      # on shard 1, appending to that shard's coverage data.
+      - name: Run serial tests (shard 1 only)
+        if: matrix.shard == 1
         run: |
           backend/.venv/bin/python -m pytest tests/ \
             -m serial \
             --cov=backend/app --cov-append \
-            --cov-report=xml \
-            --cov-report=html \
-            --cov-report=term \
-            --cov-fail-under=89 \
+            --cov-report= \
             --tb=long --timeout=60
         env:
           TEST_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/mehamakor_test
           SECRET_KEY: ci-test-secret-not-for-production
           DATABASE_URL: postgresql://postgres:postgres@localhost:5432/mehamakor_test
 
+      - name: Stage coverage data for the combine job
+        run: |
+          set -euo pipefail
+          mkdir -p shard-out
+          mv .coverage "shard-out/.coverage.shard${{ matrix.shard }}"
+          mv shard-report.txt "shard-out/shard-report-${{ matrix.shard }}.txt"
+
+      - name: Upload coverage data
+        uses: actions/upload-artifact@v7
+        with:
+          name: pytest-coverage-${{ matrix.shard }}
+          path: shard-out/
+          # `.coverage.*` is a dotfile; upload-artifact skips those by default.
+          include-hidden-files: true
+          if-no-files-found: error
+          retention-days: 1
+
+  # MEH-2779: the job the CI gate reads (`needs.pytest`) — same id, same name
+  # as the single job it replaces, so the gate and the ruleset are unchanged.
+  # `!cancelled()` so a red shard still reaches this job and is reported by
+  # name, instead of the gate seeing a bare `skipped`.
+  pytest:
+    name: Backend tests (pytest)
+    needs: [changes, pytest-shard]
+    if: ${{ !cancelled() && (needs.changes.outputs.backend == 'true' || needs.changes.outputs.workflows == 'true') && github.event.pull_request.draft == false }}
+    runs-on: ubuntu-latest
+    timeout-minutes: 10
+    steps:
+      - name: All shards passed
+        env:
+          R_SHARDS: ${{ needs.pytest-shard.result }}
+        run: |
+          if [ "$R_SHARDS" != "success" ]; then
+            echo "::error::A pytest shard did not pass (result=$R_SHARDS) — see the 'Backend tests (pytest N/3)' jobs."
+            exit 1
+          fi
+
+      - uses: actions/checkout@v7
+
+      - name: Set up uv
+        uses: astral-sh/setup-uv@v7
+        with:
+          version: "latest"
+          enable-cache: true
+          cache-dependency-glob: "backend/uv.lock"
+
+      - name: Install dependencies
+        run: uv sync --frozen
+        working-directory: backend
+
+      - name: Download shard coverage data
+        uses: actions/download-artifact@v8
+        with:
+          pattern: pytest-coverage-*
+          path: shard-out
+          merge-multiple: true
+
+      # The partition check: three distinct shards, the same suite size seen
+      # by each, and the kept counts summing to it. A shard that silently
+      # collected nothing, or two shards that both thought they were "1/3",
+      # fail here — not as a mysteriously lower coverage number.
+      - name: Shards together ran the whole suite
+        run: |
+          set -euo pipefail
+          cat shard-out/shard-report-*.txt
+          awk '
+            { idx[$1]=1; n=$2; kept+=$3; all[$4]=1; ord[$5]=1; rows++ }
+            END {
+              nall=0; for (k in all) nall++
+              nidx=0; for (k in idx) nidx++
+              nord=0; for (k in ord) nord++
+              if (rows != n || nidx != n) { print "::error::expected " n " shard reports, got " rows " (" nidx " distinct)"; exit 1 }
+              if (nall != 1) { print "::error::shards disagree on the suite size"; exit 1 }
+              if (nord != 1) { print "::error::shards collected the suite in different orders — round-robin is not a partition"; exit 1 }
+              for (k in all) total=k
+              if (kept != total) { print "::error::shards ran " kept " of " total " tests"; exit 1 }
+              print "OK: " n " shards ran " kept " of " total " tests (parallel pass; the serial pass runs whole on shard 1)"
+            }' shard-out/shard-report-*.txt
+
+      # MEH-489 / MEH-1980 coverage floor, unchanged: 89, over the whole suite.
+      - name: Combine coverage + coverage gate
+        run: |
+          set -euo pipefail
+          backend/.venv/bin/coverage combine shard-out/.coverage.shard*
+          backend/.venv/bin/coverage report --fail-under=89
+          backend/.venv/bin/coverage xml
+          backend/.venv/bin/coverage html
+
       # MEH-489 — Smokeshow upload (Tiangolo pattern).
       # `continue-on-error: true` covers the calibration window before
       # SMOKESHOW_AUTH_KEY lands as a repo secret post-merge. Fork PR
@@ -806,16 +909,66 @@
       - name: Run tsc strict (e2e files, warn-only — errors logged, check passes)
         run: npx tsc --project tsconfig.e2e.json --noEmit || true
 
-  frontend-vitest:
-    name: Frontend unit tests (vitest)
+  # MEH-2779: 3 parallel shards (`vitest --shard`, blob reporter); the
+  # `frontend-vitest` job below merges them (`--merge-reports --coverage`)
+  # and runs the coverage ratchet on the merged numbers. Measured 4–6/11/2026:
+  # ~9 min as one job, most of it per-file jsdom setup (vitest.config.js,
+  # MEH-1912), which is exactly the cost that splits across machines.
+  frontend-vitest-shard:
+    name: Frontend unit tests (vitest ${{ matrix.shard }}/3)
     needs: changes
     if: ${{ (needs.changes.outputs.frontend == 'true' || needs.changes.outputs.workflows == 'true') && github.event.pull_request.draft == false }}
     runs-on: ubuntu-latest
     timeout-minutes: 15
+    strategy:
+      fail-fast: false
+      matrix:
+        shard: [1, 2, 3]
+    defaults:
+      run:
+        working-directory: frontend
+    steps:
+      - uses: actions/checkout@v7
+      - name: Set up Node.js 20
+        uses: actions/setup-node@v7
+        with:
+          node-version: "22"
+          cache: "npm"
+          cache-dependency-path: frontend/package-lock.json
+      - name: Install dependencies
+        run: npm ci
+      - name: Run vitest shard ${{ matrix.shard }}/3 (with coverage — merged below)
+        run: npx vitest run --coverage --shard=${{ matrix.shard }}/3 --reporter=blob --reporter=default
+      - name: Upload blob report
+        uses: actions/upload-artifact@v7
+        with:
+          name: vitest-blob-${{ matrix.shard }}
+          path: frontend/.vitest-reports/
+          include-hidden-files: true
+          if-no-files-found: error
+          retention-days: 1
+
+  # MEH-2779: same id and name as the single job it replaces — the CI gate
+  # reads `needs.frontend-vitest` unchanged.
+  frontend-vitest:
+    name: Frontend unit tests (vitest)
+    needs: [changes, frontend-vitest-shard]
+    if: ${{ !cancelled() && (needs.changes.outputs.frontend == 'true' || needs.changes.outputs.workflows == 'true') && github.event.pull_request.draft == false }}
+    runs-on: ubuntu-latest
+    timeout-minutes: 10
     defaults:
       run:
         working-directory: frontend
     steps:
+      - name: All shards passed
+        env:
+          R_SHARDS: ${{ needs.frontend-vitest-shard.result }}
+        working-directory: .
+        run: |
+          if [ "$R_SHARDS" != "success" ]; then
+            echo "::error::A vitest shard did not pass (result=$R_SHARDS) — see the 'Frontend unit tests (vitest N/3)' jobs."
+            exit 1
+          fi
       - uses: actions/checkout@v7
       - name: Set up Node.js 20
         uses: actions/setup-node@v7
@@ -825,8 +978,20 @@
           cache-dependency-path: frontend/package-lock.json
       - name: Install dependencies
         run: npm ci
-      - name: Run vitest unit suite (with coverage — feeds the ratchet below)
-        run: npx vitest run --coverage
+      - name: Download blob reports
+        uses: actions/download-artifact@v8
+        with:
+          pattern: vitest-blob-*
+          path: frontend/.vitest-reports
+          merge-multiple: true
+      - name: Exactly 3 blob reports
+        run: |
+          set -euo pipefail
+          ls -la .vitest-reports
+          n=$(ls .vitest-reports/blob-*-3.json | wc -l)
+          if [ "$n" -ne 3 ]; then echo "::error::expected 3 vitest blob reports, got $n"; exit 1; fi
+      - name: Merge shard reports + coverage (feeds the ratchet below)
+        run: npx vitest run --merge-reports --coverage
 
       - name: Coverage ratchet self-test (the comparator must still discriminate)
         run: node ../scripts/checks/coverage-ratchet.mjs --self-test
--- a/.github/workflows/e2e.yml
+++ b/.github/workflows/e2e.yml
@@ -36,6 +36,10 @@
 on:
   pull_request:
     branches: [staging]
+    # MEH-2779: `labeled` is load-bearing — adding the `run-e2e` label is what
+    # starts the suite on a PR (see the e2e job's `if:`). The other three are
+    # the GitHub defaults, listed because naming `types` replaces them.
+    types: [opened, synchronize, reopened, labeled]
   push:
     branches: [staging]
   # MEH-1712 — manual run, for the MEH-1712 diagnostics artifact (the step
@@ -53,9 +57,19 @@
   # comment on the PR. Scope is comment-only — contents stays read.
   pull-requests: write
 
+# MEH-2779: three buckets.
+#   PR code push / reopen / `run-e2e` label → e2e-<branch>-code, cancels the
+#     same PR's older run (as before).
+#   any OTHER label on a PR → e2e-<branch>-other-label: its run only does the
+#     paths filter (the e2e jobs skip on it), and it must never cancel a real
+#     run — same reasoning as pr-checks.yml's MEH-1523 buckets.
+#   push to staging → e2e-staging-push, NOT cancel-in-progress: GitHub keeps
+#     one running + one pending per group and a newer pending replaces the
+#     older, so a burst of merges collapses to "test the latest staging",
+#     instead of every merge queueing 30 min behind the last one.
 concurrency:
-  group: e2e-${{ github.head_ref || github.run_id }}
-  cancel-in-progress: true
+  group: e2e-${{ github.head_ref && format('{0}-{1}', github.head_ref, (github.event.action == 'labeled' && github.event.label.name != 'run-e2e') && 'other-label' || 'code') || (github.event_name == 'push' && 'staging-push') || github.run_id }}
+  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
 
 jobs:
   filter:
@@ -103,10 +117,21 @@
     # on a docs push. A manual run is an explicit request; honour it verbatim.
     # This does NOT widen the filter: no PR and no push reaches this branch of
     # the OR, so which automatic runs execute E2E is byte-for-byte unchanged.
+    #
+    # MEH-2779 — on a PR the suite runs only once the PR carries the `run-e2e`
+    # label. It used to run on every push of every PR, and the job-level
+    # `e2e-staging-backend` queue below lets one run at a time repo-wide
+    # (the shared Railway staging backend), so runs waited up to 14 h
+    # (measured 4–6/11/2026) and were mostly cancelled unseen. A labeled
+    # event for any other label does not start it. Push to staging and
+    # workflow_dispatch are unchanged.
     if: |
       (needs.filter.outputs.frontend == 'true' ||
        github.event_name == 'workflow_dispatch') &&
-      github.actor != 'dependabot[bot]'
+      github.actor != 'dependabot[bot]' &&
+      (github.event_name != 'pull_request' ||
+       (contains(github.event.pull_request.labels.*.name, 'run-e2e') &&
+        (github.event.action != 'labeled' || github.event.label.name == 'run-e2e')))
 
     steps:
       - uses: actions/checkout@v7
@@ -522,10 +547,21 @@
 
     # Identical trigger condition to the `e2e` job — same frontend paths-filter,
     # same workflow_dispatch escape (MEH-1712), same dependabot exclusion.
+    #
+    # MEH-2779 — on a PR the suite runs only once the PR carries the `run-e2e`
+    # label. It used to run on every push of every PR, and the job-level
+    # `e2e-staging-backend` queue below lets one run at a time repo-wide
+    # (the shared Railway staging backend), so runs waited up to 14 h
+    # (measured 4–6/11/2026) and were mostly cancelled unseen. A labeled
+    # event for any other label does not start it. Push to staging and
+    # workflow_dispatch are unchanged.
     if: |
       (needs.filter.outputs.frontend == 'true' ||
        github.event_name == 'workflow_dispatch') &&
-      github.actor != 'dependabot[bot]'
+      github.actor != 'dependabot[bot]' &&
+      (github.event_name != 'pull_request' ||
+       (contains(github.event.pull_request.labels.*.name, 'run-e2e') &&
+        (github.event.action != 'labeled' || github.event.label.name == 'run-e2e')))
 
     steps:
       - uses: actions/checkout@v7
```
