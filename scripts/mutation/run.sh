#!/usr/bin/env bash
#
# Module:   run.sh (mutation)
# Purpose:  Run mutmut over the money-and-permissions set and print a per-file
#           score plus every NEW surviving mutant (one not explained in
#           backend/mutation-survivors.txt). Exit 1 when there is a new one.
# Touches:  backend/mutants/ (mutmut's scratch copy, gitignored) and the local
#           test database (TEST_DATABASE_URL). Nothing else.
# Does NOT: choose the files or the tests — [tool.mutmut] in
#           backend/pyproject.toml does. Does not run in CI (too slow for a
#           PR job); the weekly repo-health scan and PR threads run it.
# Related:  scripts/mutation/report.py (the scoring), docs/research/mutation-testing.md,
#           .claude/rules/testing.md «Mutation testing».
# History:  MEH-3295 (creation; MEH-558 was the auth.py-only pilot).
#
# USAGE
#   bash scripts/mutation/run.sh            # whole set (~1 h on 4 cores)
#   bash scripts/mutation/run.sh --report   # re-read the last run, no re-run
#
# ONE CHILD ON PURPOSE: mutmut forks each mutant from one pytest process that
# has already imported tests/conftest.py, so every child shares one database
# and the per-test TRUNCATE of one child wipes another's rows. Four children
# produced kills that were really cross-talk. Serial is the honest setting.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT/backend" || exit 2

if [[ "${1:-}" != "--report" ]]; then
  rm -rf mutants
  # Its own database: the suite drops and recreates the schema at session
  # start, so a pytest run in another terminal on mehamakor_test would wipe
  # tables under a running mutant (seen 15/11 — "relation producers does not
  # exist" mid-run). Create it once: createdb mehamakor_mutation.
  export TEST_DATABASE_URL="${MUTATION_DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/mehamakor_mutation}"
  # Repo root on the path: several test files import `tests.conftest`.
  PYTHONPATH="$ROOT${PYTHONPATH:+:$PYTHONPATH}" uv run mutmut run --max-children 1 \
    > "$ROOT/backend/mutants-run.log" 2>&1
  status=$?
  if [[ $status -ne 0 ]]; then
    echo "MUTATION RUN FAILED (mutmut exit $status) — the scores below do not exist."
    tail -30 "$ROOT/backend/mutants-run.log"
    exit 2
  fi
fi

uv run python -I "$ROOT/scripts/mutation/report.py" \
  --mutants "$ROOT/backend/mutants" \
  --survivors "$ROOT/backend/mutation-survivors.txt"
