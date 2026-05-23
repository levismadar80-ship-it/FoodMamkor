# ADR-007: Schema changes use Expand-Contract pattern

**Status:** Accepted
**Date:** 2026-05-07
**Deciders:** Smadar Levi
**Source:** MEH-486; canonical worked example MEH-291 → MEH-456 (Phase 4 in flight); origin incident MEH-265

> Note: this ADR exceeds the 30-line README guideline because the operational checklist is the durable artifact this decision exists to lock.

## Context
ADR-003 made Alembic the sole schema authority after the `_migrate_columns()` drift incident (MEH-265). That fix constrained **who** writes schema; it did not constrain **how** risky changes are sequenced. MEH-291 (availability-state consolidation) and MEH-456 (legacy-column drop, Phase 4) executed a clean 4-phase Expand-Contract — Phase 1 expand → Phase 2 dual-write → Phase 3 read cutover → Phase 4 contract drop with 7-day soak — but the pattern lived in MEH-291 session-state and the MEH-456 plan, not in any durable rule. Without codification the next risky change cuts corners under pressure (the same failure mode that produced MEH-265).

ADR-006 (schema parity discipline) and this ADR are complementary: ADR-006 enforces DB↔Pydantic↔frontend coherence at a single point in time; this ADR governs sequencing across time. With ADR-003 they form the schema-change triad — authority (003), parity (006), sequencing (007).

## Decision
Risky schema changes (`DROP COLUMN`, `RENAME COLUMN`, type change, `NOT NULL` on existing column, FK direction reversal) MUST follow 4-phase Expand-Contract. Each phase is its own PR with its own MEH-XXX. Phase 4 PR title MUST be prefixed `[DESTRUCTIVE]`.

### Operational checklist
1. **Phase 1 — Expand:** ADD column / table / index. Backfill in batched `UPDATE` loops (`WHERE id IN (... LIMIT 1000)`), NOT inside the migration body. Partial index acceptable.
2. **Phase 2 — Dual-write:** writes go to both old and new structure. Reads still come from old. Endpoint may be feature-flagged.
3. **Phase 3 — Read cutover:** switch reads to new structure across all surfaces (backend services, frontend consumers, admin tools, tests). Old structure stays for rollback.
4. **Phase 4 — Contract:** DROP old structure. Preconditions, ALL required:
   - ≥ 7-day staging soak with real traffic
   - R2 backup verified in dashboard within last 24h (per MEH-408 layer 2)
   - No dual-write divergence reported during soak
   - Column-level traffic check on the new endpoint shows real writes
5. **Reversibility test:** each phase MUST be safely revertable to the prior phase without data loss within the soak window.

### When NOT to use Expand-Contract
Low-risk additive changes still ship as Alembic revisions but skip the 4-phase sequence:
- Adding a nullable column with NULL default
- Adding a brand-new table no existing code reads from
- Adding a non-unique index

### Anti-patterns (forbidden)
- ✗ `DROP` + `ADD` in the same migration ("rename") — use ADD new + dual-write + drop old.
- ✗ Backfill in the migration body via unbounded `UPDATE` — locks the table.
- ✗ Runtime schema mutation (`_migrate_columns()` style) — deleted in MEH-267 (ADR-003), never returns.

## Consequences
**Positive:** zero-downtime guaranteed; each phase reversible; production never lands on an in-flight schema. The MEH-291 → MEH-456 sequence shipped 0 incidents.
**Negative:** 7-day minimum soak window; 4 PRs per change; mental overhead during dual-write; Smadar must remember to spot-check staging psql for divergence during soak.
**Mitigations:** soak gate + `[DESTRUCTIVE]` PR-title convention create natural pause points; ADR-006 parity tests catch silent drift even during dual-write.

## Alternatives considered
- **Single-PR migrate-and-pray** — rejected: the original failure mode (MEH-265). No rollback path mid-deploy.
- **Online schema-change tool (`pt-osc` / `gh-ost`)** — rejected: tool overhead exceeds the engineering savings at our table sizes; doesn't replace the dual-write + read-cutover discipline.
- **Feature-flag the schema** — rejected: flags gate code paths, not DDL. Doesn't solve the "old code on the new schema" rollback problem.
