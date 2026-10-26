# ADR-035: One home per fact. Every other surface points; no surface keeps a copy

**Status:** Accepted
**Date:** 2026-10-26
**Deciders:** Smadar Levi
**Source:** MEH-2344 (the post-migration knowledge audit) · MEH-2345 · MEH-2346

## Context

On 26/10 the project moved to a new Claude account, and the old knowledge came
across as a single export. Cross-checking that export against this repo turned
up the same facts held in five places: the claude.ai project instructions,
Project Knowledge, Drive, userMemories, and the repo. Each copy was synced by
hand, so each had drifted at its own rate. The old project instructions
contradicted the repo on seven points, among them ADR-022, the production
domain, the DoD, and the model names.

The upkeep rules were already written; nothing enforced them:

- `HANDOFF.md` is defined as "rolling 7-day" (CONTEXT §3/§15) and had reached
  13,716 lines and 779 sections.
- `docs/CONTEXT.md` read `Last reviewed: 2026-05-23`.
- CONTEXT §16 told every session to update `userMemories` and to re-check a
  Project Knowledge *copy* of CONTEXT. That instruction is the copy mechanism
  that produced the drift.

Outside evidence points the same way:

- Long agent context files lower task success and raise cost (Gloaguen et al.,
  arXiv 2602.11988, Feb 2026).
- A stale rule breaks nothing, so nobody notices it until an agent acts on it.

## Decision

**Each kind of fact has exactly one home, and every other surface holds a
pointer to it.**

| Kind of fact | Its one home |
|---|---|
| Rules for how work is done | `CLAUDE.md` + `.claude/rules/` |
| Product, DNA, stack, brand | `docs/CONTEXT.md`, `docs/BRAND.md`, `docs/DESIGN.md` |
| Decisions and their reasons | `docs/decisions/` (ADRs) |
| What is open / who owns it | Linear (live state) |
| Where we are right now | `HANDOFF.md` — the last ~7 days, one screen per session |
| What happened | `docs/CHANGELOG.md` + git; older HANDOFF sections in `docs/archive/handoff/` |
| Tool access, account quirks, Sapir's working preferences | The Claude project's memory (not in the repo) |
| The claude.ai project instructions | `docs/PROJECT_INSTRUCTIONS.md` — Sapir pastes from it, never edits the pasted copy first |

Drive and Project Knowledge hold **no copies** of repo documents. A Drive file
that duplicates a repo file is a draft or an archive, never a source.

**A rule that sets an upkeep duty gets a check that notices when the duty
lapses.** MEH-2346 adds two warn-only guards under `scripts/checks/`. One flags
`HANDOFF.md` sections past the retention window. The other flags a
`Last reviewed:` date older than 120 days.

## Consequences

**Positive:**
- A new session reads one place per question. A new account or tool starts
  from the repo plus Linear and needs no export.
- Drift becomes visible as a warning in CI instead of surfacing as a
  contradiction months later.

**Negative:**
- The pasted claude.ai instructions can still drift from
  `docs/PROJECT_INSTRUCTIONS.md`, because no tool can read them.
- Archiving HANDOFF moves old line numbers. Citations like `HANDOFF.md:2288`
  now resolve in the snapshot under `docs/archive/handoff/`, not in the live file.

**Mitigations:**
- `docs/PROJECT_INSTRUCTIONS.md` carries its own `Last reviewed:` date, so the
  freshness guard covers it. Keep the pasted text short (pointers only) so
  there is little in it that can go stale.
- The first archive is a verbatim full-file snapshot, so every old line
  citation resolves at the same line number there.

## Alternatives considered

- **Keep the copies and add a sync checklist.** Rejected: that is the
  mechanism that failed, with one more step to forget.
- **Make Drive the brand source of truth.** Rejected for now, because CONTEXT
  §3 already ranks Drive below the repo. If Sapir decides otherwise, that is a
  new ADR, not an edit to this one.
- **Blocking guards.** Rejected: an over-age HANDOFF section is not a reason to
  stop a release. Start warn-only, same path as `shown-failing-guard.sh`.
