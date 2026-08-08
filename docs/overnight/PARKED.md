# Overnight sweep v2 — dead-letter queue

> A parked task is one that hit the 30-minute timebox, a second failed attempt
> on the same problem, or a PERMANENT failure class (no_stall_architecture §3/§5).
> Parking is per-task; the sweep continues.

Session: 2026-08-07 → 08.

---

## Parked: **none**

**No task was parked tonight, and no circuit breaker opened.** Nothing hit the
timebox, no problem took a second failed attempt, and no failure signature
repeated across tasks.

That is a real outcome and not a claim of a clean sweep — the sweep was short on
*eligible* work, not on obstacles. See PROGRESS.md: four of the eight seed items
were already finished before the session started, so the queue drained by
already-being-done rather than by being worked.

## One near-park, recorded because it was close

Recovering the producer path for the CLS dispatch took three attempts:

1. `grep` over `HANDOFF.md` / `CHANGELOG.md` — no hit.
2. `curl` against live staging to read an id off `/producers` — **blocked**, and
   the block is worth writing down: `staging.mehamakor.online` sits behind
   **Vercel SSO** from the CC sandbox (`302` → `vercel.com/sso-api`). This is a
   *different* barrier from the documented `*.up.railway.app` egress deny in
   CLAUDE.md, and it is not currently recorded anywhere in `.claude/rules/`.
3. Workflow run metadata via `list_workflow_runs` — inputs are **not** carried in
   the run object.

The fourth attempt worked: the harness logs `path=` at startup
(`qa-meh1853-cls.mjs:689`), so the prior run's job log has it verbatim. Recorded
because the next session will hit the same wall, and because attempt 2's finding
is reusable.

**Timebox status at resolution:** ~6 minutes on that sub-task, well inside the 30.
Had attempt 4 failed, the park was already drafted: merge the instrument, hand
Sapir the one-line dispatch, and let the reading happen in the morning.

---

## Circuit breaker

No signature reached the 3-park threshold. Nothing quarantined. No half-open
probe needed.

---

## PARKED (added at end of night): merging PR #2678 — the docs-only backfill

**Task:** merge the docs-only session log. **Status: parked after 2 attempts, per
the max-2 rule. The PR is open, pushed, and complete — only the merge is blocked.**

**The block:**

```
PUT /repos/.../pulls/2678/merge -> 405 Repository rule violations found
2 of 2 required status checks are expected.
```

**Why that is strange, and why I stopped instead of working around it** — both
required contexts report `success` on the head SHA (`2082286c`):

| check | id | conclusion |
|---|---|---|
| `CI gate (required)` | 93010793341 | **success** |
| `Deploy gate (required)` | 93010760760 | **success** |

`E2E gate` is also `success` (Playwright correctly `skipped` on a docs-only diff).
So the ruleset is reporting as `Expected` two contexts that have in fact
completed successfully.

**One difference from PR #2676, which merged minutes earlier with no trouble:**
#2678 is **docs-only**, so every named job under both aggregators `skipped`. That
is the documented and intended path (`testing.md` → "Required status checks +
docs-only merge", MEH-716) — a skipped leg is supposed to let the aggregator
report `success`, which it did. The aggregators are green; the *ruleset* is not
accepting them. I could not close that gap from the evidence available.

**What I did NOT do, deliberately:** no no-op commit to re-trigger the gates, no
edit to PR metadata, no `force`. Rule 30 — a blocking gate is a STOP, and
"re-trigger until it goes through" is precisely the neutralisation that rule
forbids. Waiting once and retrying once is the sanctioned remedy and it is what I
did; it did not clear.

**Failure class:** ~~PERMANENT for this session — it needs a ruleset inspection
(GitHub settings), which is Sapir's surface. Not transient, so no further retry.~~

> ## ❌ CORRECTED 2026-08-08 — that diagnosis was WRONG. It was TRANSIENT.
>
> **PR #2678 merged on night 2** (`e1c3af52`) with no ruleset change, no settings
> change, and nothing done by Sapir. The remedy was simply **waiting longer for the
> required gates to register.**
>
> What night 2 measured: immediately after pushing, `CI gate (required)` read
> `status: queued` on the head SHA, and the merge API answered with the identical
> *"2 of 2 required status checks are expected"*. After the gates completed
> `success`, the very next merge attempt succeeded. That is the documented
> transient — `.claude/rules/testing.md`, *"Transient 'waiting for status /
> expected' right after push = the required gates are still registering"* — and it
> was in the rules the whole time.
>
> **Why the night-1 call still looked defensible, and why that is the lesson.** On
> night 1 both gates *did* read `success` when I queried them, which is what made
> me rule out the transient. But a check-run reporting `success` and the **ruleset**
> having ingested it are two different facts, and I treated the first as evidence of
> the second. The correct next step was another wait, not a classification.
>
> **The concrete cost of getting it wrong:** it wrote "needs a ruleset inspection —
> Sapir's surface" into the repo, pointing a human at a GitHub setting that was
> never broken. A confident wrong cause in a log becomes someone's wasted hour. The
> park itself cost nothing; **the diagnosis attached to it did.**
>
> **What to keep:** refusing the no-op re-trigger commit (below) was still right,
> and is unaffected by this correction. The error was in the label, not the
> restraint.

**Cost of leaving it was none, and it was collected on night 2.** The branch stayed
pushed with the PR open, and the whole log merged intact once the gates settled.

**Not a circuit-breaker event** — one signature, one task, and it resolved on its
own terms.
