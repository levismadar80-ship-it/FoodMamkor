Run adversarial review specialized for Pydantic↔DB↔Zod schema drift.

Use this variant when the diff touches `backend/app/models/`, `backend/app/schemas/`,
`frontend/lib/schemas.js`, or any Alembic revision under `backend/alembic/versions/`.

The base `/adversarial-review` FINDER is open-ended; this variant narrows it to
the schema-parity surface that produced MEH-283 (`/auth/me` 500 — `rejection_reason`
on DB but missing from ORM) and MEH-321 (`/producers/me` 422 — Pydantic↔DB
nullability/default mismatch). Truth table: `docs/SCHEMA_PARITY_AUDIT.md`.
Discipline rules: `docs/decisions/ADR-006-schema-parity-discipline.md` (R1–R5).

---

## FINDER — schema drift patterns

Walk the diff. For each touched domain (Producer / User / Product / Event / Review),
cross-check the 3 layers field-by-field: DB column → Pydantic input/output → Zod
(where present in `frontend/lib/schemas.js`).

1. **Missing field** — DB column present, Pydantic `*Out` absent (or vice versa).
   Recipe: `grep -n "<column>" backend/app/models/models.py backend/app/schemas/schemas.py`.
   Canonical: MEH-283 — `rejection_reason` Alembic-added but ORM-missing.
2. **Nullability mismatch** — DB `NULL` allowed, Pydantic field non-Optional (or
   reverse). Cross-check `Mapped[T | None]` ↔ `field: T | None = None` ↔ Zod
   `.optional()`.
3. **Default-value drift** — DB `server_default=...` but Pydantic field has no
   `default` (handlers crash on omit) or vice versa. Canonical: MEH-321.
4. **Type drift** — Most common: `created_at: str` in `*Out` instead of `datetime`
   (Drift #4 in audit). Violates ADR-006 R4.
5. **Router-embedded `BaseModel`** — Any new `class FooIn(BaseModel)` inside
   `backend/app/routers/`. Violates ADR-006 R1; MEH-460 allowlist is closed —
   no new entries permitted.
6. **Alembic without ORM** — Any new `backend/alembic/versions/*.py` adding a
   column with no matching `Mapped[...]` line in `models.py`. Cross-ref MEH-265
   (`_migrate_columns` drift) + MEH-283.
7. **Zod gap** — New publicly-exposed `*Out` field consumed in `frontend/`
   without a matching entry in `frontend/lib/schemas.js` (ProducerSchema or the
   relevant domain schema, when added). ADR-006 R5 inventory
   (`frontend/lib/api-types.md`) is pending; until it lands, grep the consumer
   directly.

---

## ADVERSARY — rejection criteria

For each FINDER hit, try to disprove:

- Is the field documented as INFO drift in `docs/SCHEMA_PARITY_AUDIT.md`? (e.g.
  `availability_state` mid-MEH-291 migration, legacy `starting_price_label`
  alias). Reject — known baseline.
- Is it an admin-only signal intentionally excluded from public `*Out`? (e.g.
  `is_blocked`, `admin_notes`, `password_hash`, `google_id`, `apple_id`,
  `reset_token`). Reject — correct boundary.
- Is the DB-only / Pydantic-only field a denormalized count or computed
  property? (e.g. `favorites_count` via query, `is_oauth` property). Reject.
- Is the router-embedded `BaseModel` already pinned in
  `tests/test_schema_location.py:ALLOWLIST`? Reject — pre-existing,
  MEH-460 tracks the cleanup.

---

## REFEREE — verdict tiering

- **BLOCK** — Drift class #1 (missing field), #2 (nullability), #3 (default), #5
  (new router-embedded BaseModel), #6 (Alembic without ORM). These shipped real
  500s/422s in MEH-265/283/321.
- **WARN** — Drift class #4 (type drift on datetime/UUID), #7 (Zod gap on a
  publicly-consumed field). Ship-blocking only if the field is on a hot path.
- **INFO** — Match against an existing audit-marked INFO row (no action required;
  cite the audit row).

Output: numbered list of real BLOCKs first, then WARNs, then INFO refs. Each
entry: `<file>:<line> — <pattern #> — <one-line evidence>`.
