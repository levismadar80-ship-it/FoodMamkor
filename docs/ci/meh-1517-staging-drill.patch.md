# MEH-1517 — the `staging-drill` job (real staging database, read-only)

> ✅ **Applied 10/11/2026** under Sapir's authorisation, extended to this ONE file
> (recorded on MEH-1915), through the GitHub API.
>
> **What was applied is not the staged copy.** The staged copy
> (`docs/ci/meh-1517-staging-drill/backup-restore-verify.yml`, now deleted) predates
> Sapir's conditions. The applied file adds three of them:
> - `::add-mask::` for the derived URL parts;
> - a fixed `$RUNNER_TEMP` dump path, deleted by an `if: always()` step;
> - a stricter staging guard, from two independent reviews of #4299. In a `case`
>   pattern, `*` also matches `@`, `?`, `,` and `/`. The reviews built URLs that passed
>   the first guard while libpq connected elsewhere: a second `@`, `?host=`/`?user=`
>   parameters, and a `/` in the password (libpq then reads the user as the host).
>   The guard now refuses all of those, a `,`, a newline, and any query or fragment
>   except `?sslmode=require`. It also pins the database to `railway`. Each bypass was
>   tested old vs new with `bash -e` on dummy URLs: exit 0 before, exit 1 after.
> - a read-only check that also counts the public tables and sequences the role can
>   write to. A refused `CREATE TABLE` alone proves no DDL, not SELECT-only.
>
> The diff below is regenerated from the applied file (staging → branch). It is
> the record of what landed, not an earlier approval.

## Why

The `mechanics` job proves the drill tooling on a seeded CI database. It does not
prove the **real** staging backup restores. Since 10/11/2026 that is now possible:

- Sapir created the role `ci_backup_ro`: LOGIN, SELECT on `public` tables and
  sequences, and default privileges for future tables.
- She stored it as the secret `STAGING_DATABASE_URL_READONLY`.
- Check 1 passed: `f|f|f|f`.
- Check 2 passed: `CREATE TABLE` was refused with `permission denied`.

## What the job does (staging only; production is never read)

1. **Secret present, and it is staging.** It fails, never skips, when the secret
   is missing. It also refuses any URL that is not `ci_backup_ro` on the staging
   Postgres proxy (`kodama.proxy.rlwy.net:13219`), so a wrong secret cannot point
   it at production.
2. **PostgreSQL 18 client**, from apt.postgresql.org. Staging runs
   `postgres-ssl:18`, and `pg_dump` must not be older than the server. The
   runner ships 16.
3. **Read-only check.** This is check 2 of the MEH-1517 secret spec, run again
   on every run, plus check 1 seen from the role's own side.
   - If the role can `CREATE TABLE`, the job removes the probe table, fails, and
     names the cleanup.
   - A refusal that is *not* `permission denied` also fails: it proves nothing.
4. **An empty `postgres:18` service container** as the restore target.
5. **`scripts/ci/backup-restore-verify.sh`**, the same script and assertions as
   `mechanics`:
   - the table count equals `EXPECTED_TABLES`, read at run time;
   - `producers`, `users` and `producer_reviews` are non-empty;
   - every model table is present, with equal row counts.

   The dump is written to `$RUNNER_TEMP/staging-drill.dump`, deleted by the script on exit and by an `if: always()` step, and never uploaded.

**Known race.** Row counts are compared with the live source after the restore.
A write to staging in between shows as «row count differs» on one busy table.
Re-run first. A missing table or a large difference is never this race.

## Verification (CC, 10/11)

- `git apply --check` of the diff below against `origin/staging` is clean.
- The YAML parses. Jobs: `mechanics`, `staging-drill`.
- The script needs only the PostgreSQL client tools: no Python, and no
  extensions in any Alembic revision.
- **Not verifiable before the paste:** the first real run. It is the acceptance
  check on MEH-1517.

## The diff

```diff
--- a/.github/workflows/backup-restore-verify.yml
+++ b/.github/workflows/backup-restore-verify.yml
@@ -6,11 +6,12 @@
 # WHAT A GREEN HERE MEANS — read before trusting one:
 #   `mechanics` restores a SEEDED, CI-LOCAL database. A green proves the drill tooling and
 #   the assertions work on this schema and would catch a lossy restore. It does NOT prove
-#   the real staging/production backup is restorable — that needs a second `staging-drill`
-#   job reading the real database through STAGING_DATABASE_URL_READONLY (approved on
-#   MEH-1517, 14/08; the secret does not exist yet). Its YAML is on MEH-1517, and it is
-#   written to FAIL rather than skip when the secret is missing: a drill that skip-greens
-#   would report the card delivered while verifying nothing.
+#   the real staging/production backup is restorable — that is the second job,
+#   `staging-drill`, which reads the REAL staging database through
+#   STAGING_DATABASE_URL_READONLY (role ci_backup_ro, SELECT-only; created by Sapir
+#   10/11/2026, both read-only checks passed). It FAILS rather than skips when the
+#   secret is missing: a drill that skip-greens would report the card delivered while
+#   verifying nothing. Production is never read by this workflow.
 #
 # The logic lives in scripts/ci/backup-restore-verify.sh; this file only calls it. The
 # script's --self-test runs FIRST as a control: the drill must be seen going red on the
@@ -108,3 +109,152 @@
             --source "$SOURCE_URL" --target "$TARGET_URL" \
             --expect-table-count auto \
             --expect-nonempty producers,users,producer_reviews
+
+  # ─────────────────────────────────────────────────────────────────────────
+  # MEH-1517 — the real drill: dump the REAL staging database (read-only role),
+  # restore it into an empty PostgreSQL 18 service container, verify with the same
+  # script and the same assertions as `mechanics`. Staging only, never production.
+  #
+  # Check 2 of the MEH-1517 secret spec runs FIRST, every time: the role must be
+  # refused CREATE TABLE. If it is not refused, the job fails loudly and names the
+  # cleanup; the drill never runs on a role that can write.
+  #
+  # Known race (read before acting on a red): the script compares each table's row
+  # count in the restored copy with the LIVE source after the restore. A write to
+  # staging between the dump and that count (an E2E run, a QA session) shows as
+  # "row count differs" on that one busy table. Re-run before treating it as a
+  # lossy backup; a MISSING table or a large difference is never this race.
+  # ─────────────────────────────────────────────────────────────────────────
+  staging-drill:
+    name: Restore drill — real staging database (read-only)
+    runs-on: ubuntu-latest
+    timeout-minutes: 30
+
+    services:
+      postgres:
+        # The same major version as staging (postgres-ssl:18): a dump from 18
+        # restores into 18.
+        image: postgres:18
+        env:
+          POSTGRES_USER: postgres
+          POSTGRES_PASSWORD: postgres
+          POSTGRES_DB: postgres
+        ports:
+          - 5432:5432
+        options: >-
+          --health-cmd pg_isready
+          --health-interval 10s
+          --health-timeout 5s
+          --health-retries 5
+
+    env:
+      TARGET_URL: postgresql://postgres:postgres@localhost:5432/mehamakor_drill_target
+
+    steps:
+      - uses: actions/checkout@v7
+
+      # Fail, never skip. Also refuse anything that is not the staging Postgres
+      # proxy, so a wrong secret can never point this job at production.
+      - name: Secret present, and it is staging
+        env:
+          SOURCE_URL: ${{ secrets.STAGING_DATABASE_URL_READONLY }}
+        run: |
+          if [ -z "$SOURCE_URL" ]; then
+            echo "::error::STAGING_DATABASE_URL_READONLY is not set. The real drill cannot run (MEH-1517)."
+            exit 1
+          fi
+          # GitHub masks the whole secret; mask the parts a tool could print on
+          # their own too (the password, and host:port/db). Masks apply to
+          # every later step of this job.
+          MASK_PW="${SOURCE_URL#*://*:}"; MASK_PW="${MASK_PW%%@*}"
+          MASK_TAIL="${SOURCE_URL#*@}"
+          echo "::add-mask::$MASK_PW"
+          echo "::add-mask::$MASK_TAIL"
+          # In a case pattern `*` also matches `@`, `?`, `,` and `/`, so the shape
+          # check alone would pass a URL whose real host sits before a second `@`,
+          # whose ?host=/?user= parameters override it, or whose password holds a
+          # `/` (libpq then reads the user as the host). Refuse those first, and a
+          # newline. The one suffix allowed is ?sslmode=require (reviews of #4299).
+          REFUSE="::error::The secret is not the ci_backup_ro role on the staging Postgres proxy. Refusing to run."
+          case "$SOURCE_URL" in
+            *@*@*|*,*|*://*/*@*|*$'\n'*) echo "$REFUSE"; exit 1 ;;
+          esac
+          BASE_URL="${SOURCE_URL%\?sslmode=require}"
+          case "$BASE_URL" in
+            *\?*|*\&*|*'#'*) echo "$REFUSE"; exit 1 ;;
+          esac
+          case "$BASE_URL" in
+            postgresql://ci_backup_ro:*@kodama.proxy.rlwy.net:13219/railway) echo "source: ci_backup_ro @ the staging Postgres proxy" ;;
+            *) echo "$REFUSE"; exit 1 ;;
+          esac
+
+      # pg_dump must not be older than the server (18); the runner ships 16.
+      - name: PostgreSQL 18 client
+        run: |
+          sudo install -d /usr/share/postgresql-common/pgdg
+          sudo curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
+          . /etc/os-release
+          echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
+          sudo apt-get update -qq
+          sudo apt-get install -y -qq postgresql-client-18
+          echo "/usr/lib/postgresql/18/bin" >> "$GITHUB_PATH"
+
+      # MEH-1517 secret spec, check 2 (and check 1 again, from the role's side).
+      - name: Check — the role is read-only
+        env:
+          SOURCE_URL: ${{ secrets.STAGING_DATABASE_URL_READONLY }}
+        run: |
+          pg_dump --version
+          ATTRS=$(psql "$SOURCE_URL" -tAc "SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication FROM pg_roles WHERE rolname = current_user")
+          echo "role attributes (expect f|f|f|f): $ATTRS"
+          if [ "$ATTRS" != "f|f|f|f" ]; then
+            echo "::error::ci_backup_ro has an elevated attribute ($ATTRS). Stop and drop the role (MEH-1517)."
+            exit 1
+          fi
+          if OUT=$(psql "$SOURCE_URL" -v ON_ERROR_STOP=1 -c "CREATE TABLE _perm_probe(x int);" 2>&1); then
+            psql "$SOURCE_URL" -q -c "DROP TABLE IF EXISTS _perm_probe;" || true
+            echo "::error::ci_backup_ro could CREATE TABLE, so it is NOT read-only. Drop the role now with the cleanup paste on MEH-1517 (Railway query box)."
+            exit 1
+          fi
+          case "$OUT" in
+            *"permission denied"*) echo "CREATE TABLE as ci_backup_ro: refused (permission denied). OK." ;;
+            *) echo "::error::CREATE TABLE failed, but not with 'permission denied'. This proves nothing about read-only:"; echo "$OUT" | head -3; exit 1 ;;
+          esac
+          # A refused CREATE TABLE proves no DDL, not SELECT-only: on PostgreSQL 15+
+          # a non-owner cannot create in `public` anyway. So also count the tables
+          # and sequences this role could write to. It must be zero.
+          WRITABLE=$(psql "$SOURCE_URL" -tAc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND ((c.relkind IN ('r','p') AND has_table_privilege(current_user, c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE')) OR (c.relkind = 'S' AND has_sequence_privilege(current_user, c.oid, 'UPDATE')))")
+          echo "public tables and sequences ci_backup_ro can write to (expect 0): $WRITABLE"
+          if [ "$WRITABLE" != "0" ]; then
+            echo "::error::ci_backup_ro can write to $WRITABLE public tables or sequences, so it is NOT read-only. Revoke the grants (MEH-1517)."
+            exit 1
+          fi
+
+      - name: Create the EMPTY restore target
+        env:
+          PGPASSWORD: postgres
+        run: createdb -h localhost -U postgres mehamakor_drill_target
+
+      # docs/BACKUPS.md §3 against the real database. The dump holds real data:
+      # it is written to a fixed path under RUNNER_TEMP, deleted by the script on
+      # exit AND by the always() step below, and never uploaded (no
+      # upload-artifact step exists in this job).
+      - name: Dump staging → restore → verify (docs/BACKUPS.md §3)
+        env:
+          SOURCE_URL: ${{ secrets.STAGING_DATABASE_URL_READONLY }}
+        run: |
+          bash scripts/ci/backup-restore-verify.sh \
+            --source "$SOURCE_URL" --target "$TARGET_URL" \
+            --dump "$RUNNER_TEMP/staging-drill.dump" \
+            --expect-table-count auto \
+            --expect-nonempty producers,users,producer_reviews
+
+      - name: Delete the backup file (always)
+        if: always()
+        run: |
+          rm -f "$RUNNER_TEMP/staging-drill.dump"
+          if [ -e "$RUNNER_TEMP/staging-drill.dump" ]; then
+            echo "::error::the dump file still exists"
+            exit 1
+          fi
+          echo "backup file deleted (or never written)"
```
