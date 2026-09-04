#!/usr/bin/env bash
#
# israel-clock-guard.sh — warn-only guard against a NEW private
# "what day is it in Israel" implementation on the client (MEH-1988).
#
# WHY THIS EXISTS
#   MEH-1983's defect was not that three files disagreed about the clock. It is
#   that `components/OfferBadge.jsx` held the CORRECT knowledge — in the
#   docstring of a PRIVATE function — while two other files did the exact thing
#   that docstring forbids. Knowledge that lives in the repo and is not
#   reachable from where it is needed is the quiet form of "two owners for one
#   fact": nothing errors, nothing warns, and the wrong copy wins by default.
#
#   The concrete failure was real: the two vacation-date pickers computed
#   "today" from UTC while the backend validates against `israel_today()`
#   (backend/app/utils/clock.py). Israel is UTC+2/+3, so for the first two to
#   three hours of an Israel day the UI offered the owner a date the server then
#   rejected. The fix extracted `israelToday` into lib/israel-date.js.
#
#   This guard exists so the NEXT file does not re-derive it privately.
#
# THE TWO RULES
#   1. `new Date().toISOString().slice(0, 10)` — the UTC-date form. This is the
#      literal shape of the MEH-1983 bug.
#   2. A local `Intl.DateTimeFormat` carrying `timeZone: "Asia/Jerusalem"`
#      anywhere outside the SANCTIONED_OWNERS list below — i.e. a second private
#      implementation of a primitive the repo already owns somewhere.
#
#   Scoped by FILE, not by directory. "Anything under frontend/lib/" was the
#   first shape tried and it is wrong in both directions: it blesses a future
#   lib file nobody reviewed, and it condemns components/OpeningHours.jsx, which
#   MEH-1983 records as a legitimate pre-existing owner outside lib/. Measured
#   while writing this guard — the directory form reported OpeningHours.jsx as a
#   violation and let frontend/lib/hours.js through, and hours.js is exactly the
#   unrecorded site this guard should surface.
#
# WARN-ONLY, ON PURPOSE — AND HOW THAT IS ENCODED
#   This exits 0 always. It prints the token WARNING, which run-all.sh surfaces
#   inline and summarises as WARN without changing the run's exit code (see its
#   "WARN SURFACING (MEH-1715)" block). It does NOT print the bare string
#   `mode: WARN-ONLY` on clean runs, because the dispatcher deliberately does
#   not match that token and a guard that printed it unconditionally would be
#   invisible either way.
#
#   Born warn-only because MEH-1868 measured what happens otherwise: a gate that
#   arrives already blocking gets routed around, and four such gates in this
#   repo became four non-gates. Promotion to blocking is a separate, deliberate
#   step once the tree is known clean and has stayed clean.
#
# WHAT IT DOES NOT DO
#   It cannot tell a *correct* Israel-tz implementation from a wrong one, and it
#   does not try. It checks that a second one is not being written. A file that
#   imports from lib/israel-date.js and then mangles the string is invisible
#   here — that is a review question, not a grep question.
#
# ESCAPE HATCH
#   `guard-ok: <reason>` in a comment on the offending line or either adjacent
#   line (+/-1) — the same window as map-attribution-guard.sh and the RTL hook's
#   `rtl-ok` marker. A reason is required; the bare marker does not suppress.
#
# USAGE
#   bash scripts/checks/israel-clock-guard.sh    # always exit 0 (warn-only)
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# `|| exit 1` is load-bearing (SC2164): an unguarded cd that fails leaves the
# guard grepping the wrong tree, matching nothing, and reporting clean.
cd "$REPO_ROOT" || exit 1

SCAN_DIR="${1:-frontend}"

# The SANCTIONED owners of an Israel-clock primitive, by path. Everything else
# writing one is a new private implementation, which is the whole subject.
#
# Named explicitly rather than by directory: "anything under frontend/lib/" is
# the wrong shape twice over — it would bless a future lib file nobody reviewed,
# and it wrongly condemns components/OpeningHours.jsx, which MEH-1983 records as
# an existing owner (`todayIndex`) that simply does not live in lib/.
SANCTIONED_OWNERS=(
  "frontend/lib/israel-date.js"          # the DATE primitive (israelToday)
  "frontend/lib/orderWindow.js"          # the CLOCK-TIME parts (israelNowParts)
  "frontend/components/OpeningHours.jsx" # todayIndex — pre-existing owner
  "frontend/lib/friday-mode.js"          # pre-existing owner (MEH-1983 §1)
  "frontend/lib/established-year.js"     # pre-existing owner (MEH-1983 §1)
)

# Test files are excluded from BOTH rules, and this is not laziness.
# frontend/__tests__/israel-date.test.js exists precisely to assert that
# israelToday() and the UTC form DISAGREE across the midnight window — it has to
# be able to write the banned form, or it cannot test the thing this guard
# protects. A guard that reddens the test proving its own premise teaches people
# to delete the test.
is_excluded() {
  local f="$1"
  case "$f" in
    */__tests__/*|*.test.js|*.test.jsx|*.test.ts|*.test.tsx|*/e2e/*|*qa-meh*) return 0 ;;
  esac
  for owner in "${SANCTIONED_OWNERS[@]}"; do
    [ "$f" = "$owner" ] && return 0
  done
  return 1
}

findings=0

suppressed() {
  local file="$1" line="$2" from to
  from=$(( line > 1 ? line - 1 : 1 ))
  to=$(( line + 1 ))
  sed -n "${from},${to}p" "$file" 2>/dev/null | grep -q 'guard-ok:'
}

report() {
  echo "  WARNING $1:$2"
  echo "      $3"
  findings=$(( findings + 1 ))
}

echo "israel-clock-guard (MEH-1988) — repo root: $REPO_ROOT · scanning: $SCAN_DIR"
echo

# ---------------------------------------------------------------------------
# Rule 1 — the UTC-date form.
#
# Whitespace-tolerant inside slice() so `slice( 0, 10 )` is not a hole. Matches
# the chained form specifically; a bare toISOString() is a legitimate timestamp
# and is none of this guard's business.
# ---------------------------------------------------------------------------
echo "Rule 1: no new Date().toISOString().slice(0, 10) — that is the UTC date, not Israel's"
while IFS=: read -r file line _; do
  [ -n "$file" ] || continue
  is_excluded "$file" && continue
  suppressed "$file" "$line" && continue
  report "$file" "$line" 'This is the UTC calendar date. Israel runs UTC+2/+3, so for the first 2-3 hours of an Israel day it is still on yesterday, and the backend compares against israel_today() (backend/app/utils/clock.py). Use israelToday() from lib/israel-date.js.'
done < <(grep -rnE '\.toISOString\(\)\.slice\([[:space:]]*0[[:space:]]*,[[:space:]]*10[[:space:]]*\)' "$SCAN_DIR" \
           --include='*.js' --include='*.jsx' --include='*.ts' --include='*.tsx' \
           --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=out 2>/dev/null \
         )

echo
# ---------------------------------------------------------------------------
# Rule 2 — a second private Asia/Jerusalem formatter outside frontend/lib/.
# ---------------------------------------------------------------------------
echo "Rule 2: no new local Asia/Jerusalem Intl formatter outside the sanctioned owners"
while IFS=: read -r file line _; do
  [ -n "$file" ] || continue
  is_excluded "$file" && continue
  suppressed "$file" "$line" && continue
  report "$file" "$line" 'A second private implementation of the Israel-clock primitive. lib/israel-date.js owns the DATE (israelToday) and lib/orderWindow.js owns the CLOCK-TIME parts (israelNowParts) — import one of them instead of building a formatter here.'
done < <(grep -rnE 'timeZone:[[:space:]]*"Asia/Jerusalem"' "$SCAN_DIR" \
           --include='*.js' --include='*.jsx' --include='*.ts' --include='*.tsx' \
           --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=out 2>/dev/null)

echo
if [ "$findings" -gt 0 ]; then
  echo "israel-clock-guard WARNED — $findings finding(s). Not blocking (warn-only, MEH-1988)."
  echo "Fix by importing from frontend/lib/israel-date.js, or annotate with 'guard-ok: <reason>' within +/-1 line."
  exit 0
fi
echo "israel-clock-guard OK — no new private Israel-clock implementations."
exit 0
