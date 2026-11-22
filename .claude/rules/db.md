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
`scripts/checks/prose-rules-guard.sh` (R3) fails a `.create_all(` outside `backend/app/startup.py` or a
`_migrate_columns` function anywhere in `backend/`.

Two parallel schema owners (`create_all` on boot + `_migrate_columns()`) broke
production login in MEH-265; Alembic is now the sole schema authority.

---

**A new column says what it holds (MEH-3643).** Every column added to a model
gets a row in `docs/privacy/columns.tsv`: a category from the privacy page's
`DATA_ITEMS`, or `not-personal`, with a reason. A personal-data category that the
page does not yet describe means the page changes in the same PR.
`tests/test_privacy_column_ledger.py` fails on a column with no row. Every
column that existed on 21/11/2026 was classified under MEH-3644, so
`docs/privacy/column-baseline.txt` is empty and stays empty (ceiling 0).

---

## Migration safety

Before any PR that touches `backend/app/models/`, `backend/app/routers/`,
or `backend/app/auth.py`:

1. Generate Alembic revision: see [docs/MIGRATIONS.md](../../docs/MIGRATIONS.md).
2. Update [.ai/diagrams/db-schema.md](../../.ai/diagrams/db-schema.md)
   if columns/tables changed.
3. Verify locally: drop tables → `alembic upgrade head` → confirm
   `/health` returns 200 and `/producers` works.

Model↔migration drift is caught by `alembic check` (MEH-836).
`EXPECTED_TABLES` still bumps when a migration adds/drops a table. CC may write
revision files under `backend/alembic/versions/**`; apply is automatic on boot,
and a revision waits for Sapir's OK (workflow rule 38).

חריג merge-revision ריק — ראו ADR-025 Amendment 18/07/2026.

---

## Architectural smell — two parallel mechanisms

See [workflow.md](./workflow.md) → «Architectural smell detection» Smell #1.
