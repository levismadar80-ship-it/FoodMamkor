# ADR-015: Strategic-framework cancellation pattern (2026-05-14 cohort)

**Status:** Accepted
**Date:** 2026-05-23
**Deciders:** Sapir Levi
**Source:** MEH-411 + MEH-412 + MEH-415 + MEH-416 + MEH-536 (all canceled 2026-05-14); Doc-Consolidation-Plan §B.7 G6; MEH-686 Session 2

## Assumptions (verify before merge)
- The 5 canceled issues (MEH-411 Magic Number, MEH-412 Single-Player Mode, MEH-415, MEH-416, MEH-536) share a common cause; only 2 (411, 412) have been read directly during Session 2 — the remaining 3 are inferred from the cancellation date clustering and the recorded reason on 411/412.
- Per-issue rationale will land as Linear `save_comment` entries on each of the 5 issues in Session 3 Phase η; this ADR documents the **pattern**, not the per-issue specifics.
- The pattern is preventive — it must alter future strategic-framework intake, not just explain past rejections.

## Context

On 2026-05-14 five Linear issues that imported strategic frameworks from marketplace literature were canceled without recorded rationale: MEH-411 (Magic Number, Airbnb / Jonathan Golden framework), MEH-412 (Single-Player Mode, OpenTable / NFX Tactic 4), MEH-415, MEH-416, MEH-536. The cancellations clustered on the same day and shared a shape — each framework appeared sound in isolation, each would have generated weeks of work, none was traced to a thesis-compatibility question before being opened.

Without an ADR, the same framework class re-enters from a different source (Lenny's Newsletter, NFX library, Reforge, Etsy / Patreon / Substack post-mortems) and reproduces the same pattern: scoped, sound-looking, weeks of work, no editorial-thesis interrogation. The audit (Doc-Consolidation-Plan §B.7 G6) flagged this as needing pattern documentation rather than per-issue ADRs.

## Decision

Strategic frameworks imported from marketplace, growth, or transactional-platform literature require an explicit thesis-compatibility check **before** a Linear issue is opened.

### The pattern

> Strategic frameworks borrowed from large marketplaces (Airbnb, OpenTable, NFX, Etsy, Lenny Rachitsky) were rejected for Mehamakor on 2026-05-14 because Mehamakor's "magazine, not marketplace" DNA is incompatible with frameworks designed for transactional platforms. Each framework appeared sound in isolation but compound-violated the editorial thesis when applied. Future strategic frameworks from marketplace literature require explicit thesis-compatibility check before adoption.

### Intake check (before opening any strategy/growth Linear issue)

Three questions. If any answer is "no", the framework does not get a Linear issue:

1. Was this framework developed for a non-transactional editorial / publication / curation product? (If "no, it was developed for a marketplace" → fail-fast.)
2. Does adopting this framework leave the six pricing LOCKs (ADR-010) intact?
3. Does the framework's success metric — Magic Number, GMV, transactions-per-host, take rate — measure something Mehamakor is structurally not optimizing for? (If "yes" → fail-fast.)

### What this ADR is not

This ADR does not forbid reading marketplace literature. The literature is useful for **counter-positioning** — understanding what we're not, sharpening what we are. The ADR forbids importing the frameworks as work items.

### Per-issue specifics

The 5 canceled issues' individual rationale will be recorded as Linear comments on each issue (Session 3 Phase η Step 25 area), pointing back to this ADR for the pattern. Format: `"Canceled per ADR-015 — [framework name] is marketplace-shape; thesis-incompatibility on question [1|2|3]."`

## Consequences

**Positive:** Prevents the next 5-issue clump of canceled-after-opening strategic work; keeps marketplace literature available as counter-positioning material; makes the rejection rationale legible to future Claude Code sessions that might re-propose Magic Number / Single-Player Mode / network-effect frameworks; the three-question intake check is faster than a full thesis review per issue.

**Negative:** Risk of false negatives — a framework that is marketplace-developed but thesis-compatible (e.g. some retention frameworks) gets bounced when it shouldn't.

**Mitigations:** Question 1 is "developed for non-transactional" not "developed elsewhere" — a framework with a non-transactional core can pass. Sapir override is always available; the ADR documents the default, not the ceiling.

## Alternatives considered

- **Per-issue ADRs (ADR-015 through ADR-019).** Rejected — over-formalizes the per-issue level, scatters the pattern; Doc-Consolidation-Plan §B.7 G6 explicitly proposed pattern-decision-plus-Linear-comments as the alternative.
- **No ADR, document in `personal-preferences-v2.md`.** Rejected — would treat this as a workflow preference rather than an architectural decision; ADR is the correct format for "future X requires Y check" rules.
- **Blanket ban on marketplace literature.** Rejected — counter-positioning value is real; the issue is import-as-work-item, not exposure-to-ideas.
