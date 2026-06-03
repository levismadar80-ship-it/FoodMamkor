# ADR-021: Personal-preferences dual-surface architecture (PK pointer vs Settings full content)

**Status:** Accepted
**Date:** 2026-06-03
**Deciders:** Sapir Levi
**Source:** MEH-691; MEH-686 (surfaced the asymmetry during doc consolidation); MEH-690 (patch reconciliation)

## Assumptions (verified before merge)

- Personal-preferences / AI-instruction content currently lives on two surfaces with **different** payloads, not two copies of the same payload:
  - **(A) Drive + Project Knowledge** — holds a **thin pointer** to the repo (a short stub that says "the canonical preferences live in the repo"), not the full preferences text.
  - **(B) Settings → Personal Preferences** — holds the **full** preferences content, with **no** pointer.
- This split is the present real state (documented here as such, not as a target). It was surfaced during the MEH-686 doc-consolidation work and reconciled against the patch state in MEH-690.

## Context

Personal-preferences / AI-instruction content is consumed by more than one AI surface. Two of those surfaces store it differently on purpose:

- **Project Knowledge (and its Drive working copy)** is loaded into context at the start of work. It is size- and context-budget-constrained: every character it carries is permanent overhead competing with the actual conversation. It therefore holds only a **thin pointer** back to the repo's canonical preferences, not the content itself.
- **Settings → Personal Preferences** is the canonical, directly-editable home for the full preferences. It is not loaded the same way Project Knowledge is, and it is where a human actually edits the prefs, so it holds the **full** content and carries no pointer (it *is* the thing a pointer would point at).

The result is a deliberate asymmetry: surface A points, surface B contains. Without this ADR the asymmetry reads like drift — a reviewer seeing "PK has only a stub but Settings has the whole thing" could "fix" it by duplicating the full content into PK, which is exactly the wrong move (see Consequences).

## Decision

The two-surface asymmetry is **intentional and is kept**:

- **Project Knowledge + Drive = thin pointer.** Because PK is loaded into context per session, it carries only a short pointer to the repo's canonical preferences. It does **not** carry the full content. The size/context-budget constraint is the reason.
- **Settings → Personal Preferences = full content, no pointer.** Settings is the canonical editable surface for the full preferences. It holds the complete text and does not point anywhere, because it is the source a pointer would reference.

The asymmetry is the architecture, not a bug to be normalized away. The two surfaces serve different roles (loaded-context pointer vs. editable full source) and therefore legitimately hold different payloads.

## Consequences

**Positive:**

- Project Knowledge stays small — no full-preferences payload bloating every session's context budget.
- Single editable home for the full content (Settings), so there is one place to change, not two.
- The asymmetry is now documented, so a future reviewer won't "correct" it by duplicating content.

**Negative / ongoing obligations:**

- **Editing prefs is a two-step operation:** update the **full content in Settings**, and **keep the PK/Drive pointer in sync** (the pointer must still point at the right canonical location after any move/rename).
- The split must be respected by everyone touching either surface — it is a convention, not a mechanically enforced invariant.

**Hard rule:**

- **Never duplicate the full preferences content into Project Knowledge / Drive.** PK stays a pointer. Copying the full content into PK reintroduces the duplicate-and-drift problem this asymmetry exists to avoid (and silently inflates per-session context).

## Alternatives considered

- **Symmetric — full content on both surfaces** — rejected. Two full copies drift apart, and the PK copy inflates every session's context budget for no benefit; this is the duplication problem the asymmetry exists to prevent.
- **Symmetric — pointer on both surfaces** — rejected. Settings is the editable canonical home; a pointer there would point at nothing concrete. Something has to hold the full content, and Settings is that surface.
- **Collapse to a single surface** — rejected. The two surfaces are loaded/consumed differently (PK into context vs. Settings as editable source); they are not interchangeable, so neither can be dropped.
