# MEH-1873 — `timeout-minutes: 3 → 10` on the two light checkout jobs

**Status:** staged for Sapir. `.github/workflows/**` is CC-deny (MEH-671).

**What this is:** a **blast-radius reduction**, not a fix. Read the "What this does NOT
claim" section before applying — the honest case for this patch is narrower than the
diff makes it look, and Phase 0 explicitly declined to write it on the evidence alone.

---

## The diff

Two jobs in `.github/workflows/pr-checks.yml`. One line each.

```diff
   repo-guards:
     name: Repo guards
     runs-on: ubuntu-latest
-    timeout-minutes: 3
+    timeout-minutes: 10
     steps:
       - uses: actions/checkout@v7
       - name: Run every guard in scripts/checks/ (MEH-999)
         run: bash scripts/checks/run-all.sh
```

```diff
   env-drift:
     name: Env drift (.env.example)
     if: ${{ github.event.pull_request.draft == false }}
     runs-on: ubuntu-latest
-    timeout-minutes: 3
+    timeout-minutes: 10

     steps:
       - uses: actions/checkout@v7
```

Line anchors as of `origin/staging` @ `03eab298`: `repo-guards`'s `timeout-minutes` is
**`pr-checks.yml:82`**, `env-drift`'s is **`pr-checks.yml:503`**. Anchor on the job keys,
not the numbers — this file moves.

---

## Why exactly these two jobs and nothing else

The selection rule is mechanical: **a job is exposed iff it runs `actions/checkout` AND
its timeout leaves no headroom over its healthy runtime.** Enumerated from the live file
rather than assumed:

| Job | `timeout-minutes` | Has `actions/checkout`? | In scope? |
|---|---|---|---|
| `repo-guards` (:82) | **3** | yes | **yes** — hung on #2554, #2556, #2462 |
| `env-drift` (:503) | **3** | yes | **yes** — hung on #2552 |
| `do-not-merge-gate` (:65) | 2 | **no** — reads PR title/body only | no |
| `ci-gate` (:723) | 3 | **no** — pure `needs:` aggregation | no |
| `changes` / Paths filter (:139) | 5 | yes | no — never observed hanging; 5 is not the 3-minute cliff |
| `build`, `ai-artifact-scan` (15) · `pytest` (30) · `lint-backend` (5) · `qa-artifacts-size`, `backend-mypy`, `frontend-knip`, `frontend-tsc-strict`, `frontend-vitest`, `pip-audit` (10) | ≥5 | yes | no — already have headroom |

`do-not-merge-gate` and `ci-gate` also carry tight timeouts (2 and 3) and are deliberately
**left alone**: with no checkout step there is no checkout to hang in, so raising them
would buy nothing and would weaken a real bound. That is the whole reason this patch is
two lines and not sixteen.

The two in-scope jobs are the same two the card measured, and they share the property that
makes the cliff bite: **checkout is nearly their entire runtime.** A healthy `Repo guards`
cycle is ~14s; the ceiling is 3 minutes. There is no other work in the job to absorb a
stall, so any checkout slowdown goes straight through the ceiling.

---

## The evidence, and what it actually supports

| Date | PR | Job | Observed |
|---|---|---|---|
| 31/07 | #2462 | `Repo guards` | hung in `git fetch --depth=1` 16:50:29 → cancelled 16:53:27, **zero guards run**; re-run logged `9 guard(s) ran, 1 warned` |
| 03/08 | #2552 | `Env drift` | checkout 08:31:25 → `08:34:23 ##[error]The operation was canceled`, zero work |
| 03/08 | #2554 | `Repo guards` | 08:50:33 → 08:53:31 cancelled, zero guards |
| 03/08 | #2556 | `Repo guards` | ~08:54 → ~08:57 cancelled, zero guards |
| 06/08 | #2636, #2645 | `Repo guards` | 3m05s / 3m18s vs 14s healthy — **during a repo-wide GitHub Actions service incident** (`Failed to resolve action download info: Service Unavailable`) |
| 13/08 | — | Phase 0 census | **zero** matching hangs in 299 runs / 63 cancellations over ~21h (`docs/audits/2026-08-13-meh1873-checkout-cancel-baseline.md`) |

Two facts constrain the reading, and they point in opposite directions:

- **Not supersession.** Verified per incident: `run_attempt: 1`, no newer run for the head
  SHA, and **sibling jobs in the same run ran to completion**. Supersession cancels the
  whole run. (Workflow rule 21 documents why this distinction inverts the remedy: you
  *wait* on supersession, you *re-run* a hang.)
- **Not repo size.** In the same run where `Repo guards` hung 3 minutes, `Frontend build`
  completed its checkout in **7 seconds**. `--depth=1` on 3,918 files is not the variable.

---

## Verdict: infra cause, repo-side amplifier

The two halves are separable, and conflating them is what made this card look
contradictory for eleven days:

- **The stall is infrastructure.** Nothing in the repo explains a checkout that takes 7s
  in one job and >3min in a sibling of the same run, then vanishes for 299 consecutive
  runs. It is not reproducible, not correlated with the diff, and its one dated
  recurrence sits inside a declared GitHub incident.
- **The damage is repo configuration.** A transient upstream stall becomes a **red
  required gate** only because `timeout-minutes: 3` sits ~13× above a healthy 14s run with
  no slack, and because the aggregator maps `cancelled → FAIL`. That conversion is ours.

So there is nothing to fix about the *cause*, and something cheap to fix about the
*consequence*. This patch addresses the second half only. That is also why Phase 0's
"no repo-side fix is indicated" and this patch's existence are not in conflict — Phase 0
was answering the cause question, correctly.

---

## What this does NOT claim

Stated plainly, because a patch file gets inherited as a conclusion:

1. **It does not fix the hang.** If checkout stalls indefinitely, a 10-minute ceiling
   cancels it just as dead as a 3-minute one. This buys headroom over *slow*, not immunity
   to *stuck*.
2. **There is no measured hang between 3 and 10 minutes.** The recorded stalls all landed
   at ~3m00–3m18s — i.e. they were cut off *at* the ceiling, so their true duration is
   unknown and could be anything above 3 minutes. **The ceiling censored the very
   measurement that would size the fix.** 10 is a judgement call with margin, not a value
   derived from data.
3. **It is not validated by Phase 0's clean census.** Zero recurrences in 299 runs is
   evidence the problem is rare, which cuts *against* urgency as much as it supports
   safety. Nothing here was tested against a live hang, because none has occurred since.
4. **The known cost is accepted, not hidden.** A genuinely wedged job now occupies a
   runner for **10 minutes instead of 3** before the ceiling fires. On the two cheapest
   jobs in the file, at the observed rate (4 incidents in ~2 weeks, then zero in 3), that
   is a few extra runner-minutes a month against the removal of a false red on a required
   gate. That trade is the entire argument for this patch.

The card's own 06/08 addendum reached the same place independently — *"הרחבת timeout
ל-10 דק' זולה ובטוחה בכל מקרה"* — and this patch is that sentence, with the cost named.

---

## After applying

`.github/workflows/**` pushes by Sapir do fire workflows normally (unlike the
`GITHUB_TOKEN` bot-push case in MEH-1112/1113), so no re-trigger commit is needed.

**How to tell it worked — and the honest answer is that you mostly can't, quickly.** The
success condition is the *absence* of a rare event, which is exactly the null that this
repo's testing rules warn cannot be read as evidence. The check that does discriminate:
if a `Repo guards` or `Env drift` job ever again reports `cancelled` after this lands,
read its log — a run that got past 3 minutes and **completed** is the patch working; a run
cancelled at 10:00 with zero guards is the patch not being enough, and that is the datum
point 2 above is missing.

Refs MEH-1873
