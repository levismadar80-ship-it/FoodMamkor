# ADR-012: Logo design — Watt 4-phase method

**Status:** Accepted
**Date:** 2026-05-23
**Deciders:** Sapir Levi
**Source:** Jeremy Watt logo-designer-skill (2026-02); MEH-637 (applied + Done 2026-05-22); MEH-664 (DoD bug fix); Doc-Consolidation-Plan §B.7 G3; MEH-686 Session 2

## Assumptions (verify before merge)
- Jeremy Watt's `logo-designer-skill` (February 2026) is the named method; "Watt 4-phase" in HANDOFF and userMemories refers to this skill, not a generic discovery-explore-refine process.
- MEH-637 = first applied instance of the Watt method. Result = 5-pomegranate-seed lockup, marked Done 2026-05-22.
- The MEH-636 / 637 / 638 / 639 sequence describes **design-reset sessions** (Foundation / Logo / Hero+Card+Categories / Homepage+JSX), not the Watt phases — these are orthogonal axes.
- MEH-664 closed the 2026-05-22 DoD bug (canonical wordmark = `מהמקור`, no niqud).

## Context

Mehamakor's logo went through multiple ad-hoc iterations in early 2026 before MEH-637 adopted Jeremy Watt's structured 4-phase logo design method (February 2026 skill release). Pre-Watt iterations produced 15+ unsuccessful attempts because the work skipped scoping discipline — jumping to mark exploration before locking the brand brief, then jumping to refinement before mark direction was committed.

Two orthogonal "phase" vocabularies were drifting against each other: (i) the MEH-636 / 637 / 638 / 639 design-reset session numbering (Foundation, Logo, Hero+Card+Categories, Homepage+JSX), and (ii) the Watt method's internal 4-phase workflow applied **within** MEH-637. Without an ADR, future logo work (system extension, sub-brand marks, monogram variants) would re-invent the wheel and re-conflate the vocabularies.

## Decision

Logo design uses Jeremy Watt's 4-phase method, in this order, for the Mehamakor logo system and any future sub-brand marks:

1. **Interview.** Brand brief lockdown — positioning, audience, voice, anti-references. No marks yet.
2. **Explore.** Generate breadth — divergent directions (typographic, mark, lockup, monogram). 15–25 iterations expected. No refinement yet.
3. **Refine.** Pick direction. Iterate within one path. Test at 16px favicon, ProducerCard chip, hero, full-page hero.
4. **Export.** Lock final SVG. Generate variants (color, mono, knockout, favicon stack). Commit to canonical assets folder. Document wordmark spec.

### Canonical artifacts from MEH-637

- Wordmark: `מהמקור` — 6 letters, no niqud, bold weight (locked post-MEH-664).
- Lockup: 5-pomegranate-seed mark + wordmark (final selection 2026-05-22).
- Favicon test at 16px is mandatory before "Done" — MEH-637 DoD bug taught us this (assets had to grep-match canonical SVG; old `הָמָּקוֹר` variant with niqud and 4 letters slipped through Phase 4).

### Modification protocol

System extensions (monogram, sub-brand marks, anniversary variants) start at Phase 2 (Explore) using the locked Phase 1 brief from MEH-637. Brief revisions require a new full 4-phase pass and a new ADR superseding this one.

## Consequences

**Positive:** Codifies the method that produced the first successful logo iteration after 15+ failures; protects future logo work from skipping Phase 1; makes the Watt-phases-vs-session-numbering distinction explicit so HANDOFF and CC prompts don't conflate them; MEH-664 16px-favicon DoD lesson becomes a permanent gate.

**Negative:** Watt method takes longer per iteration cycle than ad-hoc "generate variations" prompting; high cost on the Refine phase (mandatory multi-size testing).

**Mitigations:** Phase 2 (Explore) breadth cap at 25 iterations prevents endless divergence; Phase 4 (Export) checklist (wordmark grep-match, 16px favicon, color/mono/knockout variants, canonical folder commit) prevents the MEH-664 class of DoD slippage.

## Alternatives considered

- **Ad-hoc prompting (status quo pre-MEH-637).** Rejected — 15+ failed iterations is the evidence.
- **Hire a designer.** Not rejected, deferred — pre-launch solo founder; revisit post-launch if logo system extensions (sub-brands, partner co-marks) outpace solo capacity.
- **AI logo generators (Looka, Brandmark, etc.).** Rejected — output generic; signals "AI template", opposite of editorial positioning.
- **Discovery / Foundation / Exploration / Lockup as the 4 phases (renaming Watt's vocabulary).** Rejected — Watt is the named external source; renaming the phases breaks traceability and invites Claude Code sessions to drift the method definition.
