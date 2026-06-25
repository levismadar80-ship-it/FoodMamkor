# ADR-024 — Voice: surface-function taxonomy + owner-noun gender (refines ADR-014)

Status: Accepted
Date: 2026-06-25
Deciders: Sapir · Claude (orchestrator)
Refines: ADR-014
Source: MEH-849 · MEH-930 audit · MEH-940 · Israeli voice research (Academy ללשון 2020 · BGU gender-address study · HE UX-writing + bot-microcopy guides)

## Context
ADR-014 set the Hybrid (UI plural / narrative feminine) but left 2 gaps causing recurring audit churn:
1. Owner NOUN — docs locked "בעלת עסק" (fem) while MEH-849 chose "בעלי עסקים"; the masculine-specific case was undefined, and male-owned businesses were mislabeled feminine (e.g. chatbot "בעלת העסק").
2. Split ambiguous between AUDIENCE and SURFACE. MEH-930 audit re-flagged "בעלי עסקים" and nearly reverted it. Root cause: rule lived in a ticket, not the SoT.
Research: Hebrew has no neuter; per the Academy masculine is the unmarked (סתמי) form and plural is the standard neutral for mixed/unknown audiences (best test-performance, doesn't disadvantage men). Feminine can backfire in competence contexts; legitimate for women-targeted narrative/warmth.

## Decision
1. Split by SURFACE-FUNCTION, not audience:
   - Functional UI (buttons, CTAs, labels, headings/welcomes, errors, loading, support chatbot) → gender-neutral plural (הצטרפו, הוסיפו, ברוכים הבאים), all audiences. Keep singular-personal via ך-possessive (שלך) / past tense / infinitive where smoother.
   - Brand narrative (/about, founder letter, below-fold editorial) + warmth (share strings, WhatsApp/email body) → feminine (שתגלי, מי שמייצרת).
2. Owner-noun taxonomy:
   - Entity / singular-generic → "בית העסק" / "העסק"
   - Generic plural → "בעלי עסקים" (unmarked/סתמי — NOT forbidden "pure-masculine reader-address")
   - Specific woman → "בעלת עסק"
   - Specific man → "בעל עסק"
3. "Pure masculine forbidden" (ADR-014) = masculine reader-ADDRESS ("המשתמש שלך"), NOT the owner noun.

## Consequences
- Audit/guard allowlist: functional=plural · narrative+warmth=feminine · "בעלי עסקים"/"בית העסק"=permitted. Stops revert-churn.
- he.json CTAs (MEH-930) + chatbot (MEH-940) neutralize; share/warmth + /about narrative stay feminine.
- home.cta.body "בעלות עסק קטנות" → "בעלי עסקים קטנים".

## Alternatives
- Full-feminine (Rosepads) — rejected: mislabels male owners; feminine can backfire in competence contexts.
- Keep owner feminine — rejected: reverts MEH-849, factually wrong for male owners.
- Slash / multi-gender font — rejected: ADR-013/014 forbid slash; font impractical.
