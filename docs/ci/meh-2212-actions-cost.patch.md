# MEH-2212 — Actions cost reduction · workflow patch

`.github/workflows/**` is CC-deny (**MEH-671**), so Claude Code cannot apply any
of this. This document is the exact YAML for **Sapir** to paste, one section per
workflow file. Same shape as
[`docs/ci/e2e-gate.patch.md`](./e2e-gate.patch.md) and
[`docs/ci/repo-guards.patch.md`](./repo-guards.patch.md).

Source: MEH-2212 § *תכנית הצמצום* (6 rows). This doc implements those 6 rows —
and where the live repo already satisfies a row, or satisfies it better than the
row prescribes, it says so instead of prescribing a redundant edit.

---

## ⚠️ קראי קודם — ארבעה סעיפים מתוך השישה כבר קיימים בריפו, במלואם או ברובם

| # | מה הכרטיס ביקש | מה נמדד בפועל |
| -- | -- | -- |
| 1 | להוסיף `concurrency` לכל workflow של PR | **כבר קיים בכל 7 ה-workflows המופעלים ע"י PR.** נשאר רק ה-ref guard |
| 2 | לאחד 4 jobs זעירים | 3 מהם מתאחדים ⇒ **חיסכון נמדד 2 דק'/ריצה**. הרביעי (`AI artifact scan`) **לא יכול** להצטרף — ראי §2 |
| 4 | `retention-days: 3` | **כל 5 ה-uploads כבר נושאים `retention-days`** (4×7, 1×30). אף אחד לא על ברירת המחדל 90 |
| 5 | דילוג על drafts | **7 jobs כבר נושאים `draft == false`.** הוספה לעוד jobs **תשבור PRs** — ראי §5 |
| 6 | `actions/cache@v4` לפי hash של lockfile | **caching כבר מלא** (`setup-node cache: npm` + `setup-uv enable-cache`, שניהם keyed על ה-lockfile). `@v4` יהיה **הורדת גרסה** — הריפו על `@v6` |

**הפריט עם החיסכון הגדול ביותר לא נמצא ברשימת הכרטיס כלל:** `AI artifact scan`
מריץ `npm ci` + `npm run build` **מלאים בפעם השנייה**, כפילות מדויקת של job
`Frontend build`. איחודו לתוך ה-build (§2ב) שווה יותר מכל שאר הסעיפים יחד ב-PR
של frontend.

---

## Measurement method — and its limits

**Measured**, not estimated, unless a line says "estimate".

Billing model (per MEH-2212 and GitHub Docs): a private-repo run is billed
**per job, each job rounded UP to a whole minute**. So a 4-second job costs the
same as a 59-second one. Every "minutes saved" figure below is therefore a count
of **jobs eliminated**, not of seconds saved — which is why merging 3-second
gates is worth real money and shaving 10 seconds off one job is worth nothing.

**Source runs** (both `pr-checks.yml`, both `pull_request`, both 2026-08-31,
read via the Actions API `list_workflow_jobs`, job-level `started_at` →
`completed_at`):

| | run | branch | stack |
| -- | -- | -- | -- |
| **A** | [`33403085367`](https://github.com/levismadar80-ship-it/FoodMamkor/actions/runs/33403085367) | `feature/meh-2020-slug-charset` | backend-only |
| **B** | [`33407229800`](https://github.com/levismadar80-ship-it/FoodMamkor/actions/runs/33407229800) | `feature/meh-2236-arabic-letter-class` | backend-only |

| Job | A | B | billed A | billed B |
| -- | --: | --: | --: | --: |
| Branch name gate | 4s | 5s | 1 | 1 |
| DO-NOT-MERGE marker gate | 4s | 4s | 1 | 1 |
| Paths filter | 14s | 13s | 1 | 1 |
| Env drift (.env.example) | 13s | 12s | 1 | 1 |
| qa-artifacts size cap | 21s | 20s | 1 | 1 |
| Repo guards | 22s | 26s | 1 | 1 |
| Backend lint (ruff) | 20s | 24s | 1 | 1 |
| Backend mypy (warn-only) | 32s | 32s | 1 | 1 |
| Backend tests (pytest) | 12m19s | 13m15s | 13 | 14 |
| CI gate (required) | 4s | 4s | 1 | 1 |
| 7 skipped frontend/deps jobs | — | — | 0 | 0 |
| **TOTAL** | | | **22** | **23** |

> **⚠️ The two limits on this table, stated so nobody reads past them.**
>
> 1. **Both sampled runs are backend-only.** `Frontend build`, `AI artifact
>    scan`, `Frontend unit tests (vitest)`, `Knip` and `tsc strict` reported
>    `skipped` in *both*, so **their durations are NOT measured here.** Every
>    frontend figure below is labelled **estimate** and derived from the
>    workflow's own `timeout-minutes` plus the 9.5-min vitest figure MEH-2194
>    measured. Re-measure on a frontend PR before sizing a spending limit on it.
> 2. **`get_workflow_run_usage` returns `total_ms: 0` for every job in both
>    runs.** That is not an error and not a free run — the repo was **public**
>    when they executed, and GitHub bills public-repo standard runners at zero.
>    The billed column above is therefore *derived* (wall-clock, rounded up per
>    job), not read off the billing API. Once the repo is private the same call
>    will return real values; re-run it then rather than trusting this
>    derivation.

**E2E measured separately** (`e2e.yml`, run-level wall-clock, `pull_request`,
2026-08-31): real executions **17.1 / 17.2 / 21.2 min**; runs whose paths-filter
skipped the suite **0.5–0.6 min**. Per-job breakdown inside those runs was not
fetched — treat any split of that total as **estimate**.

---

## 1 · `concurrency` with a deploy-branch ref guard

### The block to apply

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.head_ref || github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/staging' && github.ref != 'refs/heads/main' }}
```

### ⚠️ Status: concurrency already exists on **all 7** PR-triggered workflows

This row of the card is written as if the repo had none. It has them everywhere,
and they are **measurably firing** — of the 12 most recent `e2e.yml`
`pull_request` runs, **5 report `cancelled`**, including three that had already
burned 17.1 / 17.2 / 21.2 minutes. So the card's premise ("the old run keeps
running and billing") is already false for cancellation; what the runs show is
concurrency working.

| Workflow | PR-triggered | also `push:` | current `cancel-in-progress` | action |
| -- | -- | -- | -- | -- |
| `pr-checks.yml` | ✅ | — | `true` | **ref guard = defensive no-op.** Apply for uniformity only |
| `deploy.yml` | ✅ | `main`, `staging` | per-job: `true` on lint/api-contract, **`false`** on deploy jobs | **apply to the two `true` jobs** |
| `e2e.yml` | ✅ | `staging` | `true`, group keyed on `run_id` | **⚠️ read §1ג — the guard is load-bearing here** |
| `claude-review.yml` | ✅ | — | `true` | apply (cosmetic) |
| `dependency-audit.yml` | ✅ | — | `true` | apply (cosmetic) |
| `i18n-icu-parity.yml` | ✅ | — | `true` | apply (cosmetic) |
| `skills-audit.yml` | ✅ | — | `true` | apply (cosmetic) |

Not PR-triggered, so **out of scope for this row** — do not add the block:
`changelog.yml` (push staging), `post-merge-lock-check.yml` (push staging),
`stale.yml` (cron), `cls-measure.yml` (dispatch), `vrt-update.yml` (dispatch),
`staging-smoke.yml` (has its own serialized `cancel-in-progress: false`).

### 1א · `pr-checks.yml` — why the ref guard changes nothing here

Live (`pr-checks.yml:36-41`), keep the MEH-1653 comment:

```diff
 concurrency:
   # MEH-1653: ready_for_review מקבל group נפרד כדי שלא יבטל ריצת synchronize
   # שבאוויר. ריצה מבוטלת מדווחת cancelled, וה-aggregator ממפה cancelled ל-FAIL —
   # אודם שקרי. GitHub Support על אותה מחלקה: community discussion #77942.
   group: ${{ github.workflow }}-${{ github.head_ref || github.ref }}-${{ github.event.action == 'ready_for_review' }}
-  cancel-in-progress: true
+  # MEH-2212: deploy-branch guard. On this workflow it is a NO-OP by
+  # construction — the triggers are pull_request + workflow_dispatch only
+  # (:26-27), so github.ref is refs/pull/N/merge and never refs/heads/staging.
+  # Applied anyway so all seven PR workflows carry one identical block and a
+  # future `push:` trigger cannot silently re-introduce the e2e.yml hazard.
+  cancel-in-progress: ${{ github.ref != 'refs/heads/staging' && github.ref != 'refs/heads/main' }}
```

**Why it matters here: it does not, today.** Stated plainly rather than dressed
up — `pr-checks.yml` has no `push:` trigger, so the guard can never evaluate
false. Its only value is that adding `push: [staging]` later would otherwise
start cancelling post-merge runs with nothing to catch it.

**Do NOT drop the `ready_for_review` suffix on the group.** It is MEH-1653 and
unrelated to cost: without it a draft→ready flip cancels the in-flight
`synchronize` run, the aggregator maps `cancelled → FAIL`, and the PR goes red
for no reason (workflow rule 21).

### 1ב · `deploy.yml` — the guard protects a Railway redeploy

`deploy.yml` uses **per-job** concurrency (MEH-485), and the deploy jobs already
get this right: `production` (`:187-189`) and `staging` (`:275-277`) are already
`cancel-in-progress: false`, with the comment *"data integrity — back-to-back
main pushes serialize, never abort"*. **Do not touch those two.**

Only the two CI-shaped jobs need the guard:

```diff
   lint:
     name: Frontend lint (RTL + Next.js rules)
     ...
     concurrency:
       group: ${{ github.workflow }}-lint-${{ github.head_ref || github.ref }}
-      cancel-in-progress: true
+      # MEH-2212: this job runs on push to staging/main too (:61-62), where
+      # head_ref is empty and the group collapses to the branch. Unguarded,
+      # merge N+1 cancels merge N's lint and the branch tip carries a
+      # `cancelled` that ci-gate-shaped aggregators read as FAIL.
+      cancel-in-progress: ${{ github.ref != 'refs/heads/staging' && github.ref != 'refs/heads/main' }}
```

```diff
   api-contract-static:
     name: API contract audit (static)
     ...
     concurrency:
       group: ${{ github.workflow }}-api-contract-static-${{ github.head_ref || github.ref }}
-      cancel-in-progress: true
+      cancel-in-progress: ${{ github.ref != 'refs/heads/staging' && github.ref != 'refs/heads/main' }}
```

`api-contract-probe-staging` (`:356-358`) may take the same guard; it probes a
deployed staging and cancelling it mid-probe is the same class of loss.

**Why it matters here:** these two are `Deploy gate` inputs. A cancelled leg on
`staging` is not merely a lost run — it publishes a misleading conclusion on the
branch tip, which is the exact false-red class workflow rule 21 documents.

### 1ג · `e2e.yml` — ⚠️ applying the card's block VERBATIM here is a REGRESSION

Live (`e2e.yml:56-58`):

```yaml
concurrency:
  group: e2e-${{ github.head_ref || github.run_id }}
  cancel-in-progress: true
```

Note the fallback: **`github.run_id`, not `github.ref`.** That is deliberate —
`207b9894` (2026-07-27) made exactly this change for MEH-1601, and
[`docs/ci/e2e-concurrency.patch.md`](./e2e-concurrency.patch.md) carries a
`✅ STATUS — do not re-apply` banner on it. Because `run_id` is unique per run,
**pushes to `staging` never share a group and are never cancelled.**

`e2e.yml` **does** fire on `push: [staging]` (`:39-40`). So pasting the card's
block unchanged replaces `run_id` with `ref`, collapses every staging push into
one group, and re-introduces MEH-1601 — a docs push cancelling the previous code
push's E2E run and putting nothing in its place.

**The guard is what makes the change safe.** Apply this exact form, keeping
`run_id`:

```diff
 concurrency:
-  group: e2e-${{ github.head_ref || github.run_id }}
-  cancel-in-progress: true
+  # MEH-1601 (207b9894): the fallback is run_id, NOT github.ref. A staging push
+  # has an empty head_ref; keying on ref would collapse every push into one
+  # group and a docs push would cancel the previous code push's suite.
+  # MEH-2212 adds the explicit ref guard as belt-and-braces: even if a future
+  # edit "tidies" run_id into ref, cancellation stays off on the deploy
+  # branches. Both halves are load-bearing — do not simplify either away.
+  group: e2e-${{ github.head_ref || github.run_id }}
+  cancel-in-progress: ${{ github.ref != 'refs/heads/staging' && github.ref != 'refs/heads/main' }}
```

### 1ד · the four cosmetic ones

`claude-review.yml:39-41`, `dependency-audit.yml:30-32`,
`i18n-icu-parity.yml:28-30`, `skills-audit.yml:31-33` are all already:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.head_ref || github.ref }}
  cancel-in-progress: true
```

All four are `pull_request`-only (plus `workflow_dispatch`; `dependency-audit`
also has a weekly `schedule`). Swap the last line for the guarded form if you
want one uniform block. **Why it matters here: it does not** — with no `push:`
trigger the guard cannot fire. The one non-cosmetic effect is on
`dependency-audit.yml`'s cron: on a `schedule` event `github.ref` is
`refs/heads/staging` (the default branch), so the guard turns cancellation
**off** for the weekly run — which is correct, there is nothing to cancel it
against.

### Savings and risk

| | |
| -- | -- |
| **Minutes saved** | **0 on a healthy run — this row is loss-prevention, not reduction.** The cancellation that saves minutes is already live and already firing (5 of 12 recent `e2e.yml` PR runs cancelled). What the guard adds is preventing the *new* loss that pasting the card's block verbatim would cause. |
| **Loss prevented (measured)** | On `e2e.yml`, one un-guarded staging push cancels a run of **17–21 min** and replaces it with nothing. |
| **Risk** | **Low, with one sharp edge:** applying the card's block verbatim to `e2e.yml` is a regression (§1ג). Second edge: never widen the guard to the `production`/`staging` deploy jobs in `deploy.yml` — they are already `false` for data-integrity reasons and must stay serialized. |

---

## 2 · Merging the tiny gates

### ⚠️ `AI artifact scan` cannot join the other three — it is not a tiny gate

The card groups four jobs. Three are genuinely tiny. The fourth is not:
`ai-artifact-scan` (`pr-checks.yml:220-286`) declares `needs: [changes, build]`,
`timeout-minutes: 15`, and its steps are `npm ci` + `npm run build` — **a second
full Next.js build**, run so it can `find`/`grep` the output. Its own comment
says why: *"GitHub jobs don't share workspaces and the build job doesn't upload
`.next`; a self-contained rebuild keeps the two jobs independent."*

It therefore cannot merge with three checkout-free gates that run at t=0. But
that reasoning — independence bought with a duplicate build — **inverts once
minutes are billed**, which is the whole premise of this ticket. So §2ב folds it
into `build` instead, and that is worth more than §2א.

### 2א · merge `Branch name gate` + `DO-NOT-MERGE marker gate` into `Paths filter`

Replace `pr-checks.yml:44-77` (`branch-name-gate` + `do-not-merge-gate`) and
`:136-168` (`changes`) with one job. **Keep the display name `Paths filter`** —
see §2ג on required checks.

```yaml
  # ─────────────────────────────────────────────
  # JOB 0: paths-filter + the two zero-cost gates (MEH-485, MEH-2212)
  # MEH-2212: `Branch name gate` and `DO-NOT-MERGE marker gate` were separate
  # jobs measuring 4-5s each. A private-repo job is billed rounded UP to one
  # minute, so three 15-second jobs cost 3 minutes and one costs 1. Merged
  # here rather than into `Repo guards` because this job already has to run
  # first — everything else `needs:` its outputs — so folding the gates in
  # adds nothing to the critical path.
  # The per-job `if:` conditions became per-STEP `if:` conditions. Both are
  # still enforced; see the release-PR carve-outs inline.
  # ─────────────────────────────────────────────
  changes:
    name: Paths filter
    runs-on: ubuntu-latest
    timeout-minutes: 5
    outputs:
      frontend: ${{ steps.filter.outputs.frontend }}
      backend: ${{ steps.filter.outputs.backend }}
      workflows: ${{ steps.filter.outputs.workflows }}
      deps: ${{ steps.filter.outputs.deps }}
    steps:
      # MEH-1141 — was job `branch-name-gate`. The job-level `if:` skipped the
      # whole job for staging → main release PRs (MEH-1105, head_ref is always
      # `staging` and cannot match the convention). As a step-level `if:` the
      # carve-out is identical, but the job no longer disappears with it —
      # which matters, because the job now also carries the paths filter.
      - name: Assert branch name matches the locked convention (MEH-1141)
        if: ${{ github.head_ref && !(github.base_ref == 'main' && github.head_ref == 'staging') }}
        run: |
          BRANCH="${{ github.head_ref }}"
          if ! printf '%s' "$BRANCH" | grep -Eq '^(feature|levismadar80)/meh-[0-9]+(-[a-z0-9]+)*$|^dependabot/.*'; then
            echo "::error::Branch '$BRANCH' violates the locked naming convention (workflow rule 3, MEH-1141)."
            echo "Allowed: feature/meh-{N}-{slug} | levismadar80/meh-{N}-{slug} | dependabot/*"
            exit 1
          fi
          echo "Branch '$BRANCH' OK."

      # MEH-1155 / ADR-016 amendment — was job `do-not-merge-gate`.
      # Regex unchanged, byte for byte. See docs/ci/meh-1523-dnm-label-gate.patch.md
      # for the pending swap of this text scan for a label check; if that lands
      # first, this step becomes a label read and the merge here still holds.
      - name: Fail if the PR carries a DO-NOT-MERGE marker (MEH-1155, ADR-016 amendment)
        env:
          PR_TITLE: ${{ github.event.pull_request.title }}
          PR_BODY: ${{ github.event.pull_request.body }}
        run: |
          set -euo pipefail
          if printf '%s\n%s' "$PR_TITLE" "$PR_BODY" | grep -Eiq '(^|[^A-Za-z0-9_-])do[ _-]?not[ _-]?merge([^A-Za-z0-9_-]|$)|DNM-LOCK'; then
            echo "::error::This PR carries a DO-NOT-MERGE marker. Per ADR-016 (amendment, MEH-1155) auto-merge authority is VOID regardless of risk tier. Only Sapir may remove the marker."
            exit 1
          fi
          echo "No DO-NOT-MERGE marker. OK."

      - uses: actions/checkout@v7
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            frontend:
              - 'frontend/**'
              - 'package.json'
              - 'package-lock.json'
            backend:
              - 'backend/**'
              - 'tests/**'
            workflows:
              - '.github/workflows/**'
            # MEH-1585: mirrors dependency-audit.yml's backend manifests exactly.
            # If the two lists diverge the gate silently stops covering a manifest.
            deps:
              - 'backend/pyproject.toml'
              - 'backend/uv.lock'
```

> **Step order is deliberate.** Both gates run **before** `actions/checkout` —
> neither needs the worktree, and putting them first means a PR carrying the
> marker fails in ~4 seconds instead of after a checkout.

Then in `ci-gate` (`:704-724`), drop the removed job from `needs:` and from the
env block, and re-point the DNM assertion at the merged job:

```diff
     needs:
       - changes
-      - do-not-merge-gate
       - qa-artifacts-size
```

```diff
           R_CHANGES: ${{ needs.changes.result }}
-          R_DNM: ${{ needs.do-not-merge-gate.result }}
           R_QA_SIZE: ${{ needs.qa-artifacts-size.result }}
```

```diff
           echo "Always required (stack-independent):"
-          check_ran "DO-NOT-MERGE marker gate" "$R_DNM"
+          # MEH-2212: the marker gate is now a step inside `changes`. Its
+          # failure fails that job, and R_CHANGES is already hard-guarded
+          # above (`cannot determine stack` → exit 1) — which is STRICTLY
+          # stronger than check_ran was: that guard has no skipped→pass path
+          # at all.
           check_ran "qa-artifacts size cap" "$R_QA_SIZE"
```

**Do not also delete `branch-name-gate` from `ci-gate`'s `needs:`** — it was
never there (verified against `:704-724`; the aggregator never enforced it).

### 2ב · fold `AI artifact scan` into `Frontend build` — the largest single saving

Delete the `ai-artifact-scan` job (`pr-checks.yml:220-286`) entirely and append
its two scan steps to `build` (after the existing `Build` step, `:206-210`):

```yaml
      # MEH-449 Layer 2 — was job `ai-artifact-scan`. It ran its own `npm ci` +
      # `npm run build` purely because jobs don't share a workspace. MEH-2212:
      # in a billed-minutes repo that independence costs a full duplicate
      # frontend build on every frontend PR. The scan needs `.next` + `public/`,
      # which this job has already produced two steps above — so it runs here
      # against the same artifact, and the second build goes away.
      - name: "Scan 2a — forbidden AI-artifact filenames in deployable output"
        run: |
          set -euo pipefail
          # public/ is scanned alongside .next: next build does NOT copy
          # public/ into .next (no standalone output), and on Vercel
          # public/ IS the served static root — a CLAUDE.md planted there
          # ships without ever touching .next.
          hits=$(find .next public -type f \( \
            -iname "CLAUDE.md" -o -iname "CLAUDE.local.md" \
            -o -iname "HANDOFF.md" -o -iname "ROADMAP.md" \
            -o -iname "AGENTS.md" \) 2>/dev/null || true)
          if [ -n "$hits" ]; then
            echo "::error::MEH-449 scan 2a — AI dev artifact file(s) found in deployable output:"
            echo "$hits"
            exit 1
          fi
          echo "Scan 2a clean — no forbidden filenames in .next or public/"

      - name: "Scan 2b — forbidden content literals in deployable output"
        run: |
          set -euo pipefail
          # Known-legitimate exception: the admin-help runbook i18n copy
          # contains the string "_migrate_columns" (messages/he.json +
          # en.json, admin.help.* namespace) and is bundled into the
          # messages_* chunks. Those chunks are excluded; the same literal
          # anywhere else still fails.
          for lit in "_migrate_columns" "MEH-265" "JWT_SECRET_KEY="; do
            hits=$(grep -rl --binary-files=text -- "$lit" .next public 2>/dev/null | grep -v "messages_.*json" || true)
            if [ -n "$hits" ]; then
              echo "::error::MEH-449 scan 2b — forbidden literal '$lit' found in deployable output:"
              echo "$hits"
              exit 1
            fi
          done
          echo "Scan 2b clean — no forbidden literals in .next or public/"
```

> **⚠️ Order matters and is not arbitrary.** These two steps must sit **after**
> `Build` and **after** `Verify tailwind.tokens.json sync with DESIGN.md`. The
> token-sync step runs `npm run design:export`, which writes into the worktree;
> scanning before it would scan a build the sync step may not have validated.
> Appending at the end of the job is the safe position.

`ci-gate` changes:

```diff
     needs:
       - build
-      - ai-artifact-scan
       - pytest
```

```diff
           R_BUILD: ${{ needs.build.result }}
-          R_AI_SCAN: ${{ needs.ai-artifact-scan.result }}
           R_PYTEST: ${{ needs.pytest.result }}
```

```diff
             check_ran "Frontend build (Next.js)" "$R_BUILD"
-            check_ran "AI artifact scan (MEH-449)" "$R_AI_SCAN"
+            # MEH-2212: the MEH-449 scan is now two steps inside the build job,
+            # so R_BUILD covers it — a scan failure fails the build.
             check "Frontend Knip (warn-only)" "$R_FRONTEND_KNIP"
```

### 2ג · optional — also fold `Repo guards`, `qa-artifacts size cap`, `Env drift`

All three are checkout-only and measured at **12–26 s**. Folding them into the
same `changes` job takes it from 6 billed jobs to 1.

**This is a bigger aggregator change and is offered separately for that reason:**
all three are enforced with `check_ran`, so each `R_*` reference has to collapse
into the `R_CHANGES` hard guard exactly as the DNM step did in §2א. `Env drift`
additionally carries a `draft == false` job condition (`:501`) that would have to
become a step-level `if:` — and see §5, because that condition is currently the
cause of a live stranded-red bug. **Take §2א+§2ב first; take this one only if the
extra 3 min/run is needed after re-measuring.**

### Savings and risk

| | **measured / estimate** | value |
| -- | -- | -- |
| §2א merge 3 gates → 1 | **measured** (runs A and B, identical) | **−2 min/run, every PR** |
| §2ב fold AI scan into build | **estimate** — the job reported `skipped` in both sampled runs, so its duration is **not measured**. It is a full `npm ci` + `next build` with `timeout-minutes: 15` | **−3 to −5 min per frontend PR**, plus one job (−1 min). Re-measure on a frontend PR |
| §2ג fold 3 more | **measured** | **−3 min/run** |
| **§2א+§2ב together** | mixed | **−2 min on a backend PR; −6 to −8 on a frontend PR** (estimate half) |

**Risk — §2א: low.** No check text changes; both gates keep their exact scripts
and carve-outs. The one behaviour change is **fail-fast coupling**: a bad branch
name now also fails the paths filter, so every downstream job reports `skipped`
instead of running. That is arguably an improvement (a PR that cannot merge stops
burning minutes at job 1) but it is a change — a PR with a bad name will show one
red job and a wall of skips rather than one red job and a full green run.

**Risk — §2ב: moderate, and this is the one to review carefully.** The MEH-449
scan currently runs against an **independently produced** build. After the fold
it runs against the *same* build artifact the build job made. If a future change
ever made `build` mutate `.next` after the scan, the scan would be inspecting a
stale tree — the "two artifacts wrong together" class in
`.claude/rules/testing.md` § *A green that has two possible causes*. Mitigation:
the steps are appended **last**, so nothing runs after them today. **Discrimination
check before merging (MEH-1619): plant a `CLAUDE.md` in `frontend/public/`, push,
confirm the build job goes RED on scan 2a, then remove it and confirm green.** A
scan that has never been seen failing in its new position is not evidence.

**Risk — §2ג: moderate**, for the aggregator rewiring reasons above.

---

## 2ד · ⛔ REQUIRED STATUS CHECKS — TODO for Sapir, deliberately NOT guessed

**I could not read the live required-check list. No tool available to this
session reads the GitHub Rulesets API, and the repo's own two records of it
disagree.** Per the task's own instruction, this section is a TODO, not an
answer.

### What the repo says, and why the two sources conflict

| Source | Claim | As-of |
| -- | -- | -- |
| [`.claude/rules/testing.md:693-695`](../../.claude/rules/testing.md) | **Only 2** contexts are required on staging: `CI gate` and `Deploy gate`. Ruleset ID **15240090** | verified against the ruleset API **2026-07-04** — ~8 weeks stale |
| [`docs/DEPLOYMENT.md:227-251`](../DEPLOYMENT.md) | speaks of **6** required checks and of docs-only twin jobs (`*-noop`) needed to satisfy them | screenshotted **2026-05-23** — ~14 weeks stale |

**One cross-check I could run, and it favours `testing.md`:**
`grep -rn "noop" .github/workflows/*.yml` returns **zero hits**. The `*-noop`
twin jobs `DEPLOYMENT.md` describes as the mechanism for docs-only merges **do
not exist in the live workflows**. `testing.md:705` says exactly that — *"there
are no docs-only twin jobs and none are needed … both the twins and the
six-checks framing were wrong"*. The Truth Hierarchy (CLAUDE.md) also puts
`.claude/rules/` above `docs/*`.

**That is corroboration, not verification.** The absence of twins is consistent
with a 2-context ruleset; it does not read the ruleset. And per
`.claude/rules/testing.md` § *A green that has two possible causes*, an
8-week-old measurement is an artifact whose as-of nobody has re-derived —
credibility without currency.

### The two branches, so no guessing is needed either way

**Branch A — if `testing.md` is right (2 contexts: `CI gate`, `Deploy gate`):**

> ### ✅ **No Settings change is required at all.**
> None of the four job names in §2 is a required context. `CI gate (required)`
> keeps its exact name and keeps reporting; only its internal `needs:` list
> shrinks. Apply §2 and merge — nothing to update in Settings → Rules.

**Branch B — if `DEPLOYMENT.md` is right, or the ruleset has changed since
2026-07-04**, then in **the same change window** as §2, in
**Settings → Rules → `protect-staging` (ID 15240090) → Require status checks to
pass**:

**Remove** these context strings (they are the `name:` values of jobs §2
deletes — GitHub matches required checks by the human-readable `name:`, and a
required context whose job no longer exists blocks every PR forever, "Expected",
with no way to satisfy it):

```
Branch name gate
DO-NOT-MERGE marker gate
AI artifact scan (build output)
```

**Add:** *nothing.* Every deleted job's enforcement moves **inside** a job whose
name is unchanged — `Paths filter` (§2א) and `Frontend build (Next.js)` (§2ב) —
so no new context string is created. If §2ג is also applied, additionally remove:

```
Repo guards
qa-artifacts size cap
Env drift (.env.example)
```

**`Paths filter` must be kept in the list if it is currently in it** — the job
survives §2 under its exact existing name.

Repeat the same check on the `main` ruleset (`protect-main`).

### How to settle it before applying — one command, in Sapir's terminal

```bash
gh api repos/levismadar80-ship-it/FoodMamkor/rulesets/15240090 \
  --jq '.rules[] | select(.type=="required_status_checks")
        | .parameters.required_status_checks[].context'
```

Or read it in the UI: **Settings → Rules → `protect-staging` → Require status
checks to pass**. Paste the result into MEH-2212's description (**rule 34** — a
refuted or confirmed premise belongs in the description, not only a comment) so
the next session inherits a current list instead of re-deriving this.

> **⚠️ There is a third state right now, and it makes the check urgent rather
> than optional.** MEH-2212 records that the repo was flipped to **private**, and
> that rulesets are **not enforced** on a private repo below GitHub Pro — the
> rules are not deleted, they simply stop applying. So a UI reading taken today
> may show contexts that are configured but currently inert, and a *merge test*
> would show no blocking at all. **Read the ruleset configuration, do not infer
> the required list from whether a PR was blocked.** That inference has two
> possible causes and is exactly the instrument error this repo's rules warn
> about.

---

## 3 · e2e + VRT + axe — recommendation: **label-gated `run-e2e`, plus a nightly**

### Measured cost

| | wall-clock |
| -- | -- |
| real E2E executions (3 samples, 31/08) | **17.1 / 17.2 / 21.2 min** |
| paths-filter skipped the suite | **0.5–0.6 min** |

`e2e.yml` carries 4 jobs — `filter`, `e2e` (`timeout-minutes: 30`),
`e2e-webkit` (`timeout-minutes: 20`, `continue-on-error: true`, and **absent from
`e2e-gate`'s `needs:`**), and `e2e-gate`. Billed total per real run ≈ **20–40
min** — *estimate*, since per-job times inside those runs were not fetched.

There is no separate `axe`/a11y job in `e2e.yml`; the VRT specs run inside the
same `e2e` job via `e2e/visual/**` (`playwright.config.ts:35`). So this row is a
single decision about one job, not three.

### The recommendation, and the reason it is not "push to staging"

> **Primary: label-gated on `run-e2e`. Secondary: one nightly scheduled run on
> `staging`. Do NOT use `on: push` to staging.**

**The drain workflow is the deciding factor, and it points away from
push-to-staging.** MEH-2212 records **11 merges on 31/08 alone**. Each merge is a
push to `staging`:

| Trigger | runs/day at the measured drain rate | billed/day (estimate) |
| -- | --: | --: |
| `on: push: [staging]` | **11** | **~220–440 min** |
| nightly `schedule` | **1** | ~20–40 min |
| label-gated on PRs | 0 unless labelled | ~20–40 min per labelled PR |

Push-to-staging **scales with drain volume**, which is the one variable this
ticket is trying to bound — on a heavy drain day it can cost more than running
E2E on every PR did. A nightly cron costs exactly one run regardless of how many
PRs land, and still catches a regression within 24 h.

### The patch

```diff
 on:
   pull_request:
     branches: [staging]
-  push:
-    branches: [staging]
+  # MEH-2212: `push: [staging]` removed — at the measured drain rate (11 merges
+  # on 31/08) it fired 11 full suites a day. The nightly below gives the same
+  # post-merge coverage at one run/day, independent of merge volume.
+  schedule:
+    # 02:00 UTC = 05:00 Asia/Jerusalem — after the day's drains, before morning.
+    - cron: '0 2 * * *'
   workflow_dispatch:
```

and on the `e2e` job (`:80-86`), add the label / non-PR condition:

```diff
   e2e:
     name: Playwright E2E (Vercel preview)
     needs: filter
-    if: ${{ needs.filter.outputs.frontend == 'true' }}
+    # MEH-2212: on a PR the suite now runs only when the `run-e2e` label is
+    # present. On schedule/dispatch there is no PR, so it always runs.
+    if: >-
+      ${{ needs.filter.outputs.frontend == 'true' &&
+          (github.event_name != 'pull_request' ||
+           contains(github.event.pull_request.labels.*.name, 'run-e2e')) }}
```

> **Verify the current `if:` before pasting.** The `- if:` line above is
> reconstructed from the job's role, not copied from a line I read verbatim;
> read `e2e.yml:80-86` and preserve whatever condition is actually there,
> adding only the `&& (…)` clause.

`e2e-gate` needs **no change**: its `ok()` already maps `skipped → pass`
(`:578`), so an unlabelled PR reports `E2E gate` green exactly as a docs-only PR
does today.

Create the label once: **Issues → Labels → New label → `run-e2e`.**

### Savings and risk

| | |
| -- | -- |
| **Minutes saved** | **measured, per PR that would have run the suite: 17–21 min of wall-clock, ≈20–40 billed.** At the drain rate, removing `push: [staging]` saves an estimated **~200–400 min/day**. |
| **Risk — the honest version** | **Lower than it looks, and the reason is uncomfortable.** `E2E gate` is **not a required check today** — `.claude/rules/testing.md` § *Required status checks* records that only `CI gate` and `Deploy gate` gate merges, and MEH-1907 measured a PR merging on one green E2E run when two were demanded. So E2E already does not block anything; this change reduces **cost and signal**, not a merge guarantee. |
| **Risk — real** | A frontend regression can merge and sit undetected until the nightly (≤24 h). Mitigation: label `run-e2e` on any PR touching `frontend/components/**`, VRT-covered routes (`/`, `/map`, `/about`, `/login`, `/register`, producer detail), or anything in `.claude/central-components.json`. |
| **Risk — second-order** | Fewer E2E runs means **VRT baselines are exercised less often**, so drift is discovered later and in bigger chunks. That interacts badly with `.claude/rules/testing.md` § *Restoring an old artifact is not ratification* — the nightly is what keeps the as-of gap from growing. **Do not drop the nightly and keep only the label.** |

---

## 4 · `retention-days: 3`

### ⚠️ All five upload steps already carry `retention-days`. None is on the 90-day default.

The card's note *"ברירת מחדל 90 יום"* does not describe the live repo.

| File:line | artifact | current | change to |
| -- | -- | --: | --: |
| `e2e.yml:329` | `playwright-report` | 7 | **3** |
| `e2e.yml:383` | `e2e-diagnostics` | 7 | **3** |
| `e2e.yml:554` | `playwright-report-webkit` | 7 | **3** |
| `vrt-update.yml:185` | `vrt-update-report` | 7 | **3** |
| `cls-measure.yml:57` | `cls-results` | 30 | **see note** |

```diff
       - name: Upload Playwright report
         uses: actions/upload-artifact@v7
         if: failure()
         with:
           name: playwright-report
           path: |
             frontend/playwright-report/
             frontend/test-results/**/trace.zip
-          retention-days: 7
+          retention-days: 3   # MEH-2212 / MEH-2168 (500MB private-Free cap)
```

Identical one-line change at `e2e.yml:383`, `e2e.yml:554`, `vrt-update.yml:185`.

**`cls-measure.yml:57` — do not change without deciding.** It is
`workflow_dispatch`-only, produces one small JSON, and 30 days is plausibly
deliberate for comparing a measurement against one taken weeks earlier. Its
storage contribution is negligible next to the Playwright reports. **Recommendation:
leave it at 30**; if uniformity is preferred, 3 days makes a manual measurement
unciteable after 72 h.

### ⛔ Do NOT touch the repository-level retention setting

**Settings → Actions → General → "Artifact and log retention" must be left
alone.** Per the 2026-08-27 GitHub changelog cited in this task's brief, that
setting governs **workflow-run history** from 2026-10-01 — and this project cites
run IDs as evidence throughout its rules and audit docs (the measurement table at
the top of this file cites two). Lowering it would delete the evidence base.

> _I have not independently verified that changelog — the CC sandbox's WebFetch
> allowlist does not cover `github.blog`, and `.claude/rules/skills.md` Layer 1
> blocks anything outside it. It is recorded here as **given by the brief**, not
> as something this session measured. The per-step `retention-days` values above
> are unaffected either way: they are step-scoped and touch only artifacts._

### Savings and risk

| | |
| -- | -- |
| **Minutes saved** | **Zero — this row saves storage, not minutes.** Filed under a cost ticket because private-Free is 500 MB shared across artifacts and Packages (MEH-2212 §3), which is what MEH-2168 hit. |
| **Storage saved** | **Estimate** — not computed; it needs the artifact-size history, which I did not fetch. Direction is certain (7→3 days ⇒ ~57% less retained window per artifact), magnitude is not. |
| **Risk** | **Low but real: a Playwright report older than 3 days is gone.** A red E2E on Friday cannot be diagnosed from its report on Monday. Given `e2e.yml` reports are uploaded `if: failure()` and are normally triaged the same day, 3 days is a reasonable trade — but it *is* a trade, and it removes exactly the artifact a post-mortem wants. |

---

## 5 · Skip drafts — ⚠️ only where it is safe, and the unsafe set is larger than the safe one

### Seven jobs already carry the guard

`pr-checks.yml` lines `172`, `223`, `290`, `455`, `501`, `627`, `684` all already
read `github.event.pull_request.draft == false`, and `deploy.yml:49-59` documents
the same pattern for `lint` + `api-contract-static`. **This row is mostly done.**

### ⛔ Adding it to the remaining jobs would strand PRs red

`ci-gate` enforces some jobs with `check_ran` (`pr-checks.yml:765-775`), which
treats `skipped` as **failure**:

> `# MEH-1582: a job that the gate is actively enforcing must have RUN.`
> `# 'skipped' there means a draft suppressed it … that is an absence of`
> `# evidence, not a pass.`

So a draft guard on any `check_ran` job creates a job the gate demands and the
draft guarantees will not run:

| Job | enforced as | draft guard safe? |
| -- | -- | -- |
| `DO-NOT-MERGE marker gate` | `check_ran` | ❌ **no** |
| `qa-artifacts size cap` | `check_ran` | ❌ **no** |
| `Repo guards` | `check_ran` | ❌ **no** |
| `Paths filter` | hard guard (`exit 1`) | ❌ **no** — everything `needs:` it |
| `Backend mypy (warn-only)` | `check` (tolerates skipped) | ✅ yes |
| `Frontend Knip (warn-only)` | `check` | ✅ yes |
| `Frontend tsc strict (warn-only)` | `check` | ✅ yes |
| `Linear mention guard` | **not in `ci-gate` `needs:`** | ✅ yes |

### The patch — three warn-only jobs plus one unenforced one

```diff
   backend-mypy:
     name: Backend mypy (strict, warn-only)
     needs: changes
-    if: ${{ needs.changes.outputs.backend == 'true' || needs.changes.outputs.workflows == 'true' }}
+    # MEH-2212: safe to draft-skip — ci-gate enforces this one with `check`,
+    # not `check_ran`, so `skipped` is a pass and no draft can strand the PR.
+    if: ${{ (needs.changes.outputs.backend == 'true' || needs.changes.outputs.workflows == 'true') && github.event.pull_request.draft == false }}
```

Same shape for `frontend-knip` (`:563`), `frontend-tsc-strict` (`:598`) and
`linear-mentions` (`:657`) — **preserve each job's existing filter condition and
append only `&& github.event.pull_request.draft == false`.** Read each `if:` line
before editing; they are not identical.

### 🐛 A live bug this row sits directly on top of — worth fixing in the same window

`env-drift` (`:501`) already has `draft == false` **and** is enforced with
`check_ran` (`:788`). That is the forbidden combination above, and it is not
theoretical: `.claude/rules/workflow.md` rule 21 records **PR #2794** stranded red
by exactly it —

> `FAIL Env drift (.env.example): skipped (required job did not run — 'skipped' is not a pass)`

on a `.claude/`-only diff, where the gate's *"Neither stack touched"* branch makes
`Env drift` the only enforced job. Two candidate fixes, **Sapir's call, not
CC's**:

- **(a)** drop `draft == false` from `env-drift` — it is a checkout + one script,
  measured at **12–13 s**, so the draft skip saves 1 billed minute and costs
  stranded PRs; or
- **(b)** demote it from `check_ran` to `check` in the aggregator.

**(a) is the smaller change and the one consistent with this ticket** — it gives
up 1 minute on drafts to remove a documented failure mode. Not patched here
because it is a correctness decision, not a cost one.

### Savings and risk

| | |
| -- | -- |
| **Minutes saved** | **On a draft PR only.** mypy 32 s + Knip + tsc + Linear guard = 4 jobs → **−4 billed min per draft run** (mypy measured; the other three reported `skipped` in both sampled runs, so their durations are **estimate** — but the saving is 1 min/job regardless of duration, which is the measured part). **0 min on a non-draft PR.** |
| **Real-world value** | **Low.** `.claude/rules/workflow.md` rule 21 advises opening PRs **non-draft** (a stranded docs draft cannot be cleared by a re-run), so drafts should be rare here by policy. This row optimises a path the repo tries not to use. |
| **Risk** | **Low as scoped; high if widened.** Adding the guard to any `check_ran` job reproduces PR #2794 — and that failure **cannot be cleared by a re-run**, because a re-run replays the original event payload with `draft: true`. Only a genuine push fires `synchronize`. |

---

## 6 · `actions/cache` on lockfile hashes

### ⚠️ Caching already exists on **every** install site, keyed on the lockfile

The card asks for `actions/cache@v4` keyed on lockfile hashes. Measured against
the live workflows, this is **already implemented by a better mechanism**, and
`@v4` would be a **downgrade** — the repo is on `actions/cache@v6`.

**npm — 12 sites**, all `actions/setup-node` with:

```yaml
          cache: "npm"
          cache-dependency-path: frontend/package-lock.json
```

`pr-checks.yml:186,237,580,615,639` · `deploy.yml:139` · `e2e.yml:114,454` ·
`vrt-update.yml:90` · `dependency-audit.yml:98` · `cls-measure.yml:38`.
`setup-node`'s `cache:` **is** `actions/cache` internally, keyed on the hash of
the file named by `cache-dependency-path` — i.e. exactly what the card asks for,
already wired.

**uv — 5 sites**, all `astral-sh/setup-uv` with:

```yaml
          enable-cache: true
          cache-dependency-glob: "backend/uv.lock"
```

`pr-checks.yml:316,466,546,695` · `post-merge-lock-check.yml:35` ·
`dependency-audit.yml:53`.

**Explicit `actions/cache@v6` — 3 sites**, for Playwright browser binaries:
`e2e.yml:119`, `e2e.yml:460`, `vrt-update.yml:95`.

> **Do not add a redundant `actions/cache` step next to `setup-node`.** Two
> mechanisms owning one cache is `.claude/rules/workflow.md` § *Architectural
> smell #1* — either can succeed while the other drifts, and neither surfaces an
> error.

### The one gap that IS real — cache `node_modules`, not just `~/.npm`

`setup-node`'s cache stores the **npm download cache**, so `npm ci` still
re-resolves and re-links every package into `node_modules` on every job. Caching
`node_modules` itself skips `npm ci` entirely.

For each of the 5 `pr-checks.yml` npm jobs, insert **between** `setup-node` and
`npm ci`:

```yaml
      # MEH-2212: setup-node's `cache: npm` caches ~/.npm (the download cache),
      # so `npm ci` still re-links every package. This caches the linked tree.
      # Key is the lockfile hash: any dependency change misses and rebuilds.
      - name: Cache node_modules
        id: node-modules-cache
        uses: actions/cache@v6
        with:
          path: frontend/node_modules
          key: node-modules-${{ runner.os }}-node20-${{ hashFiles('frontend/package-lock.json') }}
```

and gate the install on a miss:

```diff
       - name: Install dependencies
+        if: steps.node-modules-cache.outputs.cache-hit != 'true'
         run: npm ci
```

> **⚠️ No `restore-keys:`, deliberately.** A partial restore would hand the job a
> `node_modules` built from a *different* lockfile — a stale tree that looks like
> a fresh one, with the build then green against dependencies the lockfile does
> not name. That is the "reference and subject wrong together" class in
> `.claude/rules/testing.md`. Exact hash or full reinstall; nothing in between.

> **⚠️ `runner.os` and the node major are in the key on purpose.** A
> `node_modules` tree contains compiled native artifacts. Restoring one built on
> a different OS or Node major produces failures that do not name their cause.

### Savings and risk

| | |
| -- | -- |
| **Minutes saved** | **Estimate — not measured.** Every job that would show it (`build`, `ai-artifact-scan`, `vitest`, `knip`, `tsc`) reported `skipped` in both sampled runs, so **no `npm ci` duration was observed in this session.** Typical `npm ci` on a warm `~/.npm` for a project this size is **30–60 s**; across 5 jobs that is **2.5–5 min of wall-clock**. In **billed** terms it is likely **0–2 min**, because a job billed by the rounded-up minute only gets cheaper when the saving crosses a minute boundary. **Measure a frontend run before doing this work.** |
| **Honest verdict** | **Lowest value of the six rows, and possibly zero.** Under per-job round-up billing, shaving 40 s off a 4-minute job saves nothing at all. §2ב (deleting a duplicate build) dominates it. **Do §2 first; revisit §6 only if a measured frontend run shows an `npm ci` that straddles a minute boundary.** |
| **Risk** | **Moderate — the highest-risk row in this document.** A stale or mismatched `node_modules` produces a build that is green against the wrong dependency tree, and nothing in the output says so. The no-`restore-keys` rule above is what keeps this bounded; do not "improve" it by adding one. |

---

## Recommended order of application

| Order | Section | Why |
| -- | -- | -- |
| 1 | **§2ד — read the ruleset** | Everything in §2 depends on it, and it is one command |
| 2 | **§4** — `retention-days: 3` | 4 one-line edits, no aggregator change, closes MEH-2168 |
| 3 | **§1ג** — `e2e.yml` guard | Prevents a regression the card's own text would cause |
| 4 | **§3** — label-gate E2E | **largest measured saving**, no aggregator change |
| 5 | **§2א + §2ב** | Real savings, real aggregator surgery — with the §2ב plant-a-file discrimination test |
| 6 | **§1א/§1ב/§1ד**, **§5** | Small or defensive |
| 7 | **§2ג**, **§6** | Only after re-measuring on a **private** repo with real billing data |

**Re-measure after each step.** Every number in this document was taken while the
repo was **public**, so `get_workflow_run_usage` returned `total_ms: 0` and the
billed column is derived, not read. Once private, that same call returns real
values — use them, and correct this file rather than inheriting its arithmetic.

---

## What this document does NOT do

- **It does not touch `.github/workflows/**`.** CC-deny (MEH-671). Every block
  here is for Sapir to paste.
- **It does not settle the required-check list.** §2ד is a TODO with the exact
  command, not an answer. Applying §2 before running it risks a permanently
  "Expected" context that blocks every PR.
- **It does not re-open MEH-2194** (row 6 of the card's table, vitest
  `environmentMatchGlobs`). That is a `vitest.config` change, not a workflow
  change, so it is out of scope for a `.github/workflows/**` patch document and
  belongs on its own card.
- **It does not measure the frontend jobs.** Both sampled runs were
  backend-only. Every frontend figure is marked *estimate*, and §2ב — the row
  with the largest claimed saving — rests on one of them.
