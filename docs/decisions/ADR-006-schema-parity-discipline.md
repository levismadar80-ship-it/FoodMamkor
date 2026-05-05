# ADR-006: Schema parity discipline — 5 enforcement rules

**Status:** Accepted
**Date:** 2026-05-05
**Deciders:** Smadar Levi
**Source:** MEH-433 audit (`docs/SCHEMA_PARITY_AUDIT.md`, 2026-05-05 baseline)

## Context
Three incidents (MEH-265, MEH-283, MEH-321) shared the same root cause:
silent drift between DB / Pydantic / frontend layers, invisible until a
runtime call exposes it. CI's `create_all` on a fresh DB cannot detect
it — only schema-against-schema can. The MEH-433 audit found 11 drift
items across 5 domains — 1 BLOCK security regression + 2 architecture
violations.

## Decision
- **R1** — All Pydantic schemas in `backend/app/schemas/`, never embedded in `routers/`.
- **R2** — Per-domain parity test: every non-internal ORM column maps to `*Out` schema or an explicit allowlist.
- **R3** — Every User-creating handler must invoke `app.services.password_policy.validate_password`.
- **R4** — Datetime fields in `*Out` use `datetime` type, never `str`.
- **R5** — `frontend/lib/api-types.md` inventory: every `*Out` has a documented frontend shape.

## Consequences
**Positive:** drift surfaces in CI, not production; password policy uniform; future domains follow rails.
**Negative:** new domain requires updating `api-types.md` + a parity-test allowlist row.
**Mitigations:** rules ship incrementally — R3 first (MEH-457, security), R1 second (MEH-458, architecture+test), R4/R5 in follow-ups; MEH-459 closes drift #3.

## Alternatives considered
- **TypeScript migration** — rejected: scope too large; doesn't help backend ORM↔Pydantic drift.
- **Generated types (`openapi-typescript`)** — deferred: revisit if `api-types.md` insufficient after 30 days.
