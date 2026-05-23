# ADR-009: Decision capture (proactive instruction)

**Status:** Accepted
**Date:** 2026-05-23
**Deciders:** Smadar Levi
**Source:** chat 58f20b7e-20ef-4300-8d1a-2fef324ad3f3 (2026-05-23 industry-pattern research); MEH-678

## Context

Architectural decisions surfacing in Project conversations (tool adopt/defer/abandon, pattern selection, security/schema strategy) lived only in Smadar's memory and the chat log. Recent losses: agent-browser defer (ADR via MEH-635, post-hoc), AutoDream defer (ADR-008, post-hoc), the hybrid voice policy and the 80-line CLAUDE.md cap (never formalized). The gap is the absence of a real-time trigger — rationale erodes before anyone remembers to write the ADR.

## Decision

Add a 3-line `## Decision capture (proactive)` instruction to `CLAUDE.md`: when a conversation produces an architectural decision, Claude must offer `"זה ADR-worthy. רוצה שאכתוב ל-docs/decisions/?"`. Trigger phrases: defer, adopt, abandon, "decision is", "we'll go with", trade-off resolved, pattern X selected, "going forward we'll", "rejected because", spike outcome.

## Consequences

**Positive:** decisions captured at the moment the rationale exists, not reconstructed later; industry-standard ADR pattern (AWS, Microsoft, Pearson) kept on a solo-dev-safe lightweight template.
**Negative:** +3 lines to CLAUDE.md (82 → 85), past the local 80-line cap (industry ≤100 still satisfied); risk of over-offering on trivial choices.
**Mitigations:** trigger list is scoped to architectural decisions, not "any choice"; the offer is one line, declined with a word when not warranted.

## Alternatives considered
- Skill `decision-recognizer` — rejected: skills auto-fire unreliably.
- Slash command `/adr` — rejected: requires Smadar to remember to invoke it.
- Post-hoc ADR writing (status quo) — rejected: decisions lost between session and remembering to write them.
