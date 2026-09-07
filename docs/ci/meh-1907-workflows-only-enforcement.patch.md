> **Status: APPLIED — on `staging` since #3240 merged 2026-09-01 11:49Z (`ef64d29d`). Re-verified 2026-09-06 (drain כט'): `pr-checks.yml:933` `WORKFLOWS_TOUCHED: ${{ needs.changes.outputs.workflows }}` · `:1001` summary line prints `workflows=$WORKFLOWS_TOUCHED`; both enforcement branches read the union. Historical record below.** _(This line previously read "not yet on `staging`. as-of 2026-09-01" — true then, stale since the same day.)_
> Evidence: job `99811633641` (run `33493134235`) printed
> `Stack touched -> frontend=false backend=false workflows=true`
> and enforced eight frontend/backend legs on a workflows-only diff.
> Option A was chosen; the draft-guard mirror (Option B) was NOT applied —
> see MEH-2227 §4ז for why. `pip-audit` deliberately left unenforced: its own
> `if:` is deps-only, so widening the gate would demand a leg that never ran.

# MEH-1907 F-1 — `ci-gate` runs the suite on a workflows-only PR and enforces none of it

`.github/workflows/**` is CC-deny (**MEH-671**), so Claude Code cannot apply this.
This is the exact diff for **Sapir**. Sibling of
[`pr-checks-cancelled-not-failure.patch.md`](./pr-checks-cancelled-not-failure.patch.md)
(applied 31/08) — same job, same step, non-overlapping hunks.

---

## The defect

The jobs and the aggregator disagree about what "touched" means.

| | condition |
| -- | -- |
| **Every frontend/backend job's `if:`** | `(frontend == 'true' \|\| workflows == 'true') && …` |
| **The aggregator's enforcement branches** (`:808`, `:827`) | `[ "$FRONTEND_TOUCHED" = "true" ]` / `BACKEND_TOUCHED` — **no `workflows`** |

`workflows` is produced by the paths filter (`:143`) and passed to every job, but
**it is never passed into the `ci-gate` step's `env:` block at all** (`:727-743`).
The aggregator cannot see it.

So on a PR touching only `.github/workflows/**`:

1. every frontend and backend job **runs** — the `|| workflows == 'true'` half fires;
2. `FRONTEND_TOUCHED` and `BACKEND_TOUCHED` are both `false`;
3. neither enforcement branch is taken;
4. execution reaches `:838-839` and prints *"Neither stack touched (workflows-only /
   docs-only) — only env-drift enforced."*

**The full suite is paid for and none of its results are read.** A genuinely failing
`pytest`, `vitest`, `build` or `AI artifact scan` leaves `CI gate` **green**.

### Measured, not inferred

**PR #3201**, run `33393441365`, 31/08. Diff: exactly one file,
`.github/workflows/cls-measure.yml` (`actions/upload-artifact@v4 → @v7`).

```
Frontend unit tests (vitest)   cancelled     12:46:56 → 12:57:12
Frontend build (Next.js)       success
AI artifact scan (build output) success
Backend tests (pytest)         success
CI gate (required)             success       13:00:05 → 13:00:09
```

`R_FRONTEND_VITEST` was `cancelled` and **was never read** — `:833` sits inside a
branch that was not taken.

> ### ⚠️ This corrects MEH-1907's own evidence line
>
> The ticket cites #3201 as an instance of `cancelled → FAIL`. It is not. The gate
> did not map that cancellation to anything; it never looked. The `cancelled → FAIL`
> mapping was real in the code (and is now fixed, 31/08) but **#3201 was never an
> instance of it**, and after that fix it is not an instance of anything — the same
> PR today would still go green by this hole.

### Why this one matters more than its size suggests

`.github/workflows/**` is the highest-blast-radius path in the repo — it is where
every gate, every deploy trigger and every secret reference lives, and it is the one
directory CC is denied from editing precisely because of that. It is the **only**
path class whose PRs run the full suite and enforce nothing.

Compare the two neighbouring cases, which are both correct:

| PR class | jobs | enforced | verdict |
| -- | -- | -- | -- |
| docs-only | **skipped** (the `if:` is false) | nothing | ✅ consistent — nothing ran, nothing claimed |
| frontend / backend | run | enforced | ✅ consistent |
| **workflows-only** | **run** | **nothing** | ❌ **the hole** |

### Scope — `deploy.yml` does NOT share it

Checked, so nobody patches a file that is already correct. `deploy.yml`'s `lint`
carries the same `|| workflows == 'true'` (`deploy.yml:120`), but `deploy-gate`
(`:379-409`) has **no stack-conditional branch** — it runs
`check "Frontend lint …"` and `check "API contract audit …"` unconditionally. A job
that runs and fails is therefore always seen. **`ci-gate` is the only affected
aggregator, and its two branches are the only affected lines.**

---

## Hunk 1 — pass `workflows` into the step (required)

```diff
       - name: Aggregate required-check results
         env:
           FRONTEND_TOUCHED: ${{ needs.changes.outputs.frontend }}
           BACKEND_TOUCHED: ${{ needs.changes.outputs.backend }}
+          # MEH-1907 F-1: every frontend/backend job's `if:` is
+          # `(<stack> == 'true' || workflows == 'true')`, so a workflows-only PR
+          # RUNS the whole suite. Without this variable the aggregator could not
+          # see that, took neither enforcement branch, and reported success
+          # having read nothing. Measured on PR #3201 (run 33393441365): vitest
+          # `cancelled`, CI gate `success`.
+          WORKFLOWS_TOUCHED: ${{ needs.changes.outputs.workflows }}
           R_CHANGES: ${{ needs.changes.result }}
```

## Hunk 2 — make the summary line say what was actually measured

```diff
-          echo "Stack touched -> frontend=$FRONTEND_TOUCHED backend=$BACKEND_TOUCHED"
+          echo "Stack touched -> frontend=$FRONTEND_TOUCHED backend=$BACKEND_TOUCHED workflows=$WORKFLOWS_TOUCHED"
```

Not cosmetic. This line is the only place a reader can tell **which** branches the
run was about to take, and it currently omits the variable that decides whether the
suite's results count.

## Hunk 3 — enforce the backend legs when a workflow changed

```diff
-          if [ "$BACKEND_TOUCHED" = "true" ]; then
+          # MEH-1907 F-1: mirror the JOBS' own `if:` — they run on
+          # `backend || workflows`, so enforcement must read the same union.
+          # Any divergence here is a job that runs and is not counted.
+          if [ "$BACKEND_TOUCHED" = "true" ] || [ "$WORKFLOWS_TOUCHED" = "true" ]; then
             echo "Backend stack touched — enforcing backend checks:"
```

## Hunk 4 — same for the frontend legs

```diff
-          if [ "$FRONTEND_TOUCHED" = "true" ]; then
+          # MEH-1907 F-1: mirror the JOBS' own `if:` (frontend || workflows).
+          if [ "$FRONTEND_TOUCHED" = "true" ] || [ "$WORKFLOWS_TOUCHED" = "true" ]; then
             echo "Frontend stack touched — enforcing frontend checks:"
```

## Hunk 5 — stop the fall-through message from lying

```diff
-          if [ "$BACKEND_TOUCHED" != "true" ] && [ "$FRONTEND_TOUCHED" != "true" ]; then
-            echo "Neither stack touched (workflows-only / docs-only) — only env-drift enforced."
+          if [ "$BACKEND_TOUCHED" != "true" ] && [ "$FRONTEND_TOUCHED" != "true" ] \
+             && [ "$WORKFLOWS_TOUCHED" != "true" ]; then
+            echo "Neither stack touched (docs-only) — only the stack-independent legs enforced."
           fi
```

The old text named **workflows-only** as a case where only `env-drift` is enforced.
After hunks 3–4 that is false, and leaving it would document the bug as the design.

---

## Do NOT change the `deps` branch

`:820`'s `DEPS_TOUCHED` is correct as-is and is **not** the same shape.
`pip-audit`'s `if:` is `needs.changes.outputs.deps == 'true' && …` — it carries **no**
`|| workflows` clause, so the job does not run on a workflows-only PR and enforcement
correctly does not expect it. MEH-1585's comment above that branch already explains
this. Widening it would demand a job that never ran.

---

## Cost

**Zero additional CI minutes.** Every job this makes the gate read is a job that
**already runs today** on exactly these PRs. The change reads results that are
already being produced and paid for. Given MEH-2212's cost work, that is the
argument for applying it now rather than as part of a larger cleanup: it makes the
existing spend *count* instead of adding to it.

---

## Risk — one real consequence, named

**A workflows-only PR can now go red where it previously went green.** That is the
point, but it is a behaviour change on a required context, so expect it.

**The sharp edge — drafts.** Every leg widened here is `check_ran`, and `check_ran`
treats `skipped` as failure (MEH-1582). Six of the widened jobs also carry
`&& github.event.pull_request.draft == false`, so on a **draft workflows-only PR**
they skip, and after this patch the gate will demand them → **stranded red**, the
PR #2794 class documented in `.claude/rules/workflow.md` rule 21. A re-run does not
clear it (a re-run replays the original `draft: true` payload); only a real push does.

Two ways to take it:

- **Option A — apply hunks 1–5 as written (recommended).** The stranding is
  reachable only for a **draft** workflows-only PR. Rule 21 already instructs opening
  PRs non-draft for exactly this reason, and the class already exists today for draft
  frontend and backend PRs — this does not create it, it extends it by one path.
- **Option B — additionally mirror the draft guard**, so enforcement tracks each
  job's full `if:` rather than half of it:

  ```diff
  +          IS_DRAFT: ${{ github.event.pull_request.draft }}
  ```
  and require `[ "$IS_DRAFT" != "true" ]` in both widened conditions. This also
  removes the **existing** #2794 stranding for the frontend and backend branches.
  It is strictly more correct and strictly larger, and it changes behaviour for
  drafts that are red today. **That is a separate decision from F-1** — take it only
  deliberately, not as a rider.

**Recommendation: A now, B as its own change if you want the draft class closed.**

---

## Verification before applying — the discrimination run this needs

`scripts/ci-gate-cancelled-selftest.sh` does **not** cover this. It exercises one
leg (`R_REPO_GUARDS`) through a local reproduction of the predicates; F-1 is about
which **branch** is entered, which that harness does not model at all.

Per MEH-1619 the patch needs its own two-run control, and unlike the cancelled fix
this one is cheap to observe because it needs **no race**:

1. Branch off `staging`, change **only** a `.github/workflows/**` file, and
   deliberately break a frontend test in the same PR.
   - **Before:** `CI gate` green, log reads *"Neither stack touched"*.
   - **After:** `CI gate` red, log reads *"Frontend stack touched — enforcing …"*
     and names the failing leg.
2. Restore the test, same PR. Gate goes green with the enforcing line still present
   — proving it went green because the legs passed, not because the branch was
   skipped.

Both observations belong in the applying PR's body. **A gate never observed biting
is untested wiring** (MEH-1585).

---

## Not covered by this patch — recorded so it is not mistaken for fixed

- **`Branch name gate` and `Linear mention guard` are absent from `ci-gate`'s
  `needs:`** (`:707-721`), so their results reach no required context and cannot
  block a merge. `Branch name gate` enforces the MEH-1141 locked convention.
  Deliberately out of scope here — adding a leg is a different decision from fixing
  a branch condition.
- **`skills-audit.yml`, `e2e.yml`, `claude-review.yml`, `i18n-icu-parity.yml`,
  `dependency-audit.yml`** are whole workflows with no required context. A red
  `skills-audit` — the MEH-397 supply-chain gate — does not block a merge.
- **`backend-mypy`, `frontend-knip`, `frontend-tsc-strict`** carry job-level
  `continue-on-error: true` **plus** a step-level `|| true` (`:517-523`), so the
  three `check` calls on them can only ever print `OK`. Intentional warn-only
  design, not a defect — but after this patch they will be reached on
  workflows-only PRs too, and they will still be decoration there.

_Source: `pr-checks.yml` read verbatim at the 31/08 post-cancelled-fix SHA
(`:707-845`) · `deploy.yml:87-120`, `:379-409` · PR #3201 run `33393441365` and its
one-file diff · full Phase 0 report in the MEH-1907 description._
