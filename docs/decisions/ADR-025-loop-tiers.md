# ADR-025: Loop-primitive authority by risk tier — /goal, /loop, /schedule

**Status:** Accepted · Extends [ADR-016](./ADR-016-risk-tier-nomenclature.md) (GREEN/YELLOW/RED) to autonomous loop primitives
**Date:** 2026-07-09
**Deciders:** Sapir Levi
**Source:** MEH-1052

## Assumptions (verify before merge)
- ADR-016's GREEN/YELLOW/RED tiers are the canonical risk vocabulary; this ADR
  maps loop primitives onto them and does not redefine the tiers.
- The `mehamakor-dod` skill (`.claude/skills/mehamakor-dod/check.sh`, MEH-1052)
  exists and its `exit 0` is a faithful mechanical proxy for the DoD's
  build + tests + guard half — NOT for `/adversarial-review` (rule 5a), which
  remains a human/judgment gate.
- Workflow rules 17, 23, 25 already constrain `/goal` and `/loop`; this ADR is
  the single reference they point at rather than each re-deriving tier scope.

## Context

Three primitives let Claude Code act across turns without a human in the loop
each turn: `/goal` (work until one mechanical condition is met), `/loop` (re-run
a prompt on an interval), and `/schedule` routines (fire a prompt on a cron/
one-shot into a session). Their authority was scattered — workflow rule 23
capped `/goal` on UI work, rule 17 listed `/loop` babysit patterns, rule 21
warned on false-green CI — with no single map of *which primitive is allowed at
which risk tier*. The gap: an agentic loop could self-declare "done" with no
mechanical DoD proxy, exactly the MEH-373 subagent-approximation-drift family
(an evaluator judging work it can't actually verify).

MEH-1052 closes both halves: an executable DoD (`mehamakor-dod`) gives the loop
a single exit code to check, and this ADR bounds *where* loops may run at all.

## Decision

Loop-primitive authority maps onto ADR-016 tiers as follows.

### GREEN — low risk

- **`/goal` end-to-end allowed.** Plan → execute → PR with no intermediate
  human approval.
- **Turn cap: 15.** The `/goal` string must carry an explicit turn/runtime cap
  ≤ 15 turns; exceeding it is a STOP condition (rule 17 risk-tiering).
- **`mehamakor-dod` must pass before "done".** A GREEN `/goal` stop condition
  ends only after `bash .claude/skills/mehamakor-dod/check.sh` exits 0. "Done"
  without a green DoD check is not done.
- **Scope:** docs, copy, i18n sweeps, single-file dependency bumps, tests,
  non-behavioral CI/config, non-central single-file fixes.

### YELLOW — medium risk

- **`/goal` per chunk only.** No end-to-end run across the whole task. Each
  chunk (a multi-file refactor of 3–7 non-central files, copy-with-logic such
  as ICU plural rules, behavior-changing workflow YAML) gets its own `/goal`.
- **WAIT gates preserved.** The per-chunk WAIT gate from the risk-tiered review
  flow stays in force between chunks; the loop may not cross a WAIT gate on its
  own.
- **Cap: 10 turns per chunk.** Each chunk's `/goal` caps at ≤ 10 turns; the cap
  is per chunk, not per task.
- `mehamakor-dod` still runs at each chunk's close; a red DoD blocks advancing
  to the next chunk.

### RED — high risk (no loops)

- **`.github/workflows/**`, `backend/alembic/versions/**`, production deploys,
  and any `DROP`/schema-destructive operation** are RED.
- **No loops, no auto mode.** No `/goal`, no `/loop`, no `/schedule` routine may
  touch a RED path. Chunk-by-chunk with explicit human approval per chunk
  (Sapir), executed manually. The evaluator model cannot judge architectural or
  schema trade-offs (ADR-016 rationale; MEH-373 drift family).

### `/schedule` routines

- **GREEN scope only.** A scheduled routine may only perform GREEN-tier work.
- **Never merge.** A routine may open a draft PR and report, but must never
  merge to `staging` or `main` — merge stays a human action.
- **Skip PRs touching RED paths.** If a routine's diff would touch any RED path
  (`.github/workflows/**`, `alembic/versions/**`, prod deploy, `DROP`), it must
  skip the change and surface it for manual handling rather than proceed.

### Default when uncertain

Follow ADR-016: default to asking Sapir for the tier before granting loop
authority. Never silently upgrade a primitive's scope (e.g. GREEN `/goal` →
YELLOW multi-chunk) mid-task.

## Consequences

**Positive:** one canonical map for loop authority; GREEN loops get a
mechanical "done" proxy (`mehamakor-dod`) instead of an evaluator guessing;
RED paths are provably loop-free; `/schedule` can run unattended without merge
or RED-path risk.

**Negative:** the 15/10 turn caps are judgment calls that may need tuning as
loop usage matures; `mehamakor-dod` covers only the mechanical DoD half, so a
GREEN `/goal` can still ship a change that needs `/adversarial-review` — the
green exit code is necessary, not sufficient.

**Mitigations:** this ADR is the single reference; workflow rules 17/23/25
point here rather than re-defining scope. Revisit caps via a follow-up ticket
if loop telemetry shows systematic over/under-run.

## Alternatives considered

- **(b) One flat "loops allowed if DoD passes" policy, no tiers.** Rejected:
  lets a loop self-approve a schema migration or workflow edit the moment the
  build is green — exactly the RED blast-radius class ADR-016 exists to gate.
- **(c) Ban all loop primitives.** Rejected: throws away the ping-pong savings
  on GREEN work (rule 23 pilot evidence) to avoid a risk that tier-scoping
  already contains.
- **(d) Per-primitive rules with no shared tier map (status quo).** Rejected:
  that scatter is the MEH-271 two-mechanisms smell — each rule re-deriving
  scope drifts. One ADR, referenced everywhere.
