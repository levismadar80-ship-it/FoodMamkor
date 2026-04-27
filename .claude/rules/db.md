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

## Migration safety

Before any PR that touches `backend/app/models/`, `backend/app/routers/`,
or `backend/app/auth.py`:

1. Generate Alembic revision: see [docs/MIGRATIONS.md](../../docs/MIGRATIONS.md).
2. Update `EXPECTED_REV` in `.github/workflows/pr-checks.yml` (CI drift
   gate). Current head must match the new revision.
3. Update [.ai/diagrams/db-schema.md](../../.ai/diagrams/db-schema.md)
   if columns/tables changed.
4. Verify locally: drop tables → `alembic upgrade head` → confirm
   `/health` returns 200 and `/producers` works.

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
