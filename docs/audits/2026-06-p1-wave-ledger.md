# 2026-06 P1 wave — execution ledger

Sequential execution of the P1 fix wave off the 2026-06-07 Hotspot + Sentry
audit (`docs/audits/2026-06-hotspot-sentry.md`). One branch + one DRAFT PR per
issue, each off fresh `staging`. **Sapir's merge is the gate for every PR — none
were merged by the executing session.**

## Summary

| Issue | Title | Risk | Outcome | PR |
|---|---|---|---|---|
| MEH-767 | owner-scoped schema for `/producers/me` (HOT-001) | YELLOW | ✅ DRAFT PR | #1005 |
| MEH-769 | force-approve guard on status toggle (HOT-002) | YELLOW | ✅ DRAFT PR | #1006 |
| MEH-770 | SQLAlchemy engine pool tuning (SEN-001) | YELLOW | ✅ DRAFT PR | #1008 |
| MEH-771 | WhatsApp delivery persistence — Chunk A | RED | ⛔ BLOCKED (precondition) | — |

## MEH-767 — fix(MEH-767): owner-scoped schema for /producers/me — PR #1005

HOT-001 (CRITICAL). `GET/PUT /producers/me` returned `ProducerAdminOut`, leaking
the admin-only AI risk surface (`risk_score`/`risk_reasoning`, MEH-509 PR3) +
declaration audit trail (`declared_at`/`declaration_version`, MEH-759) to the
producer being scored. New `ProducerOwnerOut(ProducerDetailOut)` adds back only
the owner's own `producer_license_number` (MEH-530); the four admin-only fields
have zero producer-side frontend consumers. Serialization-only; no DB change.
Adversarial-review-types: 0 BLOCK / 0 WARN. Refs MEH-767 (Sapir reviews).

## MEH-769 — fix(MEH-769): enforce producer-approval state machine — PR #1006

HOT-002 (HIGH). `toggle_producer_status`'s bare `else` force-approved any
non-approved producer (incl. `rejected`) onto the public map, skipping the
approve flow + MEH-509 hooks. Guarded to `approved ⇄ inactive` only;
other source states → 409 before any mutation. Frontend surfaces the 409 via
the existing `useAdminAction` path using a new message key
(`admin.producers.toggle.invalid_transition`, he+en); backend detail is the API
fallback. Tests assert the matrix + hook-fires-once on the legit path / zero on
a blocked toggle. Branched off fresh `staging` (no file overlap with MEH-767).
Adversarial-review (errors+coverage): 0 BLOCK / 0 WARN. Refs MEH-769.

## MEH-770 — fix(MEH-770): tune + harden SQLAlchemy engine pool — PR #1008

SEN-001 (~500 QueuePool-exhaustion events, one burst). `database.py` ran on
implicit defaults. Now explicit, env-overridable pool config on the Postgres
path (`pool_size`/`max_overflow`/`pool_timeout`/`pool_recycle` + retained
`pool_pre_ping`), a safe `_int_env` parser, and an `_ObservableQueuePool` that
logs one structured `db_pool_exhausted` line for clean Sentry grouping.
Defaults hold the prod-proven ceiling of 15 (1 uvicorn worker) — capacity not
blindly raised (audit warns re: Postgres `max_connections`). New env vars listed
in the PR body, **not** added to any env file (Sapir's Railway step).
Scope note: env read in `database.py` (not `config.py` BaseSettings) because
`config.py` is permission-protected / out of file scope. Adversarial-review
(errors): 0 BLOCK / 0 WARN (1 documented private-`_do_get` note). Refs MEH-770.

## MEH-771 — ⛔ BLOCKED (precondition not met)

**Chunk A not executed.** The issue's PRECONDITION is "verify, do not apply:
alembic current on staging includes the `outbound_messages` revision from
PR #991 body (Sapir terminal); EXPECTED_REV bumped. Missing → STOP, report."

Verification on fresh `origin/staging` (read-only):

| Check | Expected | Found | file:line |
|---|---|---|---|
| `outbound_messages` migration in `alembic/versions/` | present | **absent** (18 version files, none) | `backend/alembic/versions/` |
| `EXPECTED_REV` points at the outbound_messages revision | bumped | **`f1c7b9a3e264`** = MEH-762 `add_verified_at_doc_type` (2026-06-06) | `.github/workflows/pr-checks.yml:176` |
| `OutboundMessage` model / `outbound_messages` table | present | **absent** | `backend/app/models/` |
| `outbound_messages` anywhere in backend/frontend/tests | present | **absent** | — |

Sapir's terminal step (apply PR #991's `outbound_messages` Alembic, commit it,
bump `EXPECTED_REV`) has not landed. Chunk A requires "ORM model parity with the
**applied** migration" — there is no applied migration to mirror, and building
the model + send-layer writes against a non-existent table would fail the
`EXPECTED_REV` CI gate and ship code referencing a missing table. Per the gate:
BLOCKED, skipped, no PR. Chunks B/C were already gated behind the RED-tier WAIT.

**To unblock:** Sapir applies the PR #991 migration on staging, commits the
revision file under `backend/alembic/versions/`, bumps `EXPECTED_REV` in
`pr-checks.yml`, then re-runs MEH-771 from Chunk A.
