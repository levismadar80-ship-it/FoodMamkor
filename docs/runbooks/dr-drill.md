# Runbook — תרגיל שחזור גיבוי (MEH-408 Phase 4)

> **Audience:** Sapir, at her own terminal, with R2 credentials.
> **Moved here from `docs/MANUAL_TESTING.md` on 2026-11-07 (MEH-2796).** Content unchanged. An automated replacement is tracked in MEH-1517.

Disaster-recovery drill — proves that a backup file in R2 actually
restores into a working Postgres DB. "You have a backup" is not true
until you have demonstrated the restore. Smadar runs this once;
record the outcome in HANDOFF.md.

Prereqs:
- PostgreSQL 18 client on PATH (`/c/Program Files/PostgreSQL/18/bin/`)
- `python` + `boto3` available locally (or run via the cron Docker image)
- R2 credentials in shell env (sourced from `.env.staging`)

Drill steps:

- [ ] **1. Find latest R2 backup.**
      `aws s3 ls s3://mehamakor-backups/ --endpoint-url $R2_ENDPOINT | tail -1`
      תוצאה מצופה: filename with today's or yesterday's date (cron just ran).

- [ ] **2. Create empty test DB locally.**
      `createdb mehamakor_dr_test`
      תוצאה מצופה: command exits 0, no errors.

- [ ] **3. Restore via the script.**
      `python scripts/restore_from_backup.py --latest postgresql://localhost/mehamakor_dr_test`
      תוצאה מצופה: exit 0, log lines show download + pg_restore + row-count table.

- [ ] **4. Verify row counts roughly match production.**
      Manually compare the script's row-count summary to production
      (Railway dashboard → Postgres → Data, or
      `psql $DATABASE_URL -tAc "SELECT count(*) FROM producers;"` from
      Smadar's terminal against the public proxy URL).
      תוצאה מצופה: counts match within ±1% (drift OK if backup is hours old).

- [ ] **5. Drop the test DB.**
      `dropdb mehamakor_dr_test`
      תוצאה מצופה: clean up the local artifact.

- [ ] **6. Log the result.**
      Add a one-liner to HANDOFF.md under MEH-408 Phase 4:
      `DR drill executed YYYY-MM-DD — restored mehamakor_<env>_<timestamp>.dump → row counts match — Phase 4 closed.`
