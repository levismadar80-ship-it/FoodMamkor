# ADR-017: JWT access token in localStorage (refresh token in HttpOnly cookie)

**Status:** Accepted · Supersedes ADR-001
**Date:** 2026-05-23
**Deciders:** Sapir Levi
**Source:** MEH-686 audit Y1 finding; ADR-001 title misrepresented actual state

## Context

ADR-001 (2026-04-26, "JWT in HttpOnly cookie, not localStorage") described
a target state that was never fully implemented. The actual implementation
moved the **refresh token** to an HttpOnly cookie but kept the **access
token** in localStorage. The original ADR title implied both tokens migrated,
which is incorrect.

The MEH-686 documentation audit (2026-05-23) flagged this as Y1 — an ADR
title describing target state, not actual state.

### Plan-vs-README precedence (Truth Hierarchy resolution)

Two MEH-686 source documents proposed different mechanisms for the Y1 fix:

- **Doc-Consolidation-Plan §B.14 Y1 + Phase η step 26** specified "rename
  ADR-001 title in place".
- **`docs/decisions/README.md`** rules out in-place edits: "never edit an
  Accepted ADR. Write a new one with Status: Supersedes ADR-NNN."

Per the Truth Hierarchy formalized in `docs/CONTEXT.md` §3, the conflict
resolves in favor of README.md. README.md lives in `docs/decisions/` and
is part of ADR governance (Truth Hierarchy level 1); Doc-Consolidation-Plan
is a working planning document (Drive, level 7). When two documents at
different hierarchy levels disagree, the higher level wins.

The Plan was written before the README rule was given full weight in the
hierarchy. ADR-017 follows the rule, not the Plan. The Y1 fix moves from
Phase η (where the Plan placed it) to Phase γ commit 10 (this commit) as
a consequence.

## Decision

Document the actual current state as the canonical decision:

- **Refresh token** — stored in HttpOnly cookie (MEH-326 implementation).
- **Access token** — stored in localStorage (was never migrated; this ADR
  codifies the kept-in-localStorage status, doesn't propose it as new).

This is **not** a code change. ADR-017 is a documentation correction — it
records what already shipped to production. No PR touches application code.

ADR-001 status transitions to "Superseded by ADR-017". Per README "one-line
edit only" rule, only the Status line in ADR-001 changes.

## Consequences

**Positive:** Closes Y1 finding; future sessions reading the ADR title get
accurate information about the security posture; the supersedence chain
preserves the historical decision context (ADR-001 is still readable for
the original rationale).

**Negative:** The actual security posture (access token in localStorage)
remains XSS-vulnerable in a way ADR-001's title implied was fixed. This
ADR documents the gap; it does not close it.

**Mitigations:** If the access-token-in-localStorage posture is to be
revised in the future, that change is a code PR + new ADR superseding
this one. The supersedence chain (ADR-001 → ADR-017 → future) makes the
history navigable.

## Alternatives considered

- **Rename ADR-001 title in place.** Rejected — violates `decisions/README.md`
  "never edit an Accepted ADR" rule. The MEH-686 audit specifically flagged
  in-place edits to ADRs as a Truth Hierarchy violation.
- **Edit ADR-001 body without title change.** Rejected — same rule.
- **Write code PR to actually move access token to HttpOnly cookie.** Out
  of scope for MEH-686 (which is documentation consolidation). If undertaken,
  it would be a separate PR with its own ADR superseding this one.
- **Add a note to ADR-001 without supersedence.** Rejected — readers
  scanning titles miss notes; supersedence is the standardized signal.
