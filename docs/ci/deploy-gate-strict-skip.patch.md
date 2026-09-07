# MEH-1742 item 2 — `Deploy gate (required)` has the same skip-green as `E2E gate`

**Staged for the workflow-token session / Sapir.** `.github/workflows/**` is
CC-deny (MEH-671). This is the second instance the card's scope item 2 ("סקירת
שאר ה-gates באותו קובץ לאותה חולשה") asked for, found by auditing all three
aggregators on `origin/staging` on 04/09:

| workflow | aggregator | `skipped` handling | verdict |
|---|---|---|---|
| `pr-checks.yml:823-870` | `CI gate (required)` | `ok()` for scope-conditional jobs **and** `strict_ok`/`check_ran` for every job the paths filter says must run (MEH-1582) | ✅ already strict |
| `e2e.yml:577` | `E2E gate` | `ok() { case "$1" in success\|skipped) return 0` — no reason read | ❌ staged in `docs/ci/e2e-gate-strict-skip.patch.md` (#2866), **not yet applied** — measured today, the line is unchanged |
| `deploy.yml:394` | `Deploy gate (required)` | same `ok()` — no reason read | ❌ **this patch** |

`Deploy gate (required)` is one of the **two contexts ruleset 15240090
actually requires**, so this instance carries more weight than the E2E one:
a frontend PR whose `lint` job skipped for any reason other than "no frontend
files changed" reads as `OK  Frontend lint: skipped` and the required gate
goes green with lint never having run.

## The signal is already there — `changes` outputs, unread by the gate

`deploy.yml:87-93` exposes `needs.changes.outputs.frontend` / `.backend` (and
`.workflows`, used by the `if:` on both jobs at `:120` and `:157`). The jobs'
own `if:` is the ground truth of when they are supposed to run:

```
lint:                 (frontend || workflows) && not draft
api-contract-static:  (frontend || backend || workflows) && not draft
```

So the gate can require `success` under exactly those conditions and accept
`skipped` only outside them. Same `strict_ok` / `check_ran` pair MEH-1582
landed in `pr-checks.yml:852-870`, copied verbatim so there is one predicate
shape in the repo, not two.

## The diff — `deploy.yml`, the `deploy-gate` job only

```diff
       - name: Aggregate deploy-side required checks
         env:
           R_CHANGES: ${{ needs.changes.result }}
           R_LINT: ${{ needs.lint.result }}
           R_API_CONTRACT: ${{ needs.api-contract-static.result }}
+          FRONTEND_TOUCHED: ${{ needs.changes.outputs.frontend }}
+          BACKEND_TOUCHED: ${{ needs.changes.outputs.backend }}
+          WORKFLOWS_TOUCHED: ${{ needs.changes.outputs.workflows }}
+          IS_DRAFT: ${{ github.event_name == 'pull_request' && github.event.pull_request.draft == true }}
         run: |
           set -euo pipefail
           fail=0
           ok() { case "$1" in success|skipped) return 0 ;; *) return 1 ;; esac; }
           check() { if ok "$2"; then echo "  OK  $1: $2"; else echo "  FAIL $1: $2"; fail=1; fi; }
+
+          # MEH-1742 (second instance of MEH-1582's skip-green): a job this gate
+          # is actively enforcing must have RUN. `skipped` is an absence of
+          # evidence, not a pass — the reason has to come from the paths filter.
+          strict_ok() { case "$1" in success) return 0 ;; *) return 1 ;; esac; }
+          check_ran() {
+            if strict_ok "$2"; then echo "  OK  $1: $2"
+            else echo "  FAIL $1: $2 (required job did not run — 'skipped' is not a pass)"; fail=1; fi
+          }

           if ! ok "$R_CHANGES"; then
             echo "::error::Paths-filter job did not succeed (result=$R_CHANGES)."
             exit 1
           fi

-          check "Frontend lint (RTL + Next.js rules)" "$R_LINT"
-          check "API contract audit (static)" "$R_API_CONTRACT"
+          echo "Stack touched -> frontend=$FRONTEND_TOUCHED backend=$BACKEND_TOUCHED workflows=$WORKFLOWS_TOUCHED draft=$IS_DRAFT"
+
+          # Mirror each job's own `if:` (deploy.yml lint:120, api-contract-static:157).
+          # On a draft the jobs are suppressed by design and the gate stays
+          # lenient — the same posture pr-checks takes; a draft's green is
+          # already documented as skip-green (workflow.md rule 21).
+          if [ "$IS_DRAFT" != "true" ] && { [ "$FRONTEND_TOUCHED" = "true" ] || [ "$WORKFLOWS_TOUCHED" = "true" ]; }; then
+            check_ran "Frontend lint (RTL + Next.js rules)" "$R_LINT"
+          else
+            check "Frontend lint (RTL + Next.js rules)" "$R_LINT"
+          fi
+          if [ "$IS_DRAFT" != "true" ] && { [ "$FRONTEND_TOUCHED" = "true" ] || [ "$BACKEND_TOUCHED" = "true" ] || [ "$WORKFLOWS_TOUCHED" = "true" ]; }; then
+            check_ran "API contract audit (static)" "$R_API_CONTRACT"
+          else
+            check "API contract audit (static)" "$R_API_CONTRACT"
+          fi

           if [ "$fail" -ne 0 ]; then
             echo "::error::Deploy gate failed — a deploy-side required check failed."
             exit 1
           fi
           echo "Deploy gate passed."
```

Confirm before pasting that the `changes` job exposes a `workflows` output
(`:91-93` lists `frontend` and `backend`; the `if:` at `:120` reads
`needs.changes.outputs.workflows`, so either it exists further down the
`outputs:` block or the `if:` is already reading an empty string — check the
live file, this doc read only the grep).

## Discrimination, before it lands (MEH-1619 / MEH-1742's own rule)

| scenario | OLD | NEW |
|---|---|---|
| A frontend PR, `lint` skipped, not draft, no known cause | GREEN | **RED** |
| B docs-only PR (`frontend=false`, `backend=false`), both jobs skipped | GREEN | GREEN |
| C frontend PR, both jobs ran and passed | GREEN | GREEN |
| D draft frontend PR, jobs draft-suppressed | GREEN | GREEN (lenient by design) |
| E backend-only PR, `api-contract-static` skipped, not draft | GREEN | **RED** |

A and E are the bug; B, C and D must stay green under both predicates.
`scripts/e2e-gate-selftest.sh` already reproduces exactly this
`ok`-vs-`check_ran` split locally for the E2E aggregator; the predicate here
is the same function, so no second harness is added — one predicate, one
self-test.

## Not touched, on purpose

- `cancelled` handling (MEH-1907's `is_cancelled` in `pr-checks.yml`) is not
  added here: `deploy.yml` has no concurrency group cancelling in-progress
  runs, so a `cancelled` there is a real cancellation, not a supersession.
- `.claude/rules/testing.md` already carries the CI-aggregator instance of
  "a green with two possible causes is not a signal" (added by #2866);
  nothing to add.
