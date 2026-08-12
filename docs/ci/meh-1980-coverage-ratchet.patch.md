# MEH-1980 — wire the coverage ratchet into CI

**Staged for Sapir. CC cannot apply this**: `.github/workflows/**` is
mechanically denied (`.claude/settings.json` `permissions.deny`), per MEH-1837.

**Precondition:** the script, the frozen baseline and the vitest coverage config
land in the same PR as this file. Applying either change below before that PR is
on `staging` red-lines the job on a missing script.

**As of 2026-08-12**, against `pr-checks.yml` at `origin/staging`. Line numbers
drift — match on content, not position.

---

## Two independent changes. Change B is the one with a real decision in it.

| | What | Risk |
|---|---|---|
| **A** | Frontend: run coverage + the ratchet in the existing vitest job | Low — new gate, baseline frozen at today's number |
| **B** | Backend: turn the existing static floor (`--cov-fail-under=70`) into a ratchet | **Judgement call — see below** |

---

## Change A0 — REQUIRED, and it is the one that makes A worth anything

**`scripts/checks/**` matches no paths-filter category**, so a PR touching only
the ratchet script or its baseline sets `frontend=false`, skips
`frontend-vitest` entirely, and lands with `ci-gate` taking its *"Neither stack
touched"* branch. The gate can be defanged — `regressed: false`, tolerance
raised to 100, baseline `globalPct` hand-edited to 0 — with **zero required-check
coverage**.

The compounding case is worse: a PR that weakens the comparator **and** regresses
coverage does trigger the job (frontend touched), and then runs the self-test and
comparator **from the same commit that just weakened them**. The gate evaluates
itself against its own defanged copy. Same shape MEH-420 closed for skills, where
`computedHash` was decorative metadata no script read.

```diff
             frontend:
               - 'frontend/**'
               - 'package.json'
               - 'package-lock.json'
+              # MEH-1980 / MEH-1868: the ratchets and their baselines gate the
+              # frontend job, so an edit to EITHER must force that job to run.
+              # Without these lines a PR touching only these files skips the very
+              # job that would have checked them.
+              - 'scripts/checks/coverage-ratchet.mjs'
+              - 'scripts/checks/coverage-ratchet-baseline.json'
+              - 'scripts/checks/lint-ratchet.mjs'
+              - 'scripts/checks/lint-ratchet-baseline.tsv'
```

**The two `lint-ratchet` lines belong to MEH-1868 and are included here on
purpose** — it has the identical gap today, currently inert only because its own
CI patch is likewise unapplied. Whichever patch is applied first should carry
them; applying both is harmless (duplicate globs are a no-op).

**Apply A0 with A.** Change A alone arms a gate that a later PR can quietly
disarm.

---

## Change A — frontend (`:630-631`)

```diff
       - name: Run vitest unit suite
-        run: npx vitest run
+        run: npx vitest run --coverage
+
+      - name: Coverage ratchet self-test (the comparator must still discriminate)
+        run: node ../scripts/checks/coverage-ratchet.mjs --self-test
+
+      - name: Coverage ratchet (baseline frozen; only a DROP fails)
+        run: node ../scripts/checks/coverage-ratchet.mjs
```

Three notes, because each is a decision rather than a default:

1. **`--coverage` goes on the existing run, not a second one.** The suite takes
   ~5 min; running it twice to keep an uninstrumented pass would double the
   critical path for no signal. Instrumentation slows the run somewhat — measure
   it on the first CI run and, if it is material, that is an argument for a
   separate scheduled job, not for dropping the gate.
2. **The self-test runs FIRST.** Expected exit **0** — it is an ordinary
   assertion suite, so a bare `run:` is correct. (No count is quoted here on
   purpose: the script prints its own `ran.length`, and a number written into a
   doc goes stale the moment a case is added. This line said "16 assertions"
   until the CI reviewer measured 23 on PR #2813 — the suite is 25 as of the
   shrink-routing case added after that review, which is itself the argument.)
   Do **not** copy
   `skills-audit.yml`'s `if … then` inversion here; that script exits 1 on
   success because it audits a deliberately-malicious fixture. Getting this
   backwards reds the gate permanently, and it is the exact mistake the CI
   reviewer proposed on the Knip ratchet.
3. **`working-directory: frontend`** is already set at job level (`:619`), which
   is what makes `../scripts/…` resolve. The script re-derives the repo root
   from its own location regardless, so it is robust either way.

**No aggregator change needed.** `ci-gate` already gates this job with
`check_ran "Frontend unit tests (vitest)"` at `:808`, and `check_ran` already
rejects `skipped`. The ratchet failing fails the job, which the gate already
reads correctly.

---

## Change B — backend: floor → ratchet (`:396-404`)

The backend already measures coverage and already gates on it. What it does
**not** have is a ratchet: `--cov-fail-under=70` is a static floor, and the
comment above it records a baseline of 77% with the threshold set 7pt below.

**That 7-point gap is dead space.** Coverage can fall from 77% to 70.01% — seven
points, thousands of lines — and the gate stays green the whole way.

```diff
       - name: Run tests with coverage gate
         run: |
           backend/.venv/bin/python -m pytest tests/ \
             --cov=backend/app \
             --cov-report=xml \
             --cov-report=html \
             --cov-report=term \
-            --cov-fail-under=70 \
+            --cov-fail-under=<CURRENT> \
             --tb=long --timeout=60
```

### ⚠️ `<CURRENT>` is deliberately not a number in this patch

I could not measure backend coverage: the CC sandbox has no postgres
(`localhost:5432 - no response`) and no `backend/.venv`. Writing a number I did
not measure is exactly the failure the freeze-time rule exists to prevent, so
this patch leaves a placeholder instead of a plausible-looking guess.

**To fill it in**, read the `TOTAL` line from the most recent
`Backend tests (pytest)` job and set the threshold to that figure **rounded
down to the whole point**. Rounding down is what absorbs ordinary run-to-run
noise; it is the backend analogue of the frontend's 0.5pt tolerance.

**Do not use 77.** The workflow comment says *77% (5,529 statements)*, but
MEH-1911's stability proof measured *89% across 8,923 statements*. Those
disagree by 3,400 statements, which is consistent with the comment simply being
old — but **I have not established that**, and it is flagged on MEH-1980 rather
than resolved here. Take the number from a current run, not from either figure.

### The judgement call

**Should the backend floor become a ratchet at all?**

- **For:** a 7pt dead zone means the gate cannot see a large regression. Raising
  it to the current value costs nothing today — the suite already passes there
  by definition — and every future drop becomes visible.
- **Against:** a tight threshold reds the backend job on ordinary variance, and
  unlike the frontend ratchet there is no tolerance band built in. `pytest-cov`
  has no "within 0.5pt" mode; rounding down is the only slack available.
- **The middle option:** raise the floor to `<CURRENT> − 2` rather than
  `<CURRENT>`. Recovers most of the dead space, keeps a real buffer, and is one
  number to change later.

**Recommendation: the middle option**, `<CURRENT> − 2`. It removes the bulk of
the dead zone while keeping the backend job's failure mode boring. But this
tightens a **required** gate on a suite that takes ~12 minutes, so it is yours.

**Change A does not depend on Change B.** Apply A alone if B needs more thought.

---

## Absence assertion

After applying A, `pr-checks.yml` must contain **exactly one** vitest
invocation — the uninstrumented run is *replaced*, not left alongside:

```bash
grep -c "npx vitest run" .github/workflows/pr-checks.yml
# expected: 1   (the --coverage line)

grep -n "npx vitest run$" .github/workflows/pr-checks.yml
# expected: no output — no bare invocation remains
```

Measured on `origin/staging` before the change: `npx vitest run` appears
**once**, at `:631`, with no `--coverage`.

---

## What this does NOT touch

- **`frontend-knip`** — MEH-1868's patch (`docs/ci/meh-1868-knip-ratchet.patch.md`)
  owns that job and is still unapplied. The two are independent; applying either
  alone is fine.
- **Any existing uncovered file.** Zero tests are added by MEH-1980. The
  baseline grandfathers all of them, which is the design.
- **`backend/pyproject.toml`** — the `[tool.mypy] files=` scope mismatch noted in
  MEH-1868's chunk 0 is still open and is not in scope here.
