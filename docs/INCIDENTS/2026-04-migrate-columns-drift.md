# Incident — _migrate_columns drift → /auth/login 500 (MEH-265) — 2026-04-23

**Severity:** Critical (production login broken for all users)
**Duration:** ~3 minutes (deploy → hotfix merge)
**Primary owner:** Smadar
**Status:** Resolved — root mechanism deleted in MEH-267 (Alembic)

---

## What was observed

After merging PR #259 (MEH-206) and PR #258 (MEH-192) to staging and
triggering a Railway redeploy, every `POST /api/auth/login` returned
`500 Internal Server Error`. No user could log in.

Browser console:
```
POST /api/auth/login  500
```

Railway logs:
```
sqlalchemy.exc.ProgrammingError: (psycopg2.errors.UndefinedColumn)
column users.token_version does not exist
LINE 1: SELECT users.id, users.email, users.token_version ...
```

---

## Root cause

### Primary — new ORM columns never wired into `_migrate_columns`

PR #259 (MEH-206) and PR #258 (MEH-192) added four columns to the
`User` ORM model (`backend/app/models/models.py:159–163`):

```python
token_version       = Column(Integer, nullable=False, server_default="1")
email_verified      = Column(Boolean, default=False)
email_verify_token  = Column(String(64), nullable=True)
email_verify_expires = Column(DateTime, nullable=True)
```

Neither PR added corresponding `ALTER TABLE ADD COLUMN IF NOT EXISTS`
entries to `backend/app/main.py:_migrate_columns()`.

On Railway boot:

1. `Base.metadata.create_all()` — no-op on the existing `users` table
2. `_migrate_columns()` — no entry for the four new columns → no DDL runs
3. First `SELECT` touching `token_version` → `column does not exist` → 500

### Why CI didn't catch it

`pytest` calls `Base.metadata.create_all()` against a **fresh** database
on every run. On a fresh database, `CREATE TABLE users` includes all ORM
columns — so the columns always exist in CI. `_migrate_columns` is only
relevant for **upgrading an existing database**, which CI never tests.
The gap was structurally invisible to the test suite.

---

## Hotfix

**PR #304** (`hotfix/meh-206-meh-192-migrate-columns`, merged
2026-04-23T22:10Z) — two edits:

1. `backend/app/main.py` — four missing `ADD COLUMN IF NOT EXISTS`
   entries wired into `_migrate_columns()`:
   ```sql
   ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;
   ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
   ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_token VARCHAR(64);
   ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_expires TIMESTAMP;
   ```

2. `backend/app/routers/auth.py` — fixed a pre-existing one-arg call to
   `create_access_token(user.id)` in the new `/auth/register/producer/oauth`
   handler (MEH-170 loose end). Aligned with all other six call-sites to
   pass `(user.id, user.token_version)`.

The login 500 was fixed by edit (1) alone. Edit (2) was a latent bug
discovered during the investigation — correct to fix, but it should
have been a separate commit.

### The bundling mistake

PR #304 bundled:
- the emergency hotfix (1 line change to `_migrate_columns`) with
- a 7-call-site `create_access_token` consistency refactor

This violated the commit discipline rule: **hotfixes get their own
commit, never bundled with a refactor.** Under incident pressure,
combining them felt faster. It wasn't — it made the diff harder to
review, harder to revert, and harder to understand in hindsight.

This is the pattern that became the "Commit discipline" section in
`CLAUDE.md`:

> Hotfixes get their own commit — never bundled with a refactor.
> When Claude Code suggests "let's do both together" — say split.

---

## Timeline

| Time (UTC) | Event |
|---|---|
| 2026-04-23 ~21:00 | PR #259 (MEH-206) + PR #258 (MEH-192) merged to staging |
| 2026-04-23 ~21:05 | Railway staging redeploys with new code |
| 2026-04-23 ~21:08 | First `POST /auth/login` → 500; incident detected |
| 2026-04-23 ~22:07 | PR #304 (hotfix) opened |
| 2026-04-23 ~22:10 | PR #304 merged; Railway redeploys; login restored |

---

## Prevention

### Immediate (PR #304 → MEH-266)

Added a **Database Checklist** to `.github/pull_request_template.md`
(MEH-266): every PR that touches `backend/app/models/*.py` must declare
the corresponding `_migrate_columns()` entry, or explicitly tick "no
model changes". This makes the gap a PR-review catch, not a post-deploy
surprise.

### Permanent (MEH-267, PR #311, merged 2026-04-24)

`_migrate_columns()` was **deleted entirely** (258 lines). Alembic is
now the sole schema authority:

- `alembic upgrade head` runs on every Railway container boot
  (wired into Dockerfile CMD)
- A migration drift gate in CI (`pr-checks.yml`) runs `alembic upgrade
  head` against a fresh Postgres, then asserts the expected table count
  and baseline revision
- New columns require an Alembic revision file — the gap between ORM
  model and DB schema is structurally impossible with Alembic

Guide: [`docs/MIGRATIONS.md`](../MIGRATIONS.md)

### Process (CLAUDE.md)

- **Commit discipline rule** — hotfixes get their own commit, never
  bundled with a refactor. Locked in `CLAUDE.md` § "Commit discipline".
- **Bug Protocol step 2** — grep for sibling call-sites before closing
  any bug (the 7-site `create_access_token` pattern would have been
  caught at review time, not bundled into the hotfix).

---

## Related

- PR #258 — MEH-192 email verification (introduced 3 of the 4 missing columns)
- PR #259 — MEH-206 settings redesign (introduced `token_version`)
- PR #304 — MEH-265 hotfix (this incident)
- MEH-266 — DB migration PR checklist (immediate prevention)
- PR #311 — MEH-267 Alembic scaffold (permanent fix — `_migrate_columns` deleted)
- [`docs/MIGRATIONS.md`](../MIGRATIONS.md) — Alembic workflow guide
