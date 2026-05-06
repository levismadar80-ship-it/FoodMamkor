# ADR-005: Extend `/adversarial-review` locally, not via plugin

**Status:** Accepted (variants pending implementation in MEH-428)
**Date:** 2026-05-01
**Deciders:** Smadar Levi
**Source:** MEH-428 Linear ticket; MEH-433 audit recommendations

## Context
Pre-launch surfaced 4 incident families that the generic `/adversarial-review` FINDER missed: Pydantic↔DB drift (MEH-283/321), test-coverage gaps on JSX consumers (PR #43 bare-identifier regression), silent-except patterns (MEH-325 — `_send_verify_email` swallowed exception while logging "Sent"), and code-size drift on god-files (4 files, 40+ issues — MEH-407). The upstream `pr-review-toolkit` plugin (anthropics/claude-code/plugins/) was evaluated as an alternative.

## Decision
Extend the existing local `/adversarial-review` command with 4 specialized variants (`-types`, `-coverage`, `-errors`, `-size`) — each keeps the FINDER → ADVERSARY → REFEREE structure but specializes the FINDER pattern set. Do **not** install `pr-review-toolkit` as a plugin.

## Consequences
**Positive:** Ownership of FINDER prompts stays in-repo and tunable per-codebase; one fewer external dependency to audit; same skills-lock discipline (ADR-004) applies. Variant specialization targets concrete post-mortem patterns rather than generic checks.
**Negative:** We carry maintenance cost of 4 prompt files; if upstream `pr-review-toolkit` adds capabilities we'd want, we port manually.
**Mitigations:** Each variant ≤100 lines (MEH-428 success criteria); 30-day post-launch revisit trigger — 0 incidents in the 4 families → close as not-needed; ≥2 incidents → escalate to P2.

## Alternatives considered
- Install `pr-review-toolkit` plugin — rejected: external dependency on a different supply-chain mechanism (plugin ≠ skill, separate audit cost), no per-axis tuning, more surfaces to maintain.
- One mega-prompt with all axes — rejected: token cost on every run + noise from axes irrelevant to the PR.
