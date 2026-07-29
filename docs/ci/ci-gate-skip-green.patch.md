# `CI gate` — skip-green fix (MEH-1582)

`.github/workflows/**` is **CC-deny (MEH-671)**, so Claude Code cannot apply this
itself. This doc is the exact edit for **Sapir** to make in
`.github/workflows/pr-checks.yml`.

Same shape as [`docs/ci/e2e-gate.patch.md`](./e2e-gate.patch.md) and
[`docs/ci/repo-guards.patch.md`](./repo-guards.patch.md).

---

## 1 · Root cause — one function, `pr-checks.yml:697-702`

```bash
ok() {
  case "$1" in
    success|skipped) return 0 ;;   # <-- `skipped` counts as a pass
    *) return 1 ;;
  esac
}
```

`skipped` passing is **correct** for one reason and **wrong** for another, and the
current code cannot tell them apart:

| Why a job skipped | Should the gate pass? | Today |
|---|---|---|
| Paths-filter says the stack is untouched (docs-only PR) | ✅ yes — nothing to check | passes ✅ |
| The PR is a **draft**, so the job was suppressed to save CI | ❌ **no — nothing ran** | passes ❌ |

Six jobs carry `github.event.pull_request.draft == false` in their `if:` and are
therefore suppressed on every draft PR:

| Job | Line |
|---|---|
| `build` — Frontend build (Next.js) | `pr-checks.yml:166` |
| `ai-artifact-scan` — AI artifact scan | `pr-checks.yml:217` |
| `pytest` — Backend tests | `pr-checks.yml:284` |
| `lint-backend` — Backend lint (ruff) | `pr-checks.yml:436` |
| `env-drift` — Env drift (.env.example) | `pr-checks.yml:482` |
| `frontend-vitest` — Frontend unit tests | `pr-checks.yml:608` |

On a **draft PR that touches the frontend**, `needs.changes.outputs.frontend` is
`'true'`, so the gate enters the *"Frontend stack touched — enforcing frontend
checks"* branch (`:734`) and then accepts `skipped` for every one of them.
**`CI gate (required)` reports `success` with zero jobs having run.** That is the
MEH-1568 / PR #2188 observation, reproduced from the source rather than the
symptom.

> The three warn-only jobs (`backend-mypy` `:515`, `frontend-knip` `:546`,
> `frontend-tsc-strict` `:581`) have **no** draft condition — they run on drafts.
> They are not part of the hole and this patch leaves them lenient.

### 1.1 · The second hypothesis in the ticket — corrected

The ticket asks *"why didn't `ready_for_review` fire a run — is the type
missing?"* **It is not missing.** `pr-checks.yml:27` already reads:

```yaml
    types: [opened, synchronize, reopened, ready_for_review]
```

So the trigger is present and the ticket's hypothesis #1 is **not** the cause. The
remaining candidate is the repo's known token-actor rule — a PR opened or flipped
to ready via `GITHUB_TOKEN` does not start workflow runs (**MEH-1501**; same
mechanism already documented for VRT baselines in
`.claude/rules/testing.md`). **I have not proven that**, and this patch does not
depend on it — see §3.

---

## 2 · The edit

In the `ci-gate` step `Aggregate required-check results`
(`pr-checks.yml:694` onward), add a second, strict predicate and use it for the
jobs that were *supposed to run*.

**Add** after the existing `ok()` (`:702`):

```bash
          # MEH-1582: a job that the gate is actively enforcing must have RUN.
          # `skipped` there means a draft suppressed it (or a future `if:` did) —
          # that is an absence of evidence, not a pass.
          strict_ok() {
            case "$1" in
              success) return 0 ;;
              *) return 1 ;;
            esac
          }

          check_ran() {
            if strict_ok "$2"; then
              echo "  OK  $1: $2"
            else
              echo "  FAIL $1: $2 (required job did not run — 'skipped' is not a pass)"
              fail=1
            fi
          }
```

**Then swap `check` → `check_ran` on exactly these eight lines**, leaving the
three warn-only jobs on `check`:

```diff
           echo "Always required (stack-independent):"
-          check "DO-NOT-MERGE marker gate" "$R_DNM"
-          check "qa-artifacts size cap" "$R_QA_SIZE"
-          check "Repo guards" "$R_REPO_GUARDS"
-          check "Env drift (.env.example)" "$R_ENV_DRIFT"
+          check_ran "DO-NOT-MERGE marker gate" "$R_DNM"
+          check_ran "qa-artifacts size cap" "$R_QA_SIZE"
+          check_ran "Repo guards" "$R_REPO_GUARDS"
+          check_ran "Env drift (.env.example)" "$R_ENV_DRIFT"

           if [ "$BACKEND_TOUCHED" = "true" ]; then
             echo "Backend stack touched — enforcing backend checks:"
-            check "Backend tests (pytest)" "$R_PYTEST"
-            check "Backend lint (ruff)" "$R_LINT_BACKEND"
+            check_ran "Backend tests (pytest)" "$R_PYTEST"
+            check_ran "Backend lint (ruff)" "$R_LINT_BACKEND"
             check "Backend mypy (strict, warn-only)" "$R_BACKEND_MYPY"

           if [ "$FRONTEND_TOUCHED" = "true" ]; then
             echo "Frontend stack touched — enforcing frontend checks:"
-            check "Frontend build (Next.js)" "$R_BUILD"
-            check "AI artifact scan (MEH-449)" "$R_AI_SCAN"
+            check_ran "Frontend build (Next.js)" "$R_BUILD"
+            check_ran "AI artifact scan (MEH-449)" "$R_AI_SCAN"
             check "Frontend Knip (warn-only)" "$R_FRONTEND_KNIP"
             check "Frontend tsc strict (warn-only)" "$R_FRONTEND_TSC"
-            check "Frontend unit tests (vitest)" "$R_FRONTEND_VITEST"
+            check_ran "Frontend unit tests (vitest)" "$R_FRONTEND_VITEST"
```

`ok()` itself is **unchanged** and still used by the `$R_CHANGES` guard at `:715`
and by the three warn-only checks. Nothing outside the `ci-gate` step is touched.

### 2.1 · Why the always-required four become strict too

`do-not-merge-gate`, `qa-artifacts-size` and `repo-guards` carry no `if:` today,
so they cannot skip and the swap is a no-op for them **right now**. It is there so
that the day someone adds an `if:` to one of them, the gate says so instead of
silently self-disabling — the exact class MEH-1030 closed for guarded registries.
`env-drift` is different: it **is** draft-gated (`:482`) and this line is a live
fix, not a precaution.

---

## 3 · What this buys, including if hypothesis #1 is never solved

The fix is deliberately independent of *why* a run didn't happen:

- **Draft PR** → jobs skipped → gate now **RED**. A draft cannot be merged anyway,
  and auto-merge cannot be armed on one, so a red gate here costs nothing.
- **draft → ready fires a run** → jobs execute → gate goes green normally.
- **draft → ready does *not* fire a run** (the MEH-1501 token case) → the stale
  RED from the draft run **persists and blocks merge**, instead of a stale green
  waving it through.

That last row is the point. Today the failure mode is *fail-open*; after this edit
it is *fail-closed*, whether or not the trigger question is ever answered.

---

## 4 · Proof — failing-by-construction, and it discriminates

Per `.claude/rules/testing.md` ("Every new guard test must be shown failing" ·
MEH-1619), the run below feeds the **real** aggregator logic three synthetic
scenarios under both the old and the new predicate. A construction that only
showed "I broke it and it went red" would prove nothing unless the *old* logic
passes the same input — so the table reports both columns.

Harness: `scripts/ci-gate-selftest.sh` (added in this PR, runnable locally, no
workflow edit needed).

> It is deliberately **not** in `scripts/checks/`. That directory is
> auto-discovered by the required *Repo guards* job (`run-all.sh:97-113`), and a
> guard reporting the not-yet-applied state would red every PR until Sapir
> applies the patch. It can be promoted there afterwards.

```
SCENARIO                                   OLD gate     NEW gate
A draft FE PR, all checks skipped          GREEN        RED
B docs-only, stack untouched               GREEN        GREEN
C non-draft FE PR, everything ran          GREEN        GREEN

SELF-TEST PASS — the change discriminates exactly scenario A.
```

- **A** is the bug: old passes, new fails. This is the discriminating case.
- **B** is the legitimate docs-only skip the lenient `ok()` exists for — it must
  **not** regress, and does not.
- **C** is an ordinary healthy PR — unchanged.

Scenario C mirrors a real observed run: PR #2412, head `feature/meh-1758-…`,
non-draft, frontend-only. Its backend jobs report `skipped` because the backend
stack is untouched, and under this patch it still passes — confirming the patch
does not red ordinary PRs.

---

## 5 · DoD mapping (ticket §DoD)

- [x] **Root cause with file:line** — `pr-checks.yml:697-702`, six draft-gated
      jobs at `:166 :217 :284 :436 :482 :608`.
- [x] **Patch file in `docs/ci/`** — this file.
- [x] **Hypothesis #1 corrected** — `ready_for_review` is present at `:27`; the
      ticket's premise was wrong (§1.1).
- [ ] **After Sapir applies:** draft→ready fires a full run — *still unverified,
      needs a live test PR; MEH-1501 is the open candidate.*
- [x] **Gate fails when a required job is skipped** — proven above; live
      confirmation pending application.

---

## 6 · How to verify after applying

1. Open a throwaway draft PR touching one frontend file.
2. `CI gate (required)` must now report **failure** with
   `FAIL Frontend build (Next.js): skipped (required job did not run …)`.
3. Mark it ready for review. A full run must fire and the gate must go green.
   **If no run fires on ready** — that is MEH-1501, the gate correctly stays red,
   and the trigger question moves to that ticket.
4. Confirm a docs-only PR still merges green (scenario B).
