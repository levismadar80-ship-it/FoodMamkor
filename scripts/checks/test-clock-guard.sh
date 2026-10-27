#!/usr/bin/env bash
#
# test-clock-guard.sh — warn-only guard against a backend test that reads the
# RUNNER's calendar date where the code reads Israel's (MEH-2382).
#
# WHY THIS EXISTS
#   The backend measures days in Asia/Jerusalem — `israel_today()`,
#   `business_days_waiting`, `astimezone(ISRAEL_TZ)` in backend/app/utils/clock.py.
#   A test that seeds a date from `date.today()` gets the CI runner's UTC date,
#   and Israel is already on tomorrow from 21:00/22:00 UTC. The seed is then one
#   day off the value the code compares against, so the test is green at most
#   hours of the day and red at one — on any PR, with no code change.
#
#   Three shipped instances of the class (MEH-1918, MEH-1926, MEH-1983) and two
#   red-with-no-diff incidents (MEH-2290 hard-coded dates, MEH-2380 a UTC seed
#   across the DST switch) are why this is a guard and not a review note. The
#   MEH-2382 sweep replaced 29 `date.today()` seeds in nine test files; this
#   guard keeps the count at zero.
#
# THE RULE
#   `date.today()` (or `datetime.date.today()`) in tests/**/*.py, outside a
#   comment. Prose mentions in docstrings are written with backticks in this
#   repo (`date.today()`, `< date.today()`): a backtick BEFORE the call on the
#   same line marks it as prose. A backtick AFTER the call (a real call with a
#   trailing backticked comment) does not — that line is still reported. The
#   replacement is `israel_today()` from app.utils.clock, or
#   `israel_days_ago(N)` from tests/conftest.py for a datetime — see
#   .claude/rules/testing.md § "Clock-dependent tests seed from the Israel
#   clock".
#
# WARN-ONLY, ON PURPOSE — AND HOW THAT IS ENCODED
#   This exits 0 always. It prints the token WARNING, which run-all.sh surfaces
#   inline and summarises as WARN without changing the run's exit code (see its
#   "WARN SURFACING (MEH-1715)" block). Born warn-only for the reason
#   israel-clock-guard.sh records (MEH-1868): a gate that arrives already
#   blocking gets routed around. It is born with ZERO standing findings, so a
#   WARNING here is always a new one. Promotion to blocking is a separate step.
#
# ESCAPE HATCH
#   `guard-ok: <reason>` in a comment on the offending line or either adjacent
#   line (+/-1) — the same window as israel-clock-guard.sh. A reason is
#   required; the bare marker does not suppress.
#
# USAGE
#   bash scripts/checks/test-clock-guard.sh            # always exit 0 (warn-only)
#   bash scripts/checks/test-clock-guard.sh <dir>      # scan another tree
#   bash scripts/checks/test-clock-guard.sh --self-test
#       Writes a fixture file with one line per classifier branch (bare call,
#       backtick after a real call, backticked docstring mention, guard-ok
#       cover, `#` comment, datetime.date.today()), runs THIS script on it and
#       asserts exactly the expected lines are reported. Exit 1 on a miss —
#       the only mode in which this script can fail. run-all.sh never passes
#       arguments, so CI always runs the warn-only scan.
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# `|| exit 1` is load-bearing (SC2164): an unguarded cd that fails leaves the
# guard grepping the wrong tree, matching nothing, and reporting clean.
cd "$REPO_ROOT" || exit 1

SCAN_DIR="${1:-tests}"

findings=0

suppressed() {
  local file="$1" line="$2" from to
  from=$(( line > 1 ? line - 1 : 1 ))
  to=$(( line + 1 ))
  sed -n "${from},${to}p" "$file" 2>/dev/null | grep -q 'guard-ok:'
}

is_prose_line() {
  # The match sits after a `#` on the line, or after a backtick on the line —
  # a backtick is never Python code, so what follows it is a docstring
  # mention. A backtick or `#` AFTER the call does not make the call prose
  # (review on #3640: `y = date.today()  # see \`israel_today\`` is real code).
  local text="$1"
  case "$text" in
    *'#'*'date.today()'*) return 0 ;;
    *'`'*'date.today()'*) return 0 ;;
  esac
  return 1
}

self_test() {
  local tmp expected got
  tmp="$(mktemp -d)"
  cat > "$tmp/test_probe.py" <<'FIXTURE'
import datetime
from datetime import date
today = date.today()
x = 1
"""Docstring: the old seed was `date.today()`, now israel_today()."""
y = date.today()  # the OLD assertion skipped this line: see `israel_today`
z = 1
# guard-ok: fixture pins the runner's own day on purpose
w = date.today()
# date.today() in a comment is prose
v = datetime.date.today()
FIXTURE
  # Lines 3 (bare), 6 (real call, backtick AFTER it) and 11 (datetime.date.today()).
  # Lines 5 (backtick BEFORE), 9 (guard-ok one line above) and 10 (comment) must
  # stay silent.
  expected="3 6 11"
  got="$(bash "${BASH_SOURCE[0]}" "$tmp" | sed -n 's/^  WARNING .*:\([0-9]*\)$/\1/p' | tr '\n' ' ' | sed 's/ $//')"
  rm -rf "$tmp"
  if [ "$got" = "$expected" ]; then
    echo "test-clock-guard self-test PASS — reported lines: $got"
    return 0
  fi
  echo "test-clock-guard self-test FAIL — expected lines [$expected], got [$got]"
  return 1
}

if [ "${1:-}" = "--self-test" ]; then
  self_test
  exit $?
fi

report() {
  echo "  WARNING $1:$2"
  echo "      $3"
  findings=$(( findings + 1 ))
}

echo "test-clock-guard (MEH-2382) — repo root: $REPO_ROOT · scanning: $SCAN_DIR"
echo
echo "Rule: no date.today() in a backend test — that is the runner's UTC date, not Israel's"

# `(?<![\w.])` — not preceded by a word char or a dot (so `datetime.date.today()`
# is matched by its own alternative and a hypothetical `my_date.today()` is not).
while IFS=: read -r file line text; do
  [ -n "$file" ] || continue
  is_prose_line "$text" && continue
  suppressed "$file" "$line" && continue
  report "$file" "$line" 'date.today() is the CI runner'"'"'s UTC date; the code compares against israel_today() (backend/app/utils/clock.py), which is already tomorrow from 21:00/22:00 UTC. Seed with israel_today() +/- timedelta(days=N), or israel_days_ago(N) from tests/conftest.py for a datetime.'
done < <(grep -rnP '(?<![\w.])date\.today\(\)|\bdatetime\.date\.today\(\)' "$SCAN_DIR" \
           --include='*.py' --exclude-dir=__pycache__ 2>/dev/null)

echo
if [ "$findings" -gt 0 ]; then
  echo "test-clock-guard WARNED — $findings finding(s). Not blocking (warn-only, MEH-2382)."
  echo "Fix by seeding from israel_today() / israel_days_ago(), or annotate with 'guard-ok: <reason>' within +/-1 line."
  exit 0
fi
echo "test-clock-guard OK — no runner-date seeds in $SCAN_DIR."
exit 0
