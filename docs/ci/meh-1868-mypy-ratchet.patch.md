# MEH-1868 chunk 0/3 — arm the mypy gate via the ratchet

**Sapir applies this. `.github/workflows/**` is CC-deny (MEH-671), so the diff
below is staged, not applied.** Sibling doc:
[`meh-1868-knip-ratchet.patch.md`](./meh-1868-knip-ratchet.patch.md), which
covers `frontend-knip` and states in its own "does NOT touch" section that
`backend-mypy` was left for a separate chunk. This is that chunk.

The repo-side half — pinning `mypy` and proving the comparator runs — ships in
the PR that carries this doc. **Apply the diff below only after that PR is on
`staging`**; the ordering is load-bearing and §"Precondition" says why.

---

## Why the current job is a non-gate — and it is worse than warn-only

`backend-mypy` carries the same two swallows the Knip doc found, at the same
two levels:

| Layer | Line | Text |
|---|---|---|
| job level | `:524` | `continue-on-error: true` |
| step level | `:541` | `uv run mypy app/auth.py --strict \|\| true` |

The job's own comment (`:505-510`) calls this "belt-and-braces" and is explicit
that it is deliberate. Removing only `|| true` buys nothing: the job would still
report success and `ci-gate` would still read it as success. **Both layers go.**

**But the sharper fact, and the reason this card exists at all:** the step has
**never executed mypy even once**. Measured 2026-08-03 on CI job `91623752935`
(staging, 07:34:23Z), step duration **0 seconds**:

```
error: Failed to spawn: `mypy`
  Caused by: No such file or directory (os error 2)
```

`mypy` was absent from the `dev` dependency group and from `uv.lock`, and
`|| true` swallowed the spawn failure. **Re-verified on `origin/staging`
2026-08-12: still absent** — `grep -c '^name = "mypy"' backend/uv.lock` → `0`.

So this is not a gate reporting without blocking. It is a gate reporting
**success for a tool that was never installed** — the skip-green family, in its
purest form: a green whose other cause is "nothing ran."

---

## Precondition — satisfied by the PR carrying this doc, and it must land first

Arming the job while `mypy` is still unpinned turns it red with a **spawn
error** rather than a verdict, which is a worse signal than today's false green
because it looks like a code problem and is not.

The PR that adds this doc therefore also adds, in `backend/pyproject.toml`:

```diff
 [dependency-groups]
 dev = [
     "mutmut>=3.6.0",
+    "mypy==2.3.0",
     "pip-audit>=2.10.0",
```

plus the regenerated `backend/uv.lock`.

**Why `==` and not `>=`, against this file's convention.** Every other entry in
that group is `>=`. None of the others is baseline-anchored; this one is. The
frozen counts in `backend/mypy-baseline.txt` are stamped
`Frozen 2026-08-04 from mypy 2.3.0`, and a minor mypy release that adds a check
raises counts for a reason unrelated to any diff — reddening the gate on
whichever PR happens to be open when the bump lands. A pin makes the baseline
reproducible; upgrading becomes a deliberate commit that re-freezes the counts
in the same change. **Flagging it as the one convention deviation here** rather
than burying it.

---

## The diff — four changes

Line numbers are against `origin/staging` at `a3fd7998`. The PR carrying this
doc touches no workflow file, so they do not shift.

### 1 · Drop the job-level swallow (`:524`)

```diff
   backend-mypy:
-    name: Backend mypy (strict, warn-only)
+    name: Backend mypy (ratchet)
     needs: changes
     if: ${{ needs.changes.outputs.backend == 'true' || needs.changes.outputs.workflows == 'true' }}
     runs-on: ubuntu-latest
     timeout-minutes: 10
-    continue-on-error: true
```

As in the Knip doc: with `continue-on-error: true` on the job,
`needs.backend-mypy.result` is `success` no matter what the step did, so the
aggregator change in §4 would be inert on its own.

### 2 · Replace the warn-only step with the ratchet (`:540-542`)

```diff
-      - name: Run mypy strict on app/auth.py (warn-only — errors logged, check passes)
-        run: uv run mypy app/auth.py --strict || true
+      - name: mypy ratchet (frozen baseline — only increases fail)
+        run: uv run python scripts/mypy_baseline.py
         working-directory: backend
```

`scripts/mypy_baseline.py` runs mypy itself with `--output=json` and compares
per `(file, error-code)` against `backend/mypy-baseline.txt`. It exits non-zero
**only** when a count rises above its frozen value. All 20 existing errors are
grandfathered — nobody is asked to fix one as part of this card, which is the
design and not an oversight.

It also refuses to treat a tool crash as a verdict: mypy exiting `>= 2` (a
config or spawn error) makes the script fail loudly instead of reporting
"0 errors, below baseline." That guard is what keeps the original failure from
recurring in a new costume.

### 3 · Update the job comment (`:499-517`)

The existing block documents the two-layer warn-only design as intentional and
points at `docs/research/static-analysis-baseline.md` for regression tracking.
Both statements stop being true when the diff above lands.

```diff
   # ─────────────────────────────────────────────
   # JOB 5: backend-mypy (MEH-562 Layer 2)
   # Strict mypy on app/auth.py only — scoped from
   # auth.py + schemas/ due to STOP-condition (a):
   # combined count was 57 errors > 50 threshold.
   #
-  # Two-layer warn-only:
-  #   1. `|| true` on the mypy command → step exits 0 → check
-  #      reports green even when mypy finds errors. Clean PR UX
-  #      (the owner's call — see HANDOFF entry for MEH-562).
-  #   2. `continue-on-error: true` at the job → defensive belt-
-  #      and-braces: if `|| true` is ever stripped during a future
-  #      edit, the workflow still doesn't fail.
-  #
-  # Errors stay visible in the workflow logs and in
-  # docs/research/static-analysis-baseline.md. Regression
-  # tracking lives in the git history of the baseline doc, not
-  # in the check status. Hybrid annotation upgrade (post baseline-
-  # vs-current as a PR comment) is a follow-up ticket post-launch.
+  # MEH-1868: ratcheted, no longer warn-only. Both swallows are
+  # gone (`|| true` and `continue-on-error`) — they reported
+  # success for a tool that was never installed (spawn failure,
+  # job 91623752935, 0s). `mypy` is now pinned in the dev group.
+  #
+  # backend/mypy-baseline.txt freezes the 20 errors that existed
+  # at arming time, keyed by (file, error-code) and NOT by line
+  # number. Everything in the baseline is grandfathered; only a
+  # count that RISES fails the job. Raising one requires an
+  # explicit --allow-increase, so loosening is visible in review.
   # ─────────────────────────────────────────────
```

### 4 · `check` → `check_ran` in the aggregator (`:787`)

```diff
-            check "Backend mypy (strict, warn-only)" "$R_BACKEND_MYPY"
+            check_ran "Backend mypy (ratchet)" "$R_BACKEND_MYPY"
```

Identical reasoning to the Knip doc's §4: `check` accepts `skipped` as a pass,
so once the job can genuinely fail, a draft-suppressed or otherwise skipped run
would report green having never executed. The file's own comment at `:751-753`
states the rule — *"a job that the gate is actively enforcing must have RUN…
`skipped` there means an absence of evidence, not a pass."*

> **The same `frontend || workflows` asymmetry the Knip doc records applies
> here, unchanged.** The job's `if:` is `backend == 'true' || workflows ==
> 'true'`, while `BACKEND_TOUCHED` is `needs.changes.outputs.backend` alone — so
> on a workflows-only PR the job runs and could fail while the aggregator never
> reads its result. **Pre-existing, not introduced here**, and identical to what
> the Knip doc already documented for `frontend-knip`. Recorded, not fixed:
> aligning the `*_TOUCHED` variables with the jobs' `if:` conditions is a
> separate change with a wider blast radius than this card.

---

## Evidence — the controls, run for real

The card requires both directions proven with real output rather than reasoned
about. Run on this branch after pinning mypy, from `backend/`:

**The gate now actually runs, and reproduces the frozen count:**

```
$ uv run python scripts/mypy_baseline.py
mypy-baseline: 20 error(s) now, 20 in baseline
OK — no count rose above baseline.
EXIT: 0
```

**Control 1 — seeded increase (baseline lowered `type-arg` 5 → 4):**

```
mypy-baseline: 20 error(s) now, 19 in baseline

FAILED — 1 key(s) rose above baseline:
  app/auth.py	type-arg	4 -> 5  (+1)

Existing errors are allowed; new ones are not. Fix the new error,
or record it deliberately with:
  python scripts/mypy_baseline.py --update-baseline --allow-increase
EXIT: 1
```

**Control 2 — seeded decrease (baseline raised `type-arg` 5 → 6):**

```
mypy-baseline: 20 error(s) now, 21 in baseline

IMPROVED — 1 key(s) went down:
  app/auth.py	type-arg	6 -> 5  (-1)
Run with --update-baseline to lock the improvement in.
OK — no count rose above baseline.
EXIT: 0
```

The baseline file was restored between and after both controls (`git diff` on
it is empty in the shipped branch).

**Why the first block is the load-bearing one.** The two controls exercise the
comparator's arithmetic, which PR #2614 already established. What was never
shown before is that the thing runs *at all* under the CI invocation — and for
the eight days between #2614 landing and this doc, it did not.

---

## Absence assertion (the card asks for this numerically)

After applying, `pr-checks.yml` must contain **exactly one** mypy invocation —
the warn-only step is *replaced*, never left alongside:

```bash
grep -c "uv run mypy\|mypy_baseline.py" .github/workflows/pr-checks.yml
# expected: 1   (the mypy_baseline.py line)

grep -n "uv run mypy" .github/workflows/pr-checks.yml
# expected: no output

grep -c "continue-on-error" .github/workflows/pr-checks.yml
# expected: one fewer than before the patch
```

Measured on `origin/staging` before the change: `uv run mypy` appears **once**,
at `:541`. `mypy_baseline.py` appears **zero** times.

---

## What this does NOT touch

- **`frontend-knip`** — its own doc, already written and merged.
- **`frontend-tsc-strict`** and **`linear-mentions`** — both explicitly dropped
  from scope by chunk 1's Phase 0 findings. The `linear-mentions` case is worth
  one line because it is easy to re-propose: it is **not in `ci-gate`'s
  `needs:`** at all, so removing its swallows would change nothing about merge
  blocking; making it bite needs a third edit with a different blast radius.
- **`[tool.mypy] files = [...]`** at `backend/pyproject.toml:120`, which
  declares a five-file scope that the CI step overrides by passing an explicit
  path. The config declares a scope CI ignores. Recorded by chunk 0 as a
  separate concern; deliberately untouched, because widening the scope here
  would change the frozen count under the baseline that was just proven.
- **Any existing mypy error.** Zero are fixed. The baseline grandfathers all 20.

---

## ❓ One question for Sapir — the same judgement call the Knip doc raises

**Should `backend-mypy` become a genuinely merge-blocking leg?**

Changes 1–3 make the job *fail visibly* on a new type error. Change 4 makes that
failure **block the merge**, because `ci-gate` is a required context.

- **Applying all four** is what the card asks for. Risk: a PR that legitimately
  introduces a new typed-dict or untyped third-party import is blocked until the
  baseline is bumped with `--allow-increase`.
- **Changes 1–3 only** gives an honest red without merge-blocking — strictly
  better than today and reversible in one line.

**Recommendation: apply all four**, for the reason the card's own evidence
supplies. A gate that reports without blocking is what let a *completely
uninstalled tool* look green for months; 1–3 alone would fix the tool but leave
the "nobody has to look" property that hid it.

Whichever you choose, the `mypy==2.3.0` pin should land either way — without it
the current step is a no-op regardless of what the swallows do.
