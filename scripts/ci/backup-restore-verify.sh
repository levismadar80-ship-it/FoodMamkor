#!/usr/bin/env bash
#
# Module:   backup-restore-verify
# Purpose:  The restore drill from docs/BACKUPS.md §3 as a script: pg_dump a
#           SOURCE database, pg_restore it into an EMPTY target, then assert the
#           restored copy is complete — every table the models define exists in
#           it, every per-table row count matches the source, and (optionally)
#           the BACKUPS.md checks: table count == EXPECTED_TABLES from the CI
#           gate workflow, and named tables are non-empty. Exit non-zero on any
#           assertion failure; exit 0 only when the copy is provably whole.
# Touches:  READS the source database (pg_dump only — it never writes there).
#           WRITES only into the target database (pg_restore), which must be
#           empty. --self-test additionally creates and drops throwaway
#           databases whose names ALL begin with `meh1517_`, on the admin URL
#           it is given (localhost only — it refuses any other host).
# Does NOT: take backups of staging or production, talk to Railway, upload the
#           dump anywhere, or decide the schedule. The workflow that wires this
#           lives in docs/ci/meh-1517-backup-restore-verify.patch.md (Sapir
#           applies it — .github/workflows/** is CC-deny, MEH-671).
#           It is also NOT scripts/restore_from_backup.py, which pulls a dump
#           out of R2 for the MEH-408 DR drill; this one dumps from a live
#           connection and compares, and the two share no code.
# Related:  docs/BACKUPS.md:61-109 (the drill this implements, incl. the three
#           verification queries at :84-98) ·
#           $WORKFLOW_FILE:360 (EXPECTED_TABLES, the live source of truth for
#           the table count) ·
#           backend/app/models/models.py (`__tablename__` + module-level
#           `Table(` — the table list is DERIVED from here at run time, never
#           typed; 38 → 40 → 42 in five weeks is why, MEH-1517 Phase 0 §2).
# History:  MEH-1517 (creation — replaces the manual drill of MEH-1442 chunk 2
#           that sat undone from 22/07).
#
# USAGE
#   backup-restore-verify.sh --source URL --target URL [options]
#   backup-restore-verify.sh --compare-only --source URL --target URL [options]
#   backup-restore-verify.sh --self-test [--admin-url URL]
#
# OPTIONS
#   --source URL               connection string that is READ (pg_dump)
#   --target URL               connection string that is WRITTEN (pg_restore);
#                              must contain zero public base tables
#   --compare-only             skip dump + restore; run only the assertions
#                              against two databases that already exist
#   --models PATH              models file to derive the table list from
#                              (default: backend/app/models/models.py)
#   --expect-table-count N|auto
#                              BACKUPS.md אימות א': the target's base-table
#                              count (excluding alembic_version) must equal N.
#                              `auto` reads EXPECTED_TABLES out of the CI gate
#                              workflow ($WORKFLOW_FILE) at run time.
#   --expect-nonempty t1,t2    BACKUPS.md אימות ב': each named table in the
#                              target must have COUNT(*) > 0
#   --dump PATH                where to write the dump (default: mktemp);
#                              deleted on exit unless --keep-dump
#   --keep-dump                do not delete the dump file on exit
#   --admin-url URL            (--self-test only) a superuser-ish connection to
#                              a LOCALHOST server on which meh1517_* databases
#                              may be created and dropped.
#                              default: postgresql://postgres:postgres@localhost:5432/postgres
#
# EXIT CODES
#   0  every assertion held (or every self-test case behaved)
#   1  an assertion failed — the restored copy is NOT whole
#   2  usage / preflight error (missing tool, unreadable models file, target
#      not empty, non-localhost admin URL in --self-test)
#
# WHY THE TABLE LIST IS DERIVED AND NOT LISTED
#   Three measurements of EXPECTED_TABLES in five weeks gave three values
#   (38 · 40 · 42). A list typed into this file would be stale within weeks and
#   would then PASS a restore that silently lost the newest table — the exact
#   false green a drill exists to catch. Reading models.py at run time means a
#   new table is covered the day it lands. The self-test anchors this: it
#   asserts the derived count equals the live EXPECTED_TABLES, so the two
#   sources of truth cannot drift apart unnoticed either (MEH-1909: a probe
#   must be validated against the repo's REAL shape, not only fixtures).
#
# WHY ROW COUNTS AND NOT JUST TABLE COUNTS
#   BACKUPS.md's checks are "42 tables" and "three tables non-empty". A restore
#   that dropped every row of `favorites` passes both. Per-table row equality
#   between source and restored copy is the assertion that actually says
#   "nothing was lost", and it is cheap: one COUNT(*) per table per side.
#
# WHAT A GREEN HERE DOES AND DOES NOT MEAN (read before trusting one)
#   With a SEEDED CI database as --source, a green proves the DRILL MECHANICS:
#   pg_dump/pg_restore work on this schema, and the comparison would catch a
#   loss. It says NOTHING about whether the real staging/production backup is
#   restorable — that needs a real source (STAGING_DATABASE_URL_READONLY,
#   approved on MEH-1517 14/08, not yet created). The card itself calls a
#   synthetic-only drill "green forever while the real backup is broken";
#   the patch doc keeps that distinction explicit rather than blurring it.
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 2

MODELS_FILE="backend/app/models/models.py"
# rtl-ok: a workflow FILENAME, not a padding class (same false positive dnm-matcher-guard.sh documents)
WORKFLOW_FILE=".github/workflows/pr-checks.yml"
DB_PREFIX="meh1517_"              # every throwaway database name starts with this
DEFAULT_ADMIN_URL="postgresql://postgres:postgres@localhost:5432/postgres"

SOURCE_URL=""; TARGET_URL=""; COMPARE_ONLY=0; EXPECT_TABLE_COUNT=""
EXPECT_NONEMPTY=""; DUMP_FILE=""; KEEP_DUMP=0; SELF_TEST=0; ADMIN_URL="$DEFAULT_ADMIN_URL"

usage() { sed -n '/^# USAGE/,/^# EXIT CODES/p' "$0" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --source)             SOURCE_URL="$2"; shift 2 ;;
    --target)             TARGET_URL="$2"; shift 2 ;;
    --compare-only)       COMPARE_ONLY=1; shift ;;
    --models)             MODELS_FILE="$2"; shift 2 ;;
    --expect-table-count) EXPECT_TABLE_COUNT="$2"; shift 2 ;;
    --expect-nonempty)    EXPECT_NONEMPTY="$2"; shift 2 ;;
    --dump)               DUMP_FILE="$2"; shift 2 ;;
    --keep-dump)          KEEP_DUMP=1; shift ;;
    --self-test)          SELF_TEST=1; shift ;;
    --admin-url)          ADMIN_URL="$2"; shift 2 ;;
    -h|--help)            usage; exit 0 ;;
    *) echo "backup-restore-verify: unknown argument '$1'" >&2; usage >&2; exit 2 ;;
  esac
done

export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-10}"

# ── helpers ──────────────────────────────────────────────────────────────────
die()  { echo "backup-restore-verify: $*" >&2; exit 2; }
note() { printf '  %s\n' "$*"; }

need_tools() {
  local t
  for t in psql pg_dump pg_restore; do
    command -v "$t" >/dev/null 2>&1 || die "'$t' not on PATH (apt install postgresql-client)"
  done
}

# The list of tables the models define. Two forms exist in models.py and BOTH
# are read, because EXPECTED_TABLES=42 while there are only 41 `__tablename__`
# lines — the 42nd is the module-level association table
# `producer_recipe_products = Table("producer_recipe_products", …)` at
# models.py:2073. A derivation that read only `__tablename__` would be off by
# one and would never notice a lost association table.
derive_tables() {
  local f="$1"
  [ -r "$f" ] || die "models file not readable: $f"
  {
    grep -oE '__tablename__[[:space:]]*=[[:space:]]*"[A-Za-z0-9_]+"' "$f" | grep -oE '"[A-Za-z0-9_]+"' || true
    # `name = Table(` on one line, the table name string on the next.
    grep -A1 -E '=[[:space:]]*Table\([[:space:]]*$' "$f" | grep -oE '^[[:space:]]*"[A-Za-z0-9_]+"' || true
  } | tr -d '" \t' | grep . | LC_ALL=C sort -u || true   # strip quotes + indent, keep the newlines
}

# EXPECTED_TABLES as the CI gate workflow states it today. Read, never typed.
live_expected_tables() {
  local v
  v="$(sed -n 's/^[[:space:]]*EXPECTED_TABLES=\([0-9]\+\)[[:space:]]*$/\1/p' "$WORKFLOW_FILE" | head -1)"
  [ -n "$v" ] || die "could not read EXPECTED_TABLES from $WORKFLOW_FILE"
  printf '%s' "$v"
}

q() { # $1=url  $2=sql  → single scalar, no decoration
  psql "$1" -X -v ON_ERROR_STOP=1 -tAc "$2"
}

base_table_count() {
  q "$1" "SELECT COUNT(*) FROM information_schema.tables
          WHERE table_schema='public' AND table_type='BASE TABLE'
            AND table_name <> 'alembic_version';"
}

# A table name reaches the SQL below as a literal. derive_tables() only yields
# [A-Za-z0-9_]+, but --expect-nonempty is operator-supplied, so refuse anything
# else here instead of trusting the caller — one guard for both readers.
_ident() { # $1=candidate → 0 if a plain identifier, else 1 (+ stderr)
  case "$1" in
    *[!A-Za-z0-9_]*|"") echo "refusing non-identifier table name: '$1'" >&2; return 1 ;;
  esac
}

table_exists() { # $1=url $2=table → 0/1
  _ident "$2" || return 1
  [ "$(q "$1" "SELECT COUNT(*) FROM information_schema.tables
               WHERE table_schema='public' AND table_type='BASE TABLE'
                 AND table_name='$2';")" = "1" ]
}

row_count() { # $1=url $2=table → number, or the literal MISSING
  _ident "$2" || return 1 # a rejected name errors out; it must not read as MISSING
  if table_exists "$1" "$2"; then
    q "$1" "SELECT COUNT(*) FROM \"$2\";"
  else
    printf 'MISSING'
  fi
}

# ── the drill ────────────────────────────────────────────────────────────────
run_drill() {
  need_tools
  [ -n "$SOURCE_URL" ] || die "--source is required"
  [ -n "$TARGET_URL" ] || die "--target is required"

  local tables n_tables fail=0 t src tgt
  mapfile -t tables < <(derive_tables "$MODELS_FILE")
  n_tables=${#tables[@]}
  [ "$n_tables" -gt 0 ] || die "derived ZERO tables from $MODELS_FILE — refusing to compare nothing"

  echo "backup-restore-verify (MEH-1517)"
  note "models:  $MODELS_FILE → $n_tables tables"

  if [ "$COMPARE_ONLY" -eq 0 ]; then
    # A restore into a populated target would either fail on conflicts or, worse,
    # leave pre-existing rows that make the counts LOOK right. Refuse.
    local pre
    pre="$(base_table_count "$TARGET_URL")"
    if [ "$pre" != "0" ]; then
      echo "FAIL  target is not empty ($pre base tables) — the drill restores into an EMPTY database only." >&2
      exit 2
    fi

    if [ -z "$DUMP_FILE" ]; then
      DUMP_FILE="$(mktemp --suffix=.dump -t meh1517-drill.XXXXXX)"
    fi
    if [ "$KEEP_DUMP" -eq 0 ]; then
      # shellcheck disable=SC2064  # expand now: DUMP_FILE is final at this point
      trap "rm -f '$DUMP_FILE'" EXIT
    fi

    # docs/BACKUPS.md:48 — custom format, exactly as the manual dump.
    note "dump:    pg_dump -Fc (source is only ever READ)"
    pg_dump "$SOURCE_URL" -Fc -f "$DUMP_FILE"
    [ -s "$DUMP_FILE" ] || die "dump file is empty: $DUMP_FILE"

    # docs/BACKUPS.md:74 — the manual restore, verbatim flags.
    note "restore: pg_restore --no-owner --no-acl → target"
    pg_restore --no-owner --no-acl -d "$TARGET_URL" "$DUMP_FILE"
  else
    note "mode:    --compare-only (no dump, no restore)"
  fi

  # ── assertion 1: every model table exists in the copy, with the same rows ──
  echo
  echo "Per-table row counts (source → restored copy):"
  for t in "${tables[@]}"; do
    src="$(row_count "$SOURCE_URL" "$t")"
    tgt="$(row_count "$TARGET_URL" "$t")"
    if [ "$tgt" = "MISSING" ]; then
      printf '  FAIL  %-36s %8s → %s\n' "$t" "$src" "MISSING in restored copy"
      fail=1
    elif [ "$src" != "$tgt" ]; then
      printf '  FAIL  %-36s %8s → %-8s (row count differs)\n' "$t" "$src" "$tgt"
      fail=1
    else
      printf '  ok    %-36s %8s → %s\n' "$t" "$src" "$tgt"
    fi
  done

  # ── assertion 2: the copy has the same number of base tables as the source ─
  local src_n tgt_n
  src_n="$(base_table_count "$SOURCE_URL")"
  tgt_n="$(base_table_count "$TARGET_URL")"
  echo
  if [ "$src_n" != "$tgt_n" ]; then
    echo "  FAIL  base-table count: source=$src_n restored=$tgt_n"
    fail=1
  else
    note "ok    base-table count: source=$src_n restored=$tgt_n"
  fi

  # ── assertion 3 (BACKUPS.md אימות א'): table count == EXPECTED_TABLES ──────
  if [ -n "$EXPECT_TABLE_COUNT" ]; then
    local want="$EXPECT_TABLE_COUNT"
    [ "$want" = "auto" ] && want="$(live_expected_tables)"
    if [ "$tgt_n" != "$want" ]; then
      echo "  FAIL  restored table count=$tgt_n, expected $want (BACKUPS.md אימות א' — EXPECTED_TABLES in $WORKFLOW_FILE)"
      fail=1
    else
      note "ok    restored table count = $want (EXPECTED_TABLES)"
    fi
  fi

  # ── assertion 4 (BACKUPS.md אימות ב'): named tables are non-empty ──────────
  if [ -n "$EXPECT_NONEMPTY" ]; then
    while IFS= read -r t; do
      t="${t// /}"; [ -n "$t" ] || continue
      tgt="$(row_count "$TARGET_URL" "$t")"
      if [ "$tgt" = "MISSING" ] || [ "$tgt" = "0" ]; then
        echo "  FAIL  $t must be non-empty in the restored copy (got: $tgt) — an empty backup is the MEH-1349 data-drift shape"
        fail=1
      else
        note "ok    $t non-empty ($tgt rows)"
      fi
    done < <(printf '%s\n' "$EXPECT_NONEMPTY" | tr ',' '\n')   # the trailing \n is load-bearing: `read` drops an unterminated last item
  fi

  echo
  if [ "$fail" -ne 0 ]; then
    echo "backup-restore-verify: FAIL — the restored copy is NOT a whole copy of the source."
    exit 1
  fi
  echo "backup-restore-verify: OK — $n_tables model tables present, every row count matches."
  exit 0
}

# ── self-test ────────────────────────────────────────────────────────────────
# Repo precedent: scripts/checks/dnm-matcher-guard.sh --self-test. A drill that
# has never been seen going red is a green light of unknown wiring (MEH-1619).
# Every case below either anchors on a REAL repo file or breaks the restored
# copy in one specific way and requires the script to say so.
self_test() {
  need_tools

  # Safety: the only server this will ever create/drop databases on is local.
  case "$ADMIN_URL" in
    *@localhost[:/]*|*@127.0.0.1[:/]*) ;;
    *) die "--self-test refuses a non-localhost admin URL ($ADMIN_URL)" ;;
  esac

  local pass=0 total=0 rc out
  # GLOBALS, not locals: the EXIT trap below runs drop_dbs AFTER this function
  # has returned, and under `set -u` an unbound $src_db there kills the trap
  # with exit 1 — a `|| true` does not cover -u — leaving the databases behind
  # and turning an 11/11 into a red exit. Measured 03/09 with BASH_XTRACEFD.
  SELFTEST_SRC_DB="${DB_PREFIX}selftest_src"; SELFTEST_TGT_DB="${DB_PREFIX}selftest_tgt"
  local src_db="$SELFTEST_SRC_DB" tgt_db="$SELFTEST_TGT_DB"
  local base="${ADMIN_URL%/*}"            # strip the trailing /dbname
  local src_url="$base/$src_db" tgt_url="$base/$tgt_db"

  check() { # $1=label $2=expected-exit $3=actual-exit [$4=required substring of output]
    total=$((total+1))
    if [ "$3" -eq "$2" ] && { [ -z "${4:-}" ] || printf '%s' "$out" | grep -qF "$4"; }; then
      echo "  ok   $1 (exit $3)"; pass=$((pass+1))
    else
      echo "  FAIL $1 (exit $3, wanted $2${4:+, output must contain: $4})"
      printf '%s\n' "$out" | sed 's/^/       | /' | tail -25
    fi
  }
  admin() { psql "$ADMIN_URL" -X -v ON_ERROR_STOP=1 -q -c "$1"; }
  drop_dbs() {   # reads the globals on purpose — see the note above
    admin "DROP DATABASE IF EXISTS \"$SELFTEST_SRC_DB\";" >/dev/null
    admin "DROP DATABASE IF EXISTS \"$SELFTEST_TGT_DB\";" >/dev/null
  }
  fresh_dbs() { drop_dbs; admin "CREATE DATABASE \"$src_db\";" >/dev/null; admin "CREATE DATABASE \"$tgt_db\";" >/dev/null; }
  sql_on() { psql "$1" -X -v ON_ERROR_STOP=1 -q -c "$2"; }
  # Put one table of the target back to exactly the source's content.
  refresh_table() { pg_dump "$src_url" -Fc -t "$1" | pg_restore --no-owner --no-acl --clean --if-exists -d "$tgt_url"; }

  echo "backup-restore-verify --self-test"
  note "admin: $ADMIN_URL   throwaway databases: $src_db, $tgt_db"
  trap 'drop_dbs 2>/dev/null || true' EXIT

  # (a) REAL-REPO ANCHOR — the derivation must recognise this repo's models.py,
  #     not just a fixture (MEH-1909). It must also agree with the live
  #     EXPECTED_TABLES; if those two ever disagree, one of them is stale and
  #     a drill built on the stale one would pass a lossy restore.
  local derived n_derived live
  derived="$(derive_tables "$MODELS_FILE")"
  n_derived="$(printf '%s\n' "$derived" | grep -c .)"
  live="$(live_expected_tables)"
  out="derived=$n_derived live EXPECTED_TABLES=$live"
  if [ "$n_derived" -ge 30 ] && printf '%s\n' "$derived" | grep -qx producers && printf '%s\n' "$derived" | grep -qx users \
     && printf '%s\n' "$derived" | grep -qx producer_recipe_products; then rc=0; else rc=1; fi
  check "real models.py: >=30 tables derived, incl. producers/users and the Table() form ($out)" 0 "$rc"
  [ "$n_derived" = "$live" ] && rc=0 || rc=1
  check "real anchor: derived table count ($n_derived) == live EXPECTED_TABLES ($live)" 0 "$rc"

  # Build a synthetic SOURCE carrying every derived table, seeded so that row
  # counts are distinguishable (table i gets 1..5 rows), plus alembic_version.
  fresh_dbs
  local i=0 t sql=""
  while IFS= read -r t; do
    sql+="CREATE TABLE \"$t\" (id serial PRIMARY KEY, note text);"
    sql+="INSERT INTO \"$t\" (note) SELECT 'row' FROM generate_series(1, $((i % 5 + 1)));"
    i=$((i+1))
  done <<< "$derived"
  sql+="CREATE TABLE alembic_version (version_num varchar(32) PRIMARY KEY);"
  sql+="INSERT INTO alembic_version VALUES ('selftest');"
  sql_on "$src_url" "$sql"

  # (b) GREEN — a faithful dump → restore → compare must pass, with both
  #     BACKUPS.md checks on (table count = the count the copy actually has;
  #     the three named tables non-empty).
  set +e
  out="$(bash "$0" --source "$src_url" --target "$tgt_url" \
          --expect-table-count "$n_derived" --expect-nonempty producers,users,producer_reviews 2>&1)"; rc=$?
  set -e
  check "faithful restore is GREEN" 0 "$rc" "every row count matches"

  # (c) RED — refuse to restore into a target that is not empty (the target now
  #     holds the restored copy from (b)).
  set +e
  out="$(bash "$0" --source "$src_url" --target "$tgt_url" 2>&1)"; rc=$?
  set -e
  check "restore into a NON-EMPTY target is refused" 2 "$rc" "target is not empty"

  # (d) RED — a table dropped from the restored copy. The caller's own
  #     construction: this is the case the drill exists for.
  sql_on "$tgt_url" 'DROP TABLE "favorites";'
  set +e
  out="$(bash "$0" --compare-only --source "$src_url" --target "$tgt_url" 2>&1)"; rc=$?
  set -e
  check "a table DROPPED from the copy is RED and named" 1 "$rc" "favorites"
  printf '%s' "$out" | grep -q "MISSING in restored copy" && rc=0 || rc=1
  check "...and the failure says MISSING, not 'row count differs'" 0 "$rc"
  refresh_table favorites

  # (e) RED — rows lost from a table that still exists. Table count is still
  #     right, BACKUPS.md's checks would still pass; only row equality sees it.
  sql_on "$tgt_url" 'DELETE FROM "producer_page_views" WHERE id = 1;'
  set +e
  out="$(bash "$0" --compare-only --source "$src_url" --target "$tgt_url" 2>&1)"; rc=$?
  set -e
  check "rows LOST from an existing table is RED (row count differs)" 1 "$rc" "producer_page_views"
  refresh_table producer_page_views

  set +e
  out="$(bash "$0" --compare-only --source "$src_url" --target "$tgt_url" 2>&1)"; rc=$?
  set -e
  check "control: copy made faithful again is GREEN" 0 "$rc" "every row count matches"

  # (f) RED — BACKUPS.md אימות א' with a wrong expectation.
  set +e
  out="$(bash "$0" --compare-only --source "$src_url" --target "$tgt_url" --expect-table-count 999 2>&1)"; rc=$?
  set -e
  check "wrong --expect-table-count is RED" 1 "$rc" "expected 999"

  # (g) RED — BACKUPS.md אימות ב' on an emptied table. Emptied on BOTH sides so
  #     the row-equality assertion stays green and ONLY the non-empty check can
  #     be the cause of the red (a red with two causes proves as little as a
  #     green with two).
  sql_on "$tgt_url" 'DELETE FROM "users";'
  sql_on "$src_url" 'DELETE FROM "users";'
  set +e
  out="$(bash "$0" --compare-only --source "$src_url" --target "$tgt_url" --expect-nonempty users 2>&1)"; rc=$?
  set -e
  check "--expect-nonempty on an EMPTY table is RED" 1 "$rc" "users must be non-empty"

  # (h) RED — a models file that yields no tables must not compare nothing.
  local empty_models; empty_models="$(mktemp)"; echo "# no tables here" > "$empty_models"
  set +e
  out="$(bash "$0" --compare-only --source "$src_url" --target "$tgt_url" --models "$empty_models" 2>&1)"; rc=$?
  set -e
  rm -f "$empty_models"
  check "a models file deriving ZERO tables is a preflight error, not a pass" 2 "$rc" "derived ZERO tables"

  echo "  $pass/$total self-test cases behaved correctly"
  [ "$pass" -eq "$total" ]
}

if [ "$SELF_TEST" -eq 1 ]; then
  self_test || exit 1
  exit 0
fi
run_drill
