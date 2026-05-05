# ADR-003: DB schema via Alembic migrations only

**Status:** Accepted
**Date:** 2026-04-24
**Deciders:** Smadar Levi
**Source:** MEH-265 post-mortem (`docs/INCIDENTS/2026-04-migrate-columns-drift.md`); MEH-267 scaffold (HANDOFF.md:2578-2596, PR #311)

## Context
Schema lived in two parallel mechanisms: `Base.metadata.create_all()` on boot and a hand-maintained `_migrate_columns()` with raw `ALTER TABLE ADD COLUMN IF NOT EXISTS`. PRs #258/#259 added four `User` columns to the ORM but didn't update `_migrate_columns`. CI passed (CI uses `create_all` on a fresh DB — incident.md:53-59); production hit `column users.token_version does not exist` on every login for ~3 minutes (incident.md:13-26).

## Decision
Alembic is the **sole** schema authority. `_migrate_columns()` (258
lines) and `Base.metadata.create_all()` on the production boot path are
both deleted. `alembic upgrade head` runs on every Railway container
boot; a CI drift gate asserts table count + baseline revision
(incident.md:127-138; HANDOFF.md:2596).

## Consequences
**Positive:** ORM↔DB drift becomes structurally impossible; every schema change is a reviewable revision file with a known head SHA.
**Negative:** Every new column requires an Alembic revision (overhead on small changes); `EXPECTED_REV` in `pr-checks.yml` must be bumped on every migration PR (HANDOFF.md:2458).
**Mitigations:** Dev/CI safety-net `create_all` retained in `main.py` with `checkfirst=True` — production uses Alembic exclusively (HANDOFF.md:1372). Smell-detection rule in workflow.md ("Two parallel mechanisms for one job") prevents recurrence.

## Alternatives considered
- Keep `_migrate_columns` + add a CI parity check — rejected: patches the symptom, leaves two owners of schema state.
- ORM auto-migrate on boot (`create_all` only) — rejected: silently ignores drops/renames; the original failure mode.
