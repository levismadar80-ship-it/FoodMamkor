# Rolling production back to a recorded release

> MEH-2893 (`docs/release/anchor-plan.md` §A.2). The ids come from
> `docs/release/anchors/v<X.Y.Z>.md`. Never use an id from memory, and never use
> "the one before".
>
> **Frontend and backend are reversible. Schema and data are not**: a schema
> downgrade drops what the revision added, and a restore loses everything
> written after the backup.
>
> ⚠️ **This runbook has not been drilled yet** (§A.4 waits for the MEH-1517
> secret). Until it has, every step below is a plan, not a proven path.

## 0 · Decide what is broken

| Symptom | Layer |
|---|---|
| Pages look or behave wrong; the API answers correctly | frontend only |
| The API errors or answers wrong; `/api/health` shows the new `git_sha` | backend |
| The backend fails on a column or table | schema |
| Rows are wrong or missing | data |

## 1 · Frontend (Vercel): reversible

- **Who:** Sapir. CC can prepare the exact deployment id.
- **How:** Vercel → project `food-mamkor` → Deployments → the recorded production deployment (`dpl_…`) → **Promote** (preferred, by that exact id) or **Instant Rollback**. There is no rebuild.
- **Plan:** Pro since 10/11/2026 (HANDOFF), so any earlier production deployment can be the target. On Hobby, Instant Rollback reaches only the previous one.
- **Verify:** the page shows the old behaviour, and the deployment's commit SHA in Vercel is the recorded one.
- **Afterwards:** after an Instant Rollback, Vercel **stops assigning the production domain automatically**. The fix merged to `main` later will build but **will not go live** until someone promotes it. See «After any rollback».

## 2 · Backend (Railway): depends on whether the release added a revision

**Why it depends.** The image boots with `alembic upgrade head && exec uvicorn …` (`Dockerfile:61`). An older image does not contain the newer revision file. If the database is still at the newer revision, `alembic upgrade head` stops with *Can't locate revision*, uvicorn never starts, the `/health/readiness` healthcheck fails, and Railway keeps the **current** deployment live. **The rollback silently does not happen.**

### 2a · The release added no revision

- **Who:** Sapir.
- **How:** Railway → project `believable-tenderness` → production → backend service → Deployments → the recorded deployment → **Rollback**.
- **Rollback restores both the image and that deployment's variables.** Any variable changed or rotated since then goes back to its old value, including rotated secrets. (Redeploy is a different action: it rebuilds the *current* code.)
- **Verify:**
  - `https://mehamakor.co.il/api/health` → `version.git_sha` equals the recorded commit, and `/api/health/readiness` returns 200.
  - Railway → Variables: every variable rotated since the release is set again to its current value.

### 2b · The release added a revision (v1.5.0 does: `e4c9a2f71b58`)

The schema has to go back **before** the old image can boot. That means data loss (§3) and a narrow order:

1. Take the manual dump (`docs/BACKUPS.md` §2).
2. Dry run: restore that dump into a scratch database (`docs/BACKUPS.md` §3) and run `alembic downgrade <recorded head>` there. If it fails, **stop**.
3. Downgrade production from inside the **running** container: `railway ssh` into the FoodMamkor production service, then `cd /app && alembic downgrade <recorded head> && alembic current`. (`railway run` / `railway shell` run on your own machine, where the internal `DATABASE_URL` does not resolve.)
4. **Immediately** roll the backend back (2a). Any restart of the newer container before then re-applies the revision, because its boot runs `upgrade head`.
5. Verify as in 2a. Also: `version.alembic_head` equals the recorded head. That value is read once at boot (`startup.py`), so only trust it on the rolled-back container. Right after step 3, trust `alembic current`.

**This order is fragile.** Sapir decides the lasting fix (it touches the Dockerfile, HIGH-RISK). The options are on MEH-2892:

- (א) keep 2b as is;
- (ב) let boot tolerate a database that is ahead of the image (skip `upgrade head` when the current revision is a known descendant);
- (ג) roll back by deploying the old code **with** the newer revision files.

Sapir chose (ב) on 10/11: MEH-2903, `backend/scripts/migrate_on_boot.py`. Until its Dockerfile wiring ships (chunk 2, after v1.5.0, on Sapir's go), 2b is the only procedure.

### 2c · Back to v1.5.0 after `19ac967d78fb` (or any later revision) was applied

**Why 2a alone fails here.** v1.5.0's image has **no** `migrate_on_boot.py`. It boots with plain `alembic upgrade head` (`Dockerfile:61`) and knows head `e4c9a2f71b58`. It has no file for `19ac967d78fb` (`alembic_lineage`, MEH-2903) or for anything after it. On a database at one of those revisions it stops at *Can't locate revision*, and Railway keeps the current deployment. The newer image's `migrate_on_boot.py` does not help, because the image that boots after a rollback is the **old** one.

**Procedure: 2b with `<recorded head>` = `e4c9a2f71b58`.**

1. Take the manual dump (`docs/BACKUPS.md` §2).
2. Dry run on a scratch restore: `alembic downgrade e4c9a2f71b58`. Run it with the **current (newer)** image's files: only that image has the files of the revisions being undone. If it fails, **stop**.
3. Production: `railway ssh` into the **running, newer** container, then `cd /app && alembic downgrade e4c9a2f71b58 && alembic current`. It must print `e4c9a2f71b58`.
4. **Immediately** roll back to the recorded v1.5.0 deployment (2a). A restart of the newer container before that re-applies the revisions. With or without `migrate_on_boot.py`, its boot runs `upgrade head` on a database that is behind it.
5. Verify as in 2a, plus: `version.alembic_head` = `e4c9a2f71b58` on the rolled-back container.

**What is lost:**

- `19ac967d78fb`: its downgrade drops `alembic_lineage`. That is boot bookkeeping only, not user data. The next boot of a `migrate_on_boot.py` image writes it again.
- Each later revision: whatever its own `downgrade()` drops, including the data written into it since. Read every one in the dry run (step 2) before step 3.

### 2d · The first rollback-safe release

**Rollback mode needs `migrate_on_boot.py` in the image you roll back *to*.** It is the older image that has to tolerate a newer database. Having the lineage table in the database is not enough.

- **The first release you can roll back to without 2b/2c** is the first release whose `Dockerfile` runs `python -u scripts/migrate_on_boot.py` (MEH-2903 chunk 2, not merged, waiting for Sapir's go after v1.5.0). Call it **R**.
  - It is **not** v1.5.0.
  - It is **not** a release that has `19ac967d78fb` but still boots with plain `alembic upgrade head`.
- **Rolling back from a later release to R is automatic when both hold:**
  - **R's head is recorded in `alembic_lineage`.** That happens on the first successful boot of R, or of any later `migrate_on_boot.py` image, on that database.
  - **Every revision after R's head is expand-only (ADR-007).** Rollback mode starts R's code on the newer schema and undoes nothing.
- **If R's head is not recorded,** R's boot exits 3 (`SPLIT HISTORY`, naming both revisions) and the current deployment stays live. Use 2b.
- **Rolling back to anything older than R** (v1.5.0 included) is always 2b or 2c.

## 3 · Schema (Alembic): only if a revision itself is the problem

- **Who:** Sapir. CC is denied `alembic downgrade`.
- **What the test proves:** `tests/test_alembic_roundtrip.py` proves the schema change can be undone **on an empty database only**. It does not prove the downgrade succeeds on production rows (a re-added NOT NULL / UNIQUE / CHECK can fail). It also cannot catch a data-only revision that does not restore its data. So the dry run in 2b step 2 is required here too.
- **How:** as 2b steps 1–3.
- **Irreversible:** a downgrade drops what the revision added, **including any data written into it since the release.**
  - v1.5.0's only revision, `e4c9a2f71b58`, drops `favorite_alerts.notify_new_group_buy`. Every alert preference set after the release is lost.

## 4 · Data (Postgres): not reversible

- **Who:** Sapir.
- **Never restore over production directly.**
- Restore the recorded backup into a **scratch** database first (`docs/BACKUPS.md` §3), compare it with production, and decide what to copy back.
- **Irreversible:** everything written to production after the backup time is lost by a full restore.

## After any rollback

1. Write what was rolled back, when and why into the release record, under a «Rollback» heading.
2. Open a card for the root cause.
3. Run `docs/RELEASE_CHECKLIST.md` section ב's items **against production** (section ב is written for staging).
4. **When the fix ships:**
   - Vercel: **Promote** the fixed deployment by id. After an Instant Rollback nothing goes live on its own.
   - Railway: check that the fixed deployment is the active one and the variables are current.
