# MEH-1907 patch #2 — the `changes`/`filter` guard, and three outcomes wearing one message

> **🔴 NOT APPLIED. This file is a patch document, not a change.**
> `.github/workflows/**` is CC-deny (`.claude/settings.json`, MEH-671). CC measures
> and drafts; **Sapir applies.** Same pattern as `e2e-gate.patch.md` and
> `meh-1907-workflows-only-enforcement.patch.md`.
>
> **Independent of F-1.** `meh-1907-workflows-only-enforcement.patch.md` (Option A,
> ratified MEH-2227 §4ז) touches the `workflows-only` legs. **Nothing here touches
> those hunks** — the two can be applied in either order, or one without the other.

**Target files:** `.github/workflows/pr-checks.yml` · `.github/workflows/deploy.yml` ·
`.github/workflows/e2e.yml`
**Line numbers below are against `origin/staging` at `3bf10d04` (01/09 09:15Z).**
Re-derive before applying — three merges landed on staging this morning.

---

## Part A — the paths-filter guard maps `cancelled` onto the wrong sentence

### What is there today

All three aggregators guard their paths-filter dependency *before* the per-job
loop, and all three do it with `ok()`, which is a two-state test:

```
ok() { case "$1" in success|skipped) return 0 ;; *) return 1 ;; esac; }
```

`cancelled` therefore falls into `*`, and the operator is told the filter
**did not succeed** and that the stack **cannot be determined** — a diagnosis
about the filter's health. What actually happened is that a newer push
concurrency-cancelled the whole run.

| file | guard | message today |
|---|---|---|
| `pr-checks.yml:797-800` | `if ! ok "$R_CHANGES"` | `Paths-filter job did not succeed (result=…) — cannot determine stack.` |
| `deploy.yml:397-400` | `if ! ok "$R_CHANGES"` | `Paths-filter job did not succeed (result=…).` |
| `e2e.yml:583-586` | `if ! ok "$R_FILTER"` | `Paths-filter job did not succeed (result=…) — cannot determine E2E scope.` |

**Observed live:** #3223, run `33489552985` — recorded on the card as F-10 at 09:03Z.

### The decision this implements (MEH-2227 §4ז) — and the thing it deliberately does NOT do

> **The message becomes explicit. `exit 1` STAYS.**

This is the load-bearing half, so it is stated before the diff rather than after
it. Turning this branch into `exit 0` would mean: a run whose `changes` job was
cancelled reports **green** on the head it was aggregating. That is MEH-1582's
class exactly — a gate that passes because nothing ran. And it is unnecessary,
because a cancelled run is by definition superseded by a newer one **on the same
head**, and that newer run is what decides the merge. A red on a superseded run
blocks nothing.

So the fix is honesty in the log, not a change of verdict.

### Hunk A1 — `pr-checks.yml`

`is_cancelled()` already exists at `:761`; this only rewrites the guard.

```diff
--- a/.github/workflows/pr-checks.yml
+++ b/.github/workflows/pr-checks.yml
@@ -795,6 +795,13 @@
           echo "Stack touched -> frontend=$FRONTEND_TOUCHED backend=$BACKEND_TOUCHED"
 
+          # MEH-1907: `cancelled` here is a concurrency-cancel from a newer
+          # push, not a broken paths-filter. Say which one it is. The exit
+          # code deliberately does NOT change: a superseded run reporting
+          # green would be MEH-1582's "passed because nothing ran", and the
+          # newer run on this same head is what decides the merge anyway.
+          if is_cancelled "$R_CHANGES"; then
+            echo "::error::SUPERSEDED — the paths-filter job was cancelled by a newer push on this head. This run's verdict is void; read the newer run. (MEH-1907)"
+            exit 1
+          fi
           if ! ok "$R_CHANGES"; then
             echo "::error::Paths-filter job did not succeed (result=$R_CHANGES) — cannot determine stack."
             exit 1
           fi
```

### Hunk A2 — `deploy.yml`

This file has **no** `is_cancelled` today, so the helper is added beside `ok()`.

```diff
--- a/.github/workflows/deploy.yml
+++ b/.github/workflows/deploy.yml
@@ -394,6 +394,7 @@
           ok() { case "$1" in success|skipped) return 0 ;; *) return 1 ;; esac; }
+          is_cancelled() { [ "$1" = "cancelled" ]; }
           check() { if ok "$2"; then echo "  OK  $1: $2"; else echo "  FAIL $1: $2"; fail=1; fi; }
 
+          # MEH-1907 — see pr-checks.yml for the reasoning. exit 1 stays.
+          if is_cancelled "$R_CHANGES"; then
+            echo "::error::SUPERSEDED — the paths-filter job was cancelled by a newer push on this head. This run's verdict is void; read the newer run. (MEH-1907)"
+            exit 1
+          fi
           if ! ok "$R_CHANGES"; then
             echo "::error::Paths-filter job did not succeed (result=$R_CHANGES)."
             exit 1
           fi
```

### Hunk A3 — `e2e.yml`

Also has no `is_cancelled`. The variable here is `R_FILTER`, not `R_CHANGES`.

```diff
--- a/.github/workflows/e2e.yml
+++ b/.github/workflows/e2e.yml
@@ -577,6 +577,7 @@
           ok() { case "$1" in success|skipped) return 0 ;; *) return 1 ;; esac; }
+          is_cancelled() { [ "$1" = "cancelled" ]; }
           check() { if ok "$2"; then echo "  OK  $1: $2"; else echo "  FAIL $1: $2"; fail=1; fi; }
 
           # Guard the paths-filter result first — mirrors ci-gate's R_CHANGES
           # guard. If the filter itself broke we can't trust the e2e skip
           # decision, so block.
+          # MEH-1907 — see pr-checks.yml. exit 1 stays.
+          if is_cancelled "$R_FILTER"; then
+            echo "::error::SUPERSEDED — the paths-filter job was cancelled by a newer push on this head. This run's verdict is void; read the newer run. (MEH-1907)"
+            exit 1
+          fi
           if ! ok "$R_FILTER"; then
             echo "::error::Paths-filter job did not succeed (result=$R_FILTER) — cannot determine E2E scope."
             exit 1
           fi
```

---

## Part B (F-9) — `check_ran` prints one sentence for two different worlds, and it is false in one of them

### The defect, with a measurement from today rather than a hypothetical

`check_ran` (`pr-checks.yml:784-793`) collapses everything that is not `success`
and not `cancelled` into a single `else`:

```
  FAIL <job>: <result> (required job did not run — 'skipped' is not a pass)
```

That sentence is correct for `skipped`. For `failure` it is **factually wrong** —
the job ran, and it failed. This is not a stylistic complaint; it sends the reader
after the wrong cause.

**Measured on PR #3204, job `99802386270`, 09:13:16Z.** The env block of that very
job records `R_PYTEST: failure` and `R_LINT_BACKEND: failure`, and four lines later
the gate prints:

```
  FAIL Backend tests (pytest): failure (required job did not run — 'skipped' is not a pass)
  FAIL Backend lint (ruff): failure (required job did not run — 'skipped' is not a pass)
```

Both jobs ran. Both failed, together, because dependabot bumped
`backend/pyproject.toml` without regenerating `backend/uv.lock`, so
`uv sync --locked` refused before either job did any work of its own. Nothing was
skipped. A reader who trusts the gate's own wording goes looking for a suppressed
job and finds none.

### Hunk B1 — three outcomes, three messages

```diff
--- a/.github/workflows/pr-checks.yml
+++ b/.github/workflows/pr-checks.yml
@@ -784,10 +784,17 @@
           check_ran() {
             if is_cancelled "$2"; then
               echo "  SUPERSEDED $1: $2 (a newer push cancelled this run — not counted as a failure, MEH-1907)"
             elif strict_ok "$2"; then
               echo "  OK  $1: $2"
+            elif [ "$2" = "skipped" ]; then
+              # MEH-1582: the gate is enforcing this job, so a skip is an
+              # absence of evidence — a draft or an `if:` suppressed it.
+              echo "  FAIL $1: skipped (required job did not RUN — 'skipped' is not a pass, MEH-1582)"
+              fail=1
             else
-              echo "  FAIL $1: $2 (required job did not run — 'skipped' is not a pass)"
+              # MEH-1907 F-9: the job DID run and reported $2. Saying "did not
+              # run" here sends the reader after a suppressed job that does not
+              # exist — measured on #3204/#3205, where both backend jobs ran and
+              # failed on a uv.lock mismatch.
+              echo "  FAIL $1: $2 (the job ran and did not pass — read its log, this is not a skip)"
               fail=1
             fi
           }
```

**`fail=1` is set on both new branches.** The verdict is unchanged in every case;
only the sentence differs. That is deliberate — this patch must not be able to
change what merges.

---

## How to tell it worked

Not "the gate is green" — that proves nothing here, since neither part changes any
verdict. The evidence is **the strings**:

1. **B1, cheapest and already reproducible:** re-run the gate on a PR whose backend
   jobs genuinely fail (#3204 and #3205 before their lock fix are the exact case,
   and both are recorded above with job ids). The line must read `the job ran and
   did not pass`, and must **not** contain `did not run`.
2. **B1, the other leg:** a draft PR that suppresses `Backend tests (pytest)` must
   still print `required job did not RUN` with the `MEH-1582` marker.
3. **Part A:** push twice in quick succession so the first run is
   concurrency-cancelled, then read the cancelled run's aggregator: it must say
   `SUPERSEDED` and name the newer run, and it must still **exit 1**.

Check 3 is the one worth actually performing, because it is the only one where a
mistaken `exit 0` would be invisible in the message and visible only in the verdict.

---

## Scope — what this deliberately leaves alone

* **F-1 hunks.** Untouched, per MEH-2227 §4ז.
* **`deploy.yml` / `e2e.yml` `check()`.** Those still use the two-state `ok()`, so a
  *cancelled dependency job* (as opposed to a cancelled filter) is reported as a
  plain `FAIL` there. Same family as Part A and a reasonable follow-up — **not
  folded in here**, because §4ז scopes this patch to the filter guard plus F-9, and
  widening a workflow patch that someone else has to apply by hand is how a
  three-hunk change becomes a review problem.
* **Verdicts.** No `exit` code changes anywhere in this document.

_Refs MEH-1907. Drafted by drain יא', `Drain-Session: 01FK56Pd-drain-ya`, against
`origin/staging` `3bf10d04`._
