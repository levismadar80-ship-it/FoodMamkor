# ADR-011: Tagline locked — 14-word canonical version

**Status:** Accepted
**Date:** 2026-05-23
**Deciders:** Sapir Levi
**Source:** `Drive/03-Brand-Hub/02-מדריך-מותג.md` v1.1 (2026-05-16); Doc-Consolidation-Plan §B.8; MEH-686 Session 2

## Assumptions (verify before merge)
- Brand Hub `02-מדריך-מותג.md` v1.1 (2026-05-16) holds the canonical 14-word version (11 Hebrew word-tokens).
- The 8-word truncated version in older `00-mehamakor-context.md` copies is a copy-paste artifact, not a separate decision.
- `MEH-124-v4-content-sync.md` marks the long version as "(working)" — this ADR upgrades that status to **LOCKED**.

## Context

Three tagline variants appeared across documentation, none marked as canonical:

1. CONTEXT.md v1.0 (Drive `00-mehamakor-context.md`, 3 copies): `"מהמקור — הבית הראשון של העסק שלך"` (8 words)
2. `MEH-124-v4-content-sync.md`: `"מהמקור — הבית הראשון של העסק שלך. המקום שבו הסיפור מתחיל."` (14 words, marked "working")
3. Brand Hub `02-מדריך-מותג.md` v1.1 and `03-brand-book-פנימי.md`: same 14-word version, treated as in-force in brand-hub usage

The drift mattered because: (i) public-facing surfaces (hero, /about, meta description, OpenGraph) cite the tagline in different contexts; (ii) Claude Code design sessions copied the shorter version into mockups while marketing copy used the longer one; (iii) the "working" status flag invited future edits that would have compounded the drift.

## Decision

The 14-word version is LOCKED as canonical:

> **מהמקור — הבית הראשון של העסק שלך. המקום שבו הסיפור מתחיל.**

Brand Hub `02-מדריך-מותג.md` v1.1 is the authoritative source. The 8-word truncation in older context-file copies is a derivation error; Session 3 will overwrite those copies during the `docs/CONTEXT.md` consolidation.

### Structural reading

The tagline is two clauses with deliberate function:
- **"מהמקור — הבית הראשון של העסק שלך"** — promise to producers (this is your home, not your channel)
- **"המקום שבו הסיפור מתחיל"** — promise to readers (curated origin, not an aggregator)

Surfaces may use clause 1 alone where space forbids the full version (e.g. mobile meta description, OG card), but clause 2 must never appear alone — it loses its referent without clause 1.

### Modification protocol

Tagline changes require: (i) a new ADR superseding this one, (ii) explicit rationale citing what shifted in positioning, (iii) audit of all surfaces displaying the current version. Phrasing tweaks without a superseding ADR are forbidden.

## Consequences

**Positive:** Single canonical version stops drift; "working" status retired so future Claude Code sessions don't propose edits as routine copy work; clause structure documented so partial usage on space-constrained surfaces is principled, not ad-hoc.

**Negative:** 14-word version exceeds OG description sweet spot (60–90 chars in Hebrew) — short-surface fallback to clause 1 alone is mandatory, which means two distinct rendered forms in production.

**Mitigations:** Clause-1-alone fallback documented above; `docs/BRAND.md` will reference this ADR; any surface that truncates further (e.g. Twitter card 50-char limit) must escalate rather than truncate clause 1 mid-phrase.

## Alternatives considered

- **Keep 8-word version, retire 14-word.** Rejected — clause 2 carries the editorial-origin promise; removing it leaves Mehamakor indistinguishable from a directory.
- **Mark both as valid, document use-case split.** Rejected — two "valid" versions invite a third, fourth, fifth; ADR-009 decision-capture rule says lock the canonical, document the fallback, don't multiply variants.
- **A/B test taglines on landing page.** Rejected pre-launch — no traffic to test against; A/B on positioning is the wrong instrument for a brand-thesis question.
