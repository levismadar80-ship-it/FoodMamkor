# ADR-016: Risk-tier nomenclature — GREEN/YELLOW/RED (3-tier)

**Status:** Accepted · Supersedes "no third tier" clause in `.claude/rules/workflow.md` (MEH-450 §risk-tiered-review-frequency)
**Date:** 2026-05-23
**Deciders:** Sapir Levi
**Source:** Doc-Consolidation-Plan §B.0 #1 + §B.10 + Y2; MEH-686 Session 2

## Assumptions (verify before merge)
- 143 Linear issues already classified into the de-facto 3-tier scheme via `EXECUTION_PLAN.md` (no re-classification work needed).
- MEH-450 PR `feature/meh-450-risk-tiered-review` shipped the "no third tier" clause to `.claude/rules/workflow.md` 6 days before `docs/EXECUTION_PLAN.md` introduced the implicit middle tier — the contradiction (Y2) is documented.
- `personal-preferences-v2.md` + `userMemories` still reference the LOW/HIGH 2-tier vocabulary; both will be updated by Session 3 Claude Code execution (Phase η).

## Context

Two parallel mechanisms govern Claude Code authority for code changes (the MEH-271 anti-pattern applied to workflow): `.claude/rules/workflow.md` codified a 2-tier model (LOW = end-to-end authority, HIGH = chunk-by-chunk + WAIT gates) on 2026-05-05 with an explicit "no third tier" clause; `docs/EXECUTION_PLAN.md` six days later classified 143 issues using a de-facto 3-tier model that captured a real middle workflow — multi-file refactors that aren't central enough for chunk-by-chunk WAIT gates but are too risky for end-to-end push without per-chunk review.

The audit (Y2) flagged this as an active contradiction (🔴 launch-blocker). The sunk cost is on the 3-tier side: 143 issues classified, EXECUTION_PLAN is the operating document. The clean-text purity argument is on the 2-tier side: workflow.md was written in isolation, no real workload had tested it yet.

## Decision

3-tier model wins. Tier names = GREEN / YELLOW / RED. MEH-450 "no third tier" clause superseded by this ADR. EXECUTION_PLAN 143-task classification stands.

### Tier definitions

**GREEN — low risk.** Docs-only, copy, i18n, single-file dependency bumps, tests, CI YAML touching no behavior. Claude Code has end-to-end authority: plan → execute → PR without intermediate approval. Sapir reviews the PR only.

**YELLOW — medium risk.** Multi-file refactor (3–7 files) on non-central components, non-shared UI components, copy-with-logic (e.g. ICU plural rules), CI workflow YAML that changes behavior. Claude Code presents plan for approval, then executes end-to-end with per-chunk summary at chunk boundaries (no WAIT gates between chunks). Sapir reviews PR before merge.

**RED — high risk.** Auth, schema, security, central components (CLAUDE.md, `tailwind.config.js`, `main.py`, `frontend/messages/he.json`), production deploys, brand-level decisions. Chunk-by-chunk execution with explicit WAIT gates per chunk. Sapir approves each chunk and final merge.

### Default when uncertain

Claude Code defaults to asking Sapir for tier assignment before granting itself authority. Never silently upgrade GREEN → YELLOW or YELLOW → RED mid-task.

## Consequences

**Positive:** EXECUTION_PLAN classifications retain their meaning; YELLOW captures the real middle workflow that produced 50%+ ping-pong waste under the 2-tier model; Y2 launch-blocker resolved; vocabulary becomes color-coded (memorable + non-pejorative — RED isn't "bad", it's "high oversight").

**Negative:** All references to LOW/HIGH in workflow.md, personal-preferences-v2.md, userMemories, and CC prompt templates must be updated. Minor risk that color symbolism varies cross-culturally (Hebrew-speaking solo founder context = not an issue here).

**Mitigations:** Single ADR is the canonical reference; all updates point to ADR-016 rather than re-defining tiers locally. Session 3 Phase η edits `workflow.md` to delete "no third tier" clause and replace LOW/HIGH section with a pointer to this ADR.

## Alternatives considered

- **(b) Keep 2-tier (LOW/HIGH), retire YELLOW work classification.** Rejected: forces 143 issues into the wrong buckets, recreates the original drift problem, and ignores 6 weeks of real workflow evidence that the middle tier exists.
- **(c) Keep tier numbers (1/2/3) instead of colors.** Rejected: less mnemonic; "tier 2" reads as "lower quality" rather than "medium risk" (anti-pattern from cloud provider SLA tiers).
- **(d) Per-domain tiers (auth-tier, schema-tier, frontend-tier).** Rejected: combinatorial explosion; the risk axis is "blast radius if wrong", which is domain-orthogonal.

## Amendment (2026-07-12)

An explicit per-batch DO-NOT-MERGE / Sapir-merges instruction from the
orchestrator OVERRIDES tier-level auto-merge authority. Tier authority is the
default; a batch-specific instruction is the specific rule and wins. Context:
PR #1644 (MEH-1133) was auto-merged under YELLOW authority despite an explicit
DO-NOT-MERGE in the batch prompt.

## Amendment (2026-07-12, MEH-1155) — PR-level DO-NOT-MERGE marker

The prior amendment made a DO-NOT-MERGE instruction in the *batch prompt* win
over tier authority, but a prompt lives only in the CC session — it can't stop
an auto-merge if the session drifts. MEH-1155 moves the override onto the PR
itself:

**Policy (in force now):** a **DO-NOT-MERGE marker** (or **DNM-LOCK**) in the PR
title or body voids CC auto-merge authority regardless of risk tier. CC must not
auto-merge a marked PR. **Only Sapir removes the marker.** Precedence: the marker
overrides GREEN/YELLOW/RED auto-merge authority the same way the batch-prompt
instruction does, but at the PR layer where the merge actually happens.

**Mechanical enforcement (LIVE):** the marker is enforced by the
**"DO-NOT-MERGE marker gate"** job (`do-not-merge-gate` in
`.github/workflows/pr-checks.yml`), wired into the **"CI gate (required)"**
aggregator (`ci-gate` `needs:` + the `R_DNM` result check) — so a marked PR
**cannot go green** and therefore cannot auto-merge. The aggregator check is
stack-independent (always required), so no branch-protection change was needed.
Sapir applied it in PR #1684 (RED tier); `.github/workflows/**` is CC-deny
(MEH-671), so only Sapir maintains the gate.

**Marker semantics — it is NOT a bracketed tag.** The gate scans the PR title
and body (case-insensitive) with:

```
(^|[^A-Za-z0-9_-])do[ _-]?not[ _-]?merge([^A-Za-z0-9_-]|$)|DNM-LOCK
```

i.e. it matches the marker phrase **anywhere in the title or body** — brackets
or not, with space / underscore / hyphen separators — plus the literal
`DNM-LOCK`. This breadth is deliberate: the marker must be caught even sitting
mid-sentence in a PR title (the PR #1659 case), not only as a standalone tag.
**Consequence:** a PR that merely *discusses* this gate in prose will self-block.
That trade is accepted — a false positive costs one text edit; a false negative
could let gated copy reach production. **To write about this gate in any PR
title/body or comment, call it the "merge-block marker" gate — never spell out
the literal marker phrase, or your own PR self-blocks.**
