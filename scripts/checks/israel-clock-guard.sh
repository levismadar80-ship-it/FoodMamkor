#!/usr/bin/env bash
#
# israel-clock-guard.sh — BLOCKING guard (MEH-3160; warn-only until 14/11/2026,
# when a warning nobody read let five findings accumulate) against a NEW private
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
# BLOCKING SINCE MEH-3160 (14/11/2026) — AND WHY IT WAS NOT BEFORE
#   Exit 1 on any finding. It was born warn-only (MEH-1988), because MEH-1868
#   measured that a gate which arrives already blocking gets routed around;
#   promotion was to be "a separate, deliberate step once the tree is known
#   clean". This is that step. In between, the warning was a line in a log
#   nobody read and five findings accumulated: four were legitimate uses whose
#   `guard-ok` note sat outside the +/-1 window, one (lib/seo.js) was a real
#   second formatter and now imports `israelToday`. The tree is clean, so a
#   finding from here on is a new one.
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
#   bash scripts/checks/israel-clock-guard.sh    # exit 1 on any finding
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
  echo "  FAIL $1:$2"
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
  echo "israel-clock-guard FAILED — $findings finding(s). Blocking since MEH-3160 (was warn-only, MEH-1988)."
  echo "Fix by importing from frontend/lib/israel-date.js, or annotate with 'guard-ok: <reason>' within +/-1 line."
  exit 1
fi
echo "israel-clock-guard OK — no new private Israel-clock implementations."
exit 0
