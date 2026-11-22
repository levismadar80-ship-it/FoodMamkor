# MEH-3694 — tests-only and unrelated workflow-only PRs skip the heavy CI jobs

> **State: pending** (register row `meh-3694-path-filters`). Targets: `.github/workflows/pr-checks.yml`, `deploy.yml`, `e2e.yml`.
> Prepared 22/11/2026 against `origin/staging` of that day. Applied through Claude in Chrome (web editor) once the release merging on 22/11 has landed and staging is verified. Sapir approved the change 22/11 (thread «Speed up CI merges»).

## Why

There is one self-hosted runner and a full CI round takes about 1.5–2 h. Two kinds of PR paid for work that could not catch anything in their diff:

- **Workflow-only PRs.** `pr-checks.yml` and `deploy.yml` set `workflows: .github/workflows/**`, and every frontend and backend job carries `|| workflows == 'true'`. An edit to `staging-health.yml` ran build, vitest, knip, tsc, pytest, ruff, mypy, lint and the API audit. Those jobs are defined in `pr-checks.yml` / `deploy.yml`, so only an edit to that file can break them.
- **Unit-test-only PRs.** In public mode `e2e.yml` starts the suite on any `frontend/**` change, including `frontend/__tests__/**`, which the suite neither runs nor ships. (In private mode the `run-e2e` label starts it; rule 40's exemption and `pr-evidence-guard.sh` in the same PR cover that side.)

Docs-only PRs already skip every heavy job (measured on the current filters) and are unchanged.

## What changes

| File | Change |
|---|---|
| `pr-checks.yml` | `workflows` = `pr-checks.yml` only. `backend` gains `.github/**`, because pytest reads `.github`: `tests/test_meh3599_jobs_map.py` reads every workflow's cron lines and `tests/test_meh2952_is_test_guards.py` reads `.github/scripts`. So any workflow edit still runs the backend legs; it no longer runs the frontend legs unless `pr-checks.yml` itself changed. |
| `deploy.yml` | `workflows` = `deploy.yml` only (lint + static API audit are defined there). |
| `e2e.yml` | New step `unit_only` in `filter`, PR events only: when every frontend file in the diff is a unit test (`frontend/__tests__/**`, `*.test.*` outside `frontend/e2e/`), the job's `frontend` output is `false`. Push, nightly and manual runs keep the plain filter. If the step errors the job fails and `E2E gate` goes red on `R_FILTER` (fails closed). |

**Gates are not touched.** `CI gate`, `Deploy gate` and `E2E gate` already pass a leg that skipped because its stack was not touched and fail a leg that should have run; they read the same filter outputs, so they follow the narrower filters with no edit. `Staging health` reads staging runs only.

## What is no longer checked, and why nothing is lost

A workflow-only PR that does not touch `pr-checks.yml` no longer runs build / vitest / knip / tsc / ai-artifact-scan; one that does not touch `deploy.yml` no longer runs lint / api-contract. None of those reads a workflow file (grepped `frontend/__tests__`, `tests/`, the builders), so none could have failed on such a diff. The repo guards (`gate-wiring-guard.sh`, `e2e-gate-selftest.sh`, …) that do read workflow files run on every PR, unchanged.

## Checks run on the prepared files

- `git apply --check` of the diff below against staging: OK.
- `yaml.safe_load` of all three patched files: OK.
- `WF_DIR=<patched copies> bash scripts/checks/e2e-gate-selftest.sh`: GUARD PASS.
- The `unit_only` script, run on 7 diffs: `__tests__` only → true; `__tests__` + `lib/*.test.ts` + docs → true; `__tests__` + `lib/a.js` → false; `e2e/flows/a.spec.ts` → false; `e2e/x.test.ts` → false; `__tests__` + `package.json` → false; `public/x.png` → false.
- sha256 of the patched files:
  - `pr-checks.yml`: `2c697379df3ab8910ddfde99cea35dd2abcbfec9c0959f4044004ca12d837fd6`
  - `deploy.yml`: `c11ade15416dcd742b7f649a6f53034e3f2a0579540a9fd704e2ba1d3b17337f`
  - `e2e.yml`: `6040de7d90e2f0cf9c7e715311feb84376fc797a8b4f133a58caf4d5f8da3977`

## Diff

```diff
diff -ru a/.github/workflows/deploy.yml b/.github/workflows/deploy.yml
--- a/.github/workflows/deploy.yml
+++ b/.github/workflows/deploy.yml
@@ -109,8 +109,10 @@
               # --self-test) and by the static audit, both gated on this filter.
               # Without this line a PR touching only the tool skips both.
               - 'scripts/check_api_contract.py'
+            # MEH-3694 (Sapir 22/11): only THIS file — lint and the static API
+            # contract audit are defined here; no other workflow can break them.
             workflows:
-              - '.github/workflows/**'
+              - '.github/workflows/deploy.yml'
 
   # ──────────────────────────────────────────────────────────────────
   # LINT — runs on every PR and every push to main/staging.
diff -ru a/.github/workflows/e2e.yml b/.github/workflows/e2e.yml
--- a/.github/workflows/e2e.yml
+++ b/.github/workflows/e2e.yml
@@ -101,7 +101,9 @@
         actions: read
         pull-requests: read
       outputs:
-        frontend: ${{ steps.filter.outputs.frontend }}
+        # MEH-3694: on a PR, a frontend diff made only of unit tests is not a
+        # frontend change for this suite (it neither runs nor ships them).
+        frontend: ${{ steps.unit_only.outputs.only == 'true' && 'false' || steps.filter.outputs.frontend }}
         backend: ${{ steps.filter.outputs.backend }}
         nightly_unchanged: ${{ steps.nightly.outputs.unchanged }}
       steps:
@@ -183,6 +185,25 @@
                 - 'backend/pyproject.toml'
                 - 'backend/alembic.ini'
                 - 'scripts/e2e/**'
+        # MEH-3694 (Sapir 22/11): a PR whose frontend files are all vitest unit
+        # tests (frontend/__tests__/**, *.test.* outside frontend/e2e/) does not
+        # start the suite in public mode. PR only — push, nightly and manual runs
+        # keep the plain filter. Fails closed: if this step errors, the job fails
+        # and E2E gate goes red on R_FILTER. Same list as pr-evidence-guard.sh's
+        # is_unit_test_file (rule 40's exemption).
+        - name: Unit-test-only frontend diff? (MEH-3694)
+          id: unit_only
+          if: github.event_name == 'pull_request' && steps.filter.outputs.frontend == 'true'
+          run: |
+            set -euo pipefail
+            files="$(git diff --name-only HEAD^1 HEAD)"
+            [ -n "$files" ] || { echo "::error::empty diff against HEAD^1"; exit 1; }
+            rest="$(printf '%s\n' "$files" \
+              | grep -E '^(frontend/|public/|package\.json$|package-lock\.json$)' \
+              | awk '!(/^frontend\/__tests__\// || (/\.test\.(js|jsx|ts|tsx|mjs)$/ && !/^frontend\/e2e\//))' || true)"
+            if [ -z "$rest" ]; then only=true; else only=false; fi
+            echo "only=$only" >> "$GITHUB_OUTPUT"
+            echo "frontend files that are not unit tests: ${rest:-none} -> only=$only"
 
   e2e:
     # NOTE (MEH-1044): job name kept verbatim although the target is now
diff -ru a/.github/workflows/pr-checks.yml b/.github/workflows/pr-checks.yml
--- a/.github/workflows/pr-checks.yml
+++ b/.github/workflows/pr-checks.yml
@@ -250,8 +250,16 @@
               # Without this line a PR touching only the tool skips both.
               - 'scripts/check_api_contract.py'
               - 'Dockerfile'
+              # MEH-3694: pytest reads .github itself — tests/test_meh3599_jobs_map.py
+              # reads every workflow's cron lines, tests/test_meh2952_is_test_guards.py
+              # reads .github/scripts. So any .github change still runs the backend legs.
+              - '.github/**'
+            # MEH-3694 (Sapir 22/11): only THIS file. The frontend/backend jobs
+            # below are defined here, so an edit here can break them; an edit to
+            # e2e.yml, staging-health.yml or any other workflow cannot. Before,
+            # every workflow-only PR paid for build + vitest + knip + tsc.
             workflows:
-              - '.github/workflows/**'
+              - '.github/workflows/pr-checks.yml'
             # MEH-1585: mirrors dependency-audit.yml's backend manifests exactly.
             # If the two lists diverge the gate silently stops covering a manifest.
             deps:
```
