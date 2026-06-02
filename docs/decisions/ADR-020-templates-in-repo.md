# ADR-020: Prompt templates promoted to repo (docs/templates/)

**Status:** Accepted
**Date:** 2026-05-24
**Deciders:** Sapir Levi
**Source:** MEH-689; MEH-686 Phase δ Session 1 evidence (3 of 5 PRs forced Drive-side manual sync); Doc-Consolidation-Plan §B.4 + §C target architecture

## Assumptions (verified before merge)

- Drive `02-Templates/` folder contains 10 canonical prompt template files (00-model-selection-guide through 09-council-mode) per pre-Phase-0 documentation. **Phase 0 finding (2026-05-24):** PK snapshot contains only 9 (00-08). Template 09 status is genuinely uncertain and is the subject of MEH-690. This ADR therefore promotes 9 templates and defers Template 09 to MEH-690's follow-up PR.
- Project Knowledge currently holds a manual snapshot of the 9 templates (per Doc-Consolidation-Plan §B.4 — PK = manual working-copy, not canonical).
- No `.github/workflows/` or `scripts/` files reference Drive template paths (confirmed by Phase 0 grep).
- AGENTS.md / CONTEXT.md pattern (PrestaShop, March 2026) is the adopted documentation architecture.

## Context

Prompt templates drive every Linear issue, every CC prompt, and every Claude.ai design/research session. Until now they lived in Drive `02-Templates/` (working canonical) with a manual snapshot in Project Knowledge (chat-surface working copy).

MEH-686 Phase δ Session 1 (2026-05-24) shipped 5 PRs editing template content (#832 Template 02, #834 Template 01) and template-adjacent canonical files (#833 CLAUDE.md → thin pointer, #835 personal-preferences partial). Each of the template-touching PRs required:

1. Sapir manual Drive download
2. Send file to Claude.ai chat
3. Claude.ai edit
4. Sapir manual Drive re-upload
5. Manual PK re-upload

This pattern is the Drive-as-canonical anti-pattern that the AGENTS.md / CONTEXT.md migration was designed to eliminate (per Doc-Consolidation-Plan §C target architecture: "REPO = canonical — versioned, blame-able, PR-reviewed"; "DRIVE = working drafts, iteration, archive — NO duplicates of repo SoT files").

Templates are AI-instruction content used by multiple AI surfaces (CC, Claude.ai chat, future Cursor / IDE configs), so per the AGENTS.md pattern they belong at the repo apex layer, not in a tool-specific folder.

## Decision

Templates 00-08 promoted to `docs/templates/` in the repo. This is the canonical home; Drive `02-Templates/` becomes archive with a README stub pointing to the repo; Project Knowledge continues as manual snapshot for chat-surface access (acknowledged non-canonical, refreshed manually when canonical changes). Template 09 (Council Mode) is deferred to MEH-690 follow-up PR.

### Why `docs/templates/` and not `.claude/commands/`

1. **AGENTS.md pattern consistency.** CONTEXT.md, BRAND.md, DESIGN.md, decisions/, ARCHITECTURE.md, DATA.md, DEPLOYMENT.md all live in `docs/`. Templates are the same class of AI-agnostic instruction content; `.claude/commands/` is CC-specific and would create a split-brain between "AI instructions in docs/" and "AI instructions in .claude/".

2. **Multi-tool consumers.** Templates are used by Claude.ai chat (Project Knowledge), CC (file reads), and future IDE configs (Cursor, etc.). `.claude/commands/` is exclusively CC. Templates are not exclusively CC.

3. **`.claude/commands/` is a slash-command surface.** It already holds `design-review.md` (invokable as `/design-review`), `retro.md` (invokable as `/retro`), and the `design-review/` subdirectory with principles + agent config. Templates 00-08 are reference material for copy-paste into prompts, not slash commands. Placing them in `.claude/commands/` would pollute the slash-command namespace with non-invokable reference docs.

4. **Industry alignment.** PrestaShop AGENTS.md pattern (March 2026) and web research patterns adopted in §B.15 place prompt templates and instruction content at repo root or `docs/`, not in tool-specific folders.

### Surface mapping after promotion

```
docs/templates/          = canonical, PR-reviewed, version-controlled (9 templates: 00-08)
Drive 02-Templates/      = archived with README stub → docs/templates/
Project Knowledge        = manual snapshot (not canonical; refresh on change)
.claude/commands/        = slash commands only (design-review, retro)
```

Template 09 (Council Mode): status under reconciliation in MEH-690. Follow-up PR will add it to `docs/templates/` if kept, or remove the deferral note if retired.

## Consequences

**Positive:**

- Future template edits go through PR (blame-able, reviewable, atomic).
- Eliminates 5-step Sapir-manual sync flow that drove 3 of 5 PRs in MEH-686 Phase δ Session 1.
- AGENTS.md pattern consistency (templates = repo apex, like CONTEXT.md / BRAND.md / DESIGN.md).
- Templates become greppable from CC during prompt construction.

**Negative:**

- Project Knowledge requires manual refresh after each PR (acknowledged per AGENTS.md pattern — PK is non-canonical chat-surface working copy).
- Drive `02-Templates/` becomes stale unless replaced by stub (this PR provides the stub text for Sapir to paste).
- Templates touching CC behavior (00-model-selection, 06-linear-issue) are now version-controlled and any change requires a PR — slight friction vs Drive Quick Edit, but matches the rest of canonical content.
- Template 09 reconciliation deferred to MEH-690 (carve-out is documented in MEH-689 description banner + MEH-690 comment).

**Mitigations:**

- This PR writes Drive `02-Templates/00-README.md` stub text into the PR body; user instruction: "Edit templates in repo, not here."
- Project Knowledge refresh added to end-of-session protocol (CONTEXT.md §16) — already covered by "Update userMemories + verify Project Knowledge copy" step.

## Alternatives considered

- **`.claude/commands/`** — rejected per reasons 1-4 above.
- **Repo root `templates/`** — rejected; pollutes top-level, no precedent in industry AGENTS.md examples, breaks the "docs/ = AI-agnostic instruction content" convention.
- **Keep in Drive (status quo)** — rejected; this is the failed pattern MEH-689 is opened to solve.
- **Split: 00-08 in docs/templates/, retain Drive read-mirror via CI** — rejected as premature engineering for pre-launch solo founder (W4 deferral logic in §B.15 applies).
- **Promote all 10 including reconstructed Template 09** — rejected; would violate MEH-689's `<over_engineering_guard>` byte-identical rule. Template 09 reconciliation belongs to MEH-690.
