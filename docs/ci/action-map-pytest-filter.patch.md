# MEH-2894 — a light CI job for the action map's full guard

**Staged for Sapir. CC cannot apply this**: `.github/workflows/**` is
mechanically denied (`.claude/settings.json` `permissions.deny`).

**As of 2026-11-10**, against the PR-checks workflow at `origin/staging`
(`git apply --check` clean, YAML parsed, the job's command run locally:
17 passed). Line numbers drift — match on content.

## Why a separate filter and job (round-2 review)

The first version of this patch added the action map's paths to the `backend`
filter. That fans out to the three pytest shards, seed-coverage, ruff and mypy
on every PR that touches a business tool or a Playwright spec — minutes of CI
for a 20-second check. This version instead adds:

1. a `actionmap` output of the paths filter: `scripts/release/**`, the doc and
   its manifest, `frontend/lib/business-features.js`, the state-machine audit,
   `frontend/e2e/**`, `frontend/__tests__/**`, `tests/**`,
   `backend/app/routers/**`;
2. one job, **Action map (full guard)**: checkout, `uv sync --frozen`, then
   `pytest --noconftest tests/test_action_map_complete.py` — no Postgres (the
   test imports the app and never connects);
3. the CI gate requires that job (`check_ran`) whenever `actionmap` or
   `workflows` is true — the same shape as the backend legs.

## What guards what, before and after

| | Today (no patch) | After |
|---|---|---|
| Every PR | Repo guards → `action-map-drift-guard.sh`: regenerates the whole doc with the route table read from the doc, checks citations + manifest | same |
| Route table vs the app (a route added / removed / re-gated) | only PRs that run the pytest shards (`backend/**`, `tests/**`) | also every PR touching the paths above, via the light job |

## The change

```diff
--- a/.github/workflows/pr-checks.yml
+++ b/.github/workflows/pr-checks.yml
@@ -220,6 +220,7 @@
       backend: ${{ steps.filter.outputs.backend }}
       workflows: ${{ steps.filter.outputs.workflows }}
       deps: ${{ steps.filter.outputs.deps }}
+      actionmap: ${{ steps.filter.outputs.actionmap }}
     steps:
       - uses: actions/checkout@v7
       - uses: dorny/paths-filter@v3
@@ -251,6 +252,20 @@
               - 'scripts/check_api_contract.py'
             workflows:
               - '.github/workflows/**'
+            # MEH-2894: the inputs and outputs of the generated action map
+            # (docs/release/action-map.md). Its OWN filter and light job —
+            # adding these to `backend` would fan out to 3 pytest shards,
+            # seed-coverage, ruff and mypy on every business-tool PR.
+            actionmap:
+              - 'scripts/release/**'
+              - 'docs/release/action-map.md'
+              - 'docs/release/action-map.sha256'
+              - 'frontend/lib/business-features.js'
+              - 'docs/audits/2026-11-implicit-state-machines.md'
+              - 'frontend/e2e/**'
+              - 'frontend/__tests__/**'
+              - 'tests/**'
+              - 'backend/app/routers/**'
             # MEH-1585: mirrors dependency-audit.yml's backend manifests exactly.
             # If the two lists diverge the gate silently stops covering a manifest.
             deps:
@@ -1075,6 +1090,39 @@
         run: uv run --with pip-audit pip-audit
         working-directory: backend
 
+  # ─────────────────────────────────────────────
+  # MEH-2894: the action map's FULL guard (route table included). Light on
+  # purpose: uv sync + one test file, no Postgres — the test imports the app
+  # and never connects, and --noconftest skips the repo's DB fixtures. The
+  # stdlib half of the same checks runs on every PR in Repo guards
+  # (scripts/checks/action-map-drift-guard.sh).
+  # ─────────────────────────────────────────────
+  action-map:
+    name: Action map (full guard)
+    needs: changes
+    if: ${{ needs.changes.outputs.actionmap == 'true' || needs.changes.outputs.workflows == 'true' }}
+    runs-on: ubuntu-latest
+    timeout-minutes: 10
+    steps:
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
+      - name: Action map — complete, fresh, citations hold
+        run: backend/.venv/bin/python -m pytest --noconftest -p no:cacheprovider -q tests/test_action_map_complete.py
+        env:
+          ENV: test
+          SECRET_KEY: ci-test-secret-not-for-production
+
   ci-gate:
     name: CI gate (required)
     if: always()
@@ -1094,6 +1142,7 @@
       - frontend-tsc-strict
       - frontend-vitest
       - pip-audit
+      - action-map
     runs-on: ubuntu-latest
     timeout-minutes: 3
     steps:
@@ -1123,6 +1172,8 @@
           R_FRONTEND_TSC: ${{ needs.frontend-tsc-strict.result }}
           R_FRONTEND_VITEST: ${{ needs.frontend-vitest.result }}
           R_PIP_AUDIT: ${{ needs.pip-audit.result }}
+          R_ACTION_MAP: ${{ needs.action-map.result }}
+          ACTIONMAP_TOUCHED: ${{ needs.changes.outputs.actionmap }}
           DEPS_TOUCHED: ${{ needs.changes.outputs.deps }}
         run: |
           set -euo pipefail
@@ -1215,6 +1266,14 @@
             echo "No dependency manifest touched — pip-audit not enforced."
           fi
 
+          # MEH-2894: mirror the action-map job's own `if:`.
+          if [ "$ACTIONMAP_TOUCHED" = "true" ] || [ "$WORKFLOWS_TOUCHED" = "true" ]; then
+            echo "Action-map input touched — enforcing the action map's full guard:"
+            check_ran "Action map (full guard)" "$R_ACTION_MAP"
+          else
+            echo "No action-map input touched — full action-map guard not enforced (Repo guards runs its static half)."
+          fi
+
           if [ "$FRONTEND_TOUCHED" = "true" ] || [ "$WORKFLOWS_TOUCHED" = "true" ]; then
             echo "Frontend stack touched (or workflows changed) — enforcing frontend checks:"
             check_ran "Frontend build (Next.js)" "$R_BUILD"
```

## After applying

A PR touching only `frontend/lib/business-features.js` shows **Action map
(full guard)** running and the three `Backend tests (pytest i/3)` jobs
skipped; the CI gate log prints `OK  Action map (full guard): success`.
