# Mehamakor Prompt Templates

**Canonical source of truth for Claude prompts (Claude.ai chat, Claude Code, future IDE configs).**

These templates are referenced from every Linear issue, every CC prompt, and every Claude.ai design/research session. Per **ADR-020**, this directory is the canonical home; Drive `02-Templates/` is archived; Project Knowledge holds a manual snapshot (non-canonical, refresh on canonical change).

## Templates

| # | File | Purpose | Recommended model |
|---|------|---------|-------------------|
| 00 | `00-model-selection-guide.md` | Which Claude model for which task (Sonnet vs Opus) + Adaptive Thinking guidance | Meta — reference all |
| 01 | `01-claude-design.md` | Design tasks (pages, components, logo) | Opus 4.7 always |
| 02 | `02-claude-code-feature.md` | New feature implementation | Sonnet or Opus per scope |
| 03 | `03-claude-code-bug.md` | Bug investigation + fix | Sonnet or Opus per scope |
| 04 | `04-claude-code-refactor.md` | Behavior-preserving refactor | Sonnet or Opus per scope |
| 05 | `05-claude-research.md` | Strategic research (decisions, audits) | Opus 4.7 always |
| 06 | `06-linear-issue.md` | Full Linear issue (8 sections + XML structure) | Meta — reference all |
| 07 | `07-linear-quick.md` | Quick task (<1h, single file, 1-20 LOC) | Sonnet 4.6 always |
| 08 | `08-linear-issue-examples.md` | 10 backlog examples with model recommendations | Meta — reference all |
| 10 | `10-testimonial-intake.md` | Testimonial intake -> on-brand draft (verbatim quote + ADR-014 guardrails) | Opus 4.7 always |

## Template 09 — deferred

Template 09 (Council Mode) is referenced in older documentation but is not currently in canonical form. Its status (kept / retired / re-drafted) is under reconciliation in **MEH-690**. Follow-up PR from MEH-690 will either add `09-council-mode.md` here (if kept) or remove the deferral note (if retired).

## How to edit

1. Open a PR against `staging` touching the relevant file(s).
2. Branch convention: `feature/meh-XXX-<slug>` (per `.claude/rules/workflow.md` rule 3).
3. Get review; merge to `staging`.
4. After merge, manually refresh Project Knowledge with the updated file(s) (chat-surface working copy, not canonical).

## Truth Hierarchy

Per `docs/CONTEXT.md` §3, when two documents disagree:

```
1. ADRs (docs/decisions/)
2. .claude/rules/ (path-scoped operating rules)
3. docs/CONTEXT.md
4. docs/BRAND.md, docs/DESIGN.md (domain SoTs)
5. docs/* (general technical references, including this directory)
6. HANDOFF.md (rolling 7-day active state)
7. Drive (working drafts, archive)
8. Project Knowledge (Claude.ai chat surface — manual copies)
9. userMemories (Claude L3 cache)
```

This directory sits at level 5 (general technical reference). If a template here conflicts with an ADR or `.claude/rules/`, the higher level wins.

## References

- **ADR-020** — Prompt templates promoted to repo (`../decisions/ADR-020-templates-in-repo.md`)
- **CONTEXT.md §12** — Templates overview (`../CONTEXT.md`)
- **MEH-686 Phase δ Session 1** — promotion motivation (Drive-side manual sync friction)
- **MEH-690** — Template 09 reconciliation (follow-up)
