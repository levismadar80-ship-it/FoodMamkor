# Rolling production back to a recorded release

> MEH-2893 (`docs/release/anchor-plan.md` §A.2). The ids come from
> `docs/release/anchors/v<X.Y.Z>.md`. Never use an id from memory, and never use
> "the one before".
>
> **Order matters: frontend, then backend, then schema only if the revision
> itself is the problem, then data only if data is actually wrong.** Each step
> is reversible except the last.

## 0 · Decide what is broken

| Symptom | Layer |
|---|---|
| Pages look or behave wrong; the API answers correctly | frontend only |
| The API errors or answers wrong; `/api/health` shows the new `git_sha` | backend |
| The backend fails on a column or table | schema |
| Rows are wrong or missing | data |

## 1 · Frontend (Vercel): reversible

- **Who:** Sapir. CC can prepare the exact deployment id.
- **How:** Vercel → project `food-mamkor` → Deployments → the recorded production deployment (`dpl_…`) → **Promote** / **Instant Rollback**. There is no rebuild.
- **Verify:** the page shows the old behaviour, and the deployment's commit SHA in Vercel is the recorded one.

## 2 · Backend (Railway): reversible

- **Who:** Sapir.
- **How:** Railway → project `believable-tenderness` → production → backend service → Deployments → the recorded deployment → **Redeploy** / **Rollback**.
- **Schema:** the database keeps the newer schema. That is safe **because revisions are expand-only (ADR-007)**: the older code ignores columns it does not know. **Do not downgrade the schema to roll the backend back.**
- **Verify:** `https://mehamakor.co.il/api/health` → `version.git_sha` equals the recorded commit, and `/api/health/readiness` returns 200.

## 3 · Schema (Alembic): only if a revision itself is the problem

- **Who:** Sapir. CC is denied `alembic downgrade`.
- **Check first:** the revision's downgrade is covered by `tests/test_alembic_roundtrip.py`, and its CI run is green. If it isn't, **stop**.
- **Take a manual dump first** (`docs/BACKUPS.md` §2).
- **How:** `alembic downgrade <recorded head>`, run from Railway against production.
- **Irreversible part:** a downgrade drops what the revision added, **including any data written into it since the release.**
  - v1.5.0's only revision, `e4c9a2f71b58`, drops `favorite_alerts.notify_new_group_buy`. Every alert preference set after the release is lost.
- **Verify:** `/api/health` → `version.alembic_head` equals the recorded head.

## 4 · Data (Postgres): not reversible

- **Who:** Sapir.
- **Never restore over production directly.**
- Restore the recorded backup into a **scratch** database first (`docs/BACKUPS.md` §3), compare it with production, and decide what to copy back.
- **Irreversible:** everything written to production after the backup time is lost by a full restore.

## After any rollback

1. Write what was rolled back, when and why into the release record, under a «Rollback» heading.
2. Open a card for the root cause.
3. Re-run the smoke checks: `docs/RELEASE_CHECKLIST.md` section ב.
