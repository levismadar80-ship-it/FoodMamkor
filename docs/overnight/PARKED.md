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
