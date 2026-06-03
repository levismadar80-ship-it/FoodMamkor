# ADR-021: Personal-preferences dual-surface architecture (PK pointer vs Settings full content)

**Status:** Accepted
**Date:** 2026-06-03
**Deciders:** Sapir Levi
**Source:** MEH-691; MEH-686 (surfaced during Phase δ step 19, 2026-05-24); MEH-689 (templates promotion / ADR-020 — sibling AGENTS.md surface-asymmetry pattern)

## Assumptions (verified before merge)

- Personal-preferences / AI-instruction content currently lives on two surfaces with **different** payloads, not two copies of the same payload:
  - **(A) Drive + Project Knowledge** — holds a **thin pointer** (~20 lines) to the repo's canonical preferences. `personal-preferences-v2.md` was transformed to this pointer during MEH-686 Phase δ step 19.
  - **(B) Settings → Personal Preferences** — holds the **full** content (~151 lines, V2.0), with **no** pointer.
- This split is the present real state (documented here as such, not as a target). It was surfaced during MEH-686 Phase δ Session 1 (2026-05-24).

## Context

The pointer pattern only works on surfaces that have **repo-read capability**. Personal-preferences / AI-instruction content is consumed by AI surfaces that differ on exactly that capability:

- **Drive + Project Knowledge** is read by Claude Code and by claude.ai **Project** chat — both of which **can read repo files**. A pointer back to the repo's canonical preferences therefore resolves, so these surfaces carry only a **thin pointer**.
- **Settings → Personal Preferences** is consumed by claude.ai chat **outside** the Project context — web, mobile, and other non-repo-aware sessions. Those surfaces have **no repo-read capability**: a pointer to `docs/BRAND.md` would resolve to nothing. So Settings must carry the **full** content inline.

The asymmetry exists because surface capability differs, not because one surface is "behind." Without this ADR, a future session seeing "PK pointer + Settings full" could read it as drift and "fix" it — either by duplicating the full content into PK, or by replacing Settings with a pointer. Both are wrong (see Consequences and Alternatives).

## Decision

The two-surface asymmetry is **intentional and is kept**:

- **Drive + Project Knowledge = thin pointer.** Justified because the consuming surfaces (Claude Code, claude.ai Project chat) can read the repo, so a pointer resolves. This gives single ownership — brand/voice/workflow rules flow from the canonical repo.
- **Settings → Personal Preferences = full content, no pointer.** Justified because the consuming surfaces (non-Project claude.ai chat: web, mobile) **cannot** read the repo; a pointer would resolve to nothing, so the full content must live inline to preserve context there.

The asymmetry is the architecture, not a bug to be normalized away. The two surfaces are consumed by clients with different capabilities and therefore legitimately hold different payloads.

## Consequences

**Positive:**

- Repo-aware surfaces (CC, Project chat) get single ownership — updates flow from the canonical repo, no second copy to maintain.
- Non-repo-aware chat surfaces (web, mobile) keep working, because the full context lives inline in Settings rather than behind a pointer they can't follow.
- The asymmetry is documented, so a future reviewer won't "correct" it.

**Negative / ongoing obligations:**

- **Editing prefs is a two-step operation:** update the **full content in Settings**, and **keep the PK/Drive pointer in sync** (the pointer must still reference the right canonical location after any move/rename).
- **Drift risk:** Settings can go stale relative to the repo canonical. This is **accepted** as long as the LOCKs — DNA, brand colors, voice rules — stay consistent across both surfaces. Operational risk acknowledged.

**Hard rules:**

- **Never duplicate the full preferences content into Project Knowledge / Drive.** PK stays a pointer; duplicating reintroduces drift and inflates per-session context.
- **Never replace the Settings full content with a pointer.** Non-repo-aware surfaces can't follow it — the pointer would resolve to nothing and the prefs would silently vanish from those sessions.

## Triggers to revisit

- **(a) claude.ai chat gains repo-read capability outside the Project context.** If web/mobile chat can resolve repo paths, the pointer pattern could extend to Settings and the asymmetry could collapse to a single pattern.
- **(b) Content drift between surfaces becomes an operational problem** — e.g., a LOCK violation in Settings that contradicts `docs/BRAND.md` (DNA / brand colors / voice rules). At that point the acceptable-drift assumption no longer holds and the surfaces must be reconciled.

## Alternatives considered

- **Symmetric — pointer on both surfaces** — rejected. The non-Project chat surfaces (web, mobile) have no repo-read capability, so a pointer in Settings resolves to nothing and the prefs disappear from those sessions.
- **Symmetric — full content on both surfaces** — rejected. Defeats the AGENTS.md single-ownership pattern for the repo-aware surfaces, and two full copies drift apart (the duplication problem the asymmetry exists to prevent).
- **Collapse to a single surface** — rejected. The surfaces are consumed by clients with different capabilities (repo-aware CC/Project chat vs. non-repo-aware web/mobile chat); neither can be dropped without breaking one set of consumers.
