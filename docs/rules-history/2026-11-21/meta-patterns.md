# Meta-patterns (cross-session shaping rules)

Source: claude.ai userMemories 2026-05. Shaping rules only — patterns that
require judgment (not mechanical enforcement). Mechanical patterns live in
`.claude/hooks/`. Inverse of ADR-009 (architecture decisions) for workflow.

> **Compliance note:** prose rules in this file are advisory. Claude may
> ignore them. Rules that require 100% enforcement belong in `.claude/hooks/`
> or CI, not here. See: Jaroslawicz et al. 2025 on linear-decay of
> instruction compliance with rule count.

## 1. Verify orchestrator claims with file:line evidence

Orchestrator claims (from claude.ai or training data) CAN be wrong.
When Phase 0 grep/cat disagrees with orchestrator's claim → orchestrator
is wrong by default. STOP, surface disagreement, wait for Sapir to verify
against the real source.

Proven 4x in 2026-05 (PR #808, #812, #815, MEH-689).

## 2. Two-stage CC flow (read-only Phase 0, then execute)

Every non-trivial task splits into:
- Stage 1 — Phase 0 READ ONLY (grep/jq/cat/ls only, zero edits)
- Stage 2 — Execute after orchestrator synthesizes findings + Sapir locks

Apply: every CC task >1 file or >20 LOC. Trivial single-file typo can skip.

Proven 2026-05: MEH-686, MEH-689, MEH-678.

## 3. Large payload splitting (>30KB or 4+ create_file → sub-stages)

When CC prompt inline payload crosses ~30KB OR contains 4+ create_file ops,
split Stage 2 into sub-stages (2A1/2A2/2A3) with wait gates + summary at each.

Default threshold: 4 create_file ops OR >30KB inline content.

Proven MEH-689 (2026-05-24): split prevented context overrun across 9 templates.

## 4. Explicit task spec overrides generic hooks

When generic repo-cleanliness Stop hook conflicts with explicit task
constraints (e.g., "Forbidden: stage/commit files X"), CC defers to
explicit spec. Document conflict in wait-gate summary so orchestrator
verifies. Never silently bypass.

Proven MEH-689 Stage 2A2.

## 5. Autonomy preference (minimize Sapir manual steps)

When choosing between:
- (a) manual TODO for Sapir
- (b) autonomous CC micro-prompt
- (c) batched fold into next PR

Prefer (b) or (c) over (a). If task is small enough to be manual, it's
small enough to be autonomous. Apply across HANDOFF updates, CHANGELOG
backfills, label sync, status edits.

---

## Adding new patterns

A pattern qualifies for this file when:
1. Observed ≥2 times across sessions
2. Workflow/judgment rule (not mechanical — those go to hooks)
3. Expressible as IF-THEN

Source from userMemories or HANDOFF. Reference proven instances (MEH-XXX
or PR #NNN) so future contributors can verify.
