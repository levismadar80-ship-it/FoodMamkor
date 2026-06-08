# MEH-773 — DB integrity wave · Chunk A (verbatim for Sapir's terminal)

> **RED tier — schema.** CC prepares everything verbatim; **Sapir runs the
> migration** (`alembic/versions/**` is blocked to CC in `settings.json`).
> Consolidates **AUD-042** (unique constraints) + **HOT-004 / SEN-002** (the
> `users.producer_id` FK gap, confirmed by a live production
> `ForeignKeyViolation`) into ONE revision.
>
> **STOP after this chunk — WAIT for Sapir:** run the dedupe pre-check →
> clean up any rows → apply the revision → bump `EXPECTED_REV`. Chunk B
> (ORM parity + 409 handling) is blocked on that apply.

## Schema facts verified (file:line)
| item | source | current state |
|---|---|---|
| `reports(reporter_id, producer_id)` | `models.py:598-605` | both NOT NULL, FK CASCADE; **no uq** → AUD-042 |
| `referral_clicks(referee_id)` | `models.py:945` | **no uq** → AUD-042 (double-credit) |
| `users.producer_id` | `models.py:248` | `ForeignKey("producers.id")` — **no `ondelete`** → SEN-002 `users_producer_id_fkey` violation |
| current head | `pr-checks.yml:176` | `EXPECTED_REV = f1c7b9a3e264` |
| table count | `pr-checks.yml:177` | `EXPECTED_TABLES = 35` (unchanged — constraints add no tables) |

**Not in this revision (by design):**
- `PhoneOtpToken.producer_id` / `KashrutBadgeRequest.producer_id` already carry DB
  `ondelete="CASCADE"` — the HOT-004 gap there is the **ORM `passive_deletes`**
  (no DDL) → **Chunk B**.
- GroupBuy capacity (AUD-042 third site) is a **row-lock** fix
  (`SELECT … FOR UPDATE`, `group_buys.py:97-124`), not a constraint → **Chunk B**.
- AUD-043 (admin double-approve 409 guard) is a router fix, out of this issue's scope.
- **MEH-272/273 (CHECK constraints — stars range, status enums; cf. HOT-015)** are
  **orthogonal** to these unique/FK constraints — no overlap. They may ship in a
  separate revision or be folded in by Sapir; nothing here duplicates them.

---

## STEP 1 — dedupe pre-check (Sapir runs FIRST, one statement per run, no trailing `;`)
`create_unique_constraint` fails if duplicates already exist. Run each; if any
returns rows, dedupe (keep the earliest by `created_at`) before STEP 2.

```sql
SELECT reporter_id, producer_id, COUNT(*) FROM reports GROUP BY reporter_id, producer_id HAVING COUNT(*) > 1
```

```sql
SELECT referee_id, COUNT(*) FROM referral_clicks GROUP BY referee_id HAVING COUNT(*) > 1
```

The FK change (STEP 2c) needs no dedupe — it only relaxes delete behavior; any
`users.producer_id` pointing at a missing producer would already violate the
existing FK, so none exist. (Optional sanity, expect 0 rows:)

```sql
SELECT u.id FROM users u LEFT JOIN producers p ON p.id = u.producer_id WHERE u.producer_id IS NOT NULL AND p.id IS NULL
```

**Dedupe cleanup templates** (only if STEP 1 returns rows — Sapir reviews before running):
```sql
DELETE FROM reports a USING reports b WHERE a.reporter_id = b.reporter_id AND a.producer_id = b.producer_id AND a.created_at > b.created_at
```
```sql
DELETE FROM referral_clicks a USING referral_clicks b WHERE a.referee_id = b.referee_id AND a.created_at > b.created_at
```

---

## STEP 2 — the revision (verbatim — Sapir places under `alembic/versions/`)

> Confirm `down_revision` still equals the live head before applying
> (`alembic heads` → expect `f1c7b9a3e264`). `revision` id: let Alembic generate,
> or set a stable slug.

```python
"""MEH-773: unique constraints (AUD-042) + users.producer_id FK SET NULL (HOT-004/SEN-002)

Revision ID: <generated>
Revises: f1c7b9a3e264
"""
from alembic import op

revision = "<generated>"
down_revision = "f1c7b9a3e264"
branch_labels = None
depends_on = None


def upgrade():
    # AUD-042: one report per (reporter, producer) — closes the check-then-act race
    op.create_unique_constraint(
        "uq_report_reporter_producer", "reports", ["reporter_id", "producer_id"]
    )
    # AUD-042: one referral credit per referee
    op.create_unique_constraint(
        "uq_referral_one_per_referee", "referral_clicks", ["referee_id"]
    )
    # HOT-004 / SEN-002: users.producer_id had no ON DELETE → deleting a producer
    # while a self-registered owner still referenced it raised
    # ForeignKeyViolation (users_producer_id_fkey). SET NULL matches the
    # router-level nullify already done in admin.py / auth.py (MEH-747).
    op.drop_constraint("users_producer_id_fkey", "users", type_="foreignkey")
    op.create_foreign_key(
        "users_producer_id_fkey", "users", "producers",
        ["producer_id"], ["id"], ondelete="SET NULL",
    )


def downgrade():
    op.drop_constraint("users_producer_id_fkey", "users", type_="foreignkey")
    op.create_foreign_key(
        "users_producer_id_fkey", "users", "producers", ["producer_id"], ["id"],
    )
    op.drop_constraint("uq_referral_one_per_referee", "referral_clicks", type_="unique")
    op.drop_constraint("uq_report_reporter_producer", "reports", type_="unique")
```

**Verify before writing:** the live FK constraint name is the Postgres default
`users_producer_id_fkey` (confirmed by the SEN-002 event); if a prior migration
renamed it, adjust both `drop_constraint`/`create_foreign_key` names.

---

## STEP 3 — after apply (Sapir)
- Bump `EXPECTED_REV` in `.github/workflows/pr-checks.yml:176` → the new revision id.
- `EXPECTED_TABLES` stays **35** (no new tables).
- `alembic upgrade head` on staging → `/health` 200 + `/producers` OK → then prod in the release after MEH-768.

---

## Chunk B (blocked on Sapir's apply — NOT in this PR)
- `models.py`: add `passive_deletes=True` to the `PhoneOtpToken` + `KashrutBadgeRequest`
  producer relationships (defer to DB CASCADE; closes the SEN-003 ORM-nullify race
  at the schema layer) + ORM `UniqueConstraint(...)` mirrors of the two new uniques.
- Routers: `reports.py` + `referrals.py` catch `IntegrityError` → **409** with the
  existing Hebrew error-key pattern; `group_buys.py:97-124` → `SELECT … FOR UPDATE`
  capacity check.
- `tests/test_integrity_constraints.py`: duplicate-insert → 409 (reports, referrals);
  producer-delete with a linked user → user.producer_id NULLed, no 500.

_Refs: AUD-042/043 · HOT-004 · SEN-002/003 · MEH-272/273 (CHECK — coordinate) · #1001._
