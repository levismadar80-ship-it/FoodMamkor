---
paths:
  - "backend/**/*.py"
---

# Database rules

Schema authority and migration safety. Sourced from MEH-267 post-mortem
(PR #304 / MEH-265). Full Alembic workflow: [docs/MIGRATIONS.md](../../docs/MIGRATIONS.md).

---

## Schema changes via Alembic only

**Schema changes via Alembic only.** `_migrate_columns()` removed in
MEH-267. Guide: [docs/MIGRATIONS.md](../../docs/MIGRATIONS.md).

_Source: post-mortem PR #304 (MEH-265), 2026-04-24 — `_migrate_columns`
drift broke production login; the hotfix PR bundled a 7-call-site
refactor under pressure._

The codebase had two parallel mechanisms doing the same job
(`Base.metadata.create_all` on boot + `_migrate_columns()` DDL). Both
"worked" independently, so neither surface showed an error — the smell
was invisible until a production incident. Alembic is now the sole
schema authority.

---

**A new column says what it holds (MEH-3643).** Every column added to a model
gets a row in `docs/privacy/columns.tsv`: a category from the privacy page's
`DATA_ITEMS`, or `not-personal`, with a reason. A personal-data category that the
page does not yet describe means the page changes in the same PR.
`tests/test_privacy_column_ledger.py` fails on a column with no row; the columns
that existed on 21/11/2026 are in `docs/privacy/column-baseline.txt`, which only
shrinks.

---

## Migration safety

Before any PR that touches `backend/app/models/`, `backend/app/routers/`,
or `backend/app/auth.py`:

1. Generate Alembic revision: see [docs/MIGRATIONS.md](../../docs/MIGRATIONS.md).
2. Update [.ai/diagrams/db-schema.md](../../.ai/diagrams/db-schema.md)
   if columns/tables changed.
3. Verify locally: drop tables → `alembic upgrade head` → confirm
   `/health` returns 200 and `/producers` works.

> **MEH-836:** the old `EXPECTED_REV` bump step is gone — model↔migration
> drift is now caught by `alembic check` alone (no hardcoded head to keep
> in sync). `EXPECTED_TABLES` still bumps for migrations that add/drop a
> table. CC may now author hand-written revision files under
> `backend/alembic/versions/**`; apply stays automatic on Dockerfile boot.

חריג merge-revision ריק — ראו ADR-025 Amendment 18/07/2026.

---

## Architectural smell — two parallel mechanisms

Before touching `models/`, `schemas/`, or any file owning shared state,
grep for a second owner:

```bash
grep -r "create_all\|metadata.create\|_migrate" backend/ --include="*.py"
```

If you find a second path owning the same state, fix it (one authority).
The other path is deleted, not disabled. Full pattern catalogue in
[workflow.md](./workflow.md) → "Architectural smell detection (MEH-271)".
