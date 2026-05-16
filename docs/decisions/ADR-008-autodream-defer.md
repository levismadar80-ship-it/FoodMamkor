# ADR-008: Defer AutoDream activation on Claude Code

**Status:** Accepted
**Date:** 2026-05-16
**Deciders:** Smadar Levi
**Source:** MEH-501; Code with Claude (May 6, 2026) "Dreaming" announcement; community blogs (claudefa.st, MindStudio, GitHub) describing the unannounced `AutoDream` Claude Code feature flag.

## Context

Two unrelated features share a name:

1. **Dreaming (Claude Managed Agents)** — research preview, API product. **Not applicable** to Mehamakor (we do not build managed agents).
2. **AutoDream (Claude Code)** — server-side feature flag, gradual rollout. Sources are community ([claudefa.st](http://claudefa.st), MindStudio, GitHub) — **not** `docs.claude.com`. The feature runs 4 stages on memory files: `Orient → Gather Signal → Consolidate → Prune & Index`. Access is checked via `/memory` in Claude Code; the toggle is labeled `Auto-dream: on`.

**Risk — aggressive pruning of `CLAUDE.md`:**

Our `CLAUDE.md` carries load-bearing invariants whose loss is a known regression class:

- RTL rule (`start-*` / `end-*` only) — see [.claude/rules/rtl.md](../../.claude/rules/rtl.md)
- Alembic sole schema authority (post-MEH-267) — see [ADR-003](./ADR-003-alembic-migrations-only.md)
- v2.1 Linear issue templates (8 sections + 8 XML blocks)
- 7 execution principles (Cursor / Devin / V0 / Manus / Windsurf — exec §7–13)
- Pre-go scope-match check (post-MEH-342)

Community guidance explicitly warns: *"Back up your `~/.claude/` directory before enabling AutoDream for the first time. The feature prunes aggressively."* This directly conflicts with the source-of-truth principle anchored in MEH-267 (root cause of the MEH-265 production-login incident).

## Decision

**Defer activation. AutoDream stays OFF.**

### Conditions for revisit (cumulative — all must hold)

1. **Official announcement** from Anthropic on `docs.claude.com` (not community blogs).
2. **Stable window** — after MEH-456 (drop legacy availability columns) and before public launch — so the baseline under test is clean.
3. **Full backup** of `~/.claude/`, `CLAUDE.md`, and `HANDOFF.md` before the first run.
4. **Manual trigger only** (`/dream` or "consolidate my memory files") — no auto.
5. **Diff review** — never accept memory changes without manual review.

### Anti-pattern explicitly rejected

✗ Toggling `Auto-dream: on` in `/memory` settings, even if the feature is available in the account.

## Consequences

**Positive:**
- `CLAUDE.md` and `HANDOFF.md` remain immutable except via PR — every change is grep-able, blame-able, revertable.
- No risk of silent pruning between sessions (preserves the MEH-267 invariant).
- Memory consolidation, when it lands, comes through a deliberate manual step with diff review — same review discipline as every other PR.

**Negative:**
- We pay manual-curation cost on `CLAUDE.md` / `HANDOFF.md` size (currently 82 lines / 6000+ lines respectively). Refactor work into `.claude/rules/` and `docs/` continues to be on us, not the agent.
- Forgo any near-term productivity benefit from automated memory consolidation if AutoDream proves safe upstream.

**Mitigations:**
- 80-line cap on `CLAUDE.md` (enforced by convention, checked in PR review) keeps the manual-curation cost bounded.
- Domain rule files in `.claude/rules/` absorb the long tail.
- ADR series + `docs/CHANGELOG.md` provide append-only history — pruning is unnecessary for invariants.

## Alternatives considered

- **Enable AutoDream with backup** — rejected: community evidence is insufficient. No published, reproducible behavior contract; `docs.claude.com` does not document the feature; restore-from-backup is a recovery path, not a prevention path.
- **Enable on a single dry-run with all 5 conditions met today** — rejected: condition 1 (official announcement) is not satisfied; condition 2 (stable window) is not satisfied (MEH-456 in flight, launch approaching).
- **Accept aggressive pruning, restructure CLAUDE.md to be "AutoDream-safe"** — rejected: same outcome as manual curation but with vendor-lock-in on the pruning heuristic. We would still need to validate every prune.
