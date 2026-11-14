#!/usr/bin/env bash
#
# Module:   expiry-register-check.sh
# Purpose:  Warn before something in docs/ACCESS.md §9 expires (domains,
#           tokens, yearly figures), so renewing it never depends on memory.
# Touches:  nothing — reads docs/ACCESS.md, prints to stdout.
# Does NOT: renew anything, call a registrar or GitHub, or fail CI. Warn-only:
#           it is run by the weekly repo health scan (MEH-3143), not by
#           run-all.sh, because a calendar date must not red unrelated PRs.
# Related:  docs/ACCESS.md §9 (the table between the expiry-register markers),
#           scripts/checks/legacy-expiry-check.sh (same date-as-mechanism idea).
# History:  MEH-3143 (creation, 14/11/2026).
#
# Usage:    expiry-register-check.sh [today YYYY-MM-DD] [file]
# Output:   one "EXPIRY WARN:" line per row due within WARN_DAYS or past,
#           one "EXPIRY UNKNOWN:" line per row with no date, then a summary.
#           Exit 0 always, except 2 when the table cannot be found or the
#           "today" argument is not a date (a dead
#           probe must not read as "nothing due").
set -euo pipefail

WARN_DAYS=60
TODAY="${1:-$(TZ=Asia/Jerusalem date +%F)}"
# Resolved from the script's own place, so the weekly scan can run it from anywhere.
FILE="${2:-$(cd "$(dirname "$0")/../.." && pwd)/docs/ACCESS.md}"

rows=$(awk '/<!-- expiry-register:start -->/{on=1;next} /<!-- expiry-register:end -->/{on=0} on' "$FILE" \
  | grep '^|' | grep -v '^| *Item *|' | grep -Ev '^\|[ :|-]+$' || true)
if [ -z "$rows" ]; then
  echo "EXPIRY ERROR: no rows between the expiry-register markers in $FILE — every result of this run is void" >&2
  exit 2
fi

if ! today_s=$(date -u -d "$TODAY" +%s 2>/dev/null); then
  echo "EXPIRY ERROR: '$TODAY' is not a date — every result of this run is void" >&2
  exit 2
fi
checked=0; due=0; unknown=0
while IFS= read -r line; do
  item=$(echo "$line" | awk -F'|' '{gsub(/^ +| +$/,"",$2); print $2}')
  when=$(echo "$line" | awk -F'|' '{gsub(/^ +| +$/,"",$3); print $3}')
  who=$(echo "$line" | awk -F'|' '{gsub(/^ +| +$/,"",$4); print $4}')
  checked=$((checked+1))
  if ! [[ "$when" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    echo "EXPIRY UNKNOWN: $item — no date yet ($who)"
    unknown=$((unknown+1)); continue
  fi
  # A shaped-but-impossible date (2026-13-45) is reported, never fatal: one
  # bad row must not stop the rows after it from being checked.
  if ! when_s=$(date -u -d "$when" +%s 2>/dev/null); then
    echo "EXPIRY UNKNOWN: $item — malformed date '$when' ($who)"
    unknown=$((unknown+1)); continue
  fi
  days=$(( ( when_s - today_s ) / 86400 ))
  if [ "$days" -le "$WARN_DAYS" ]; then
    if [ "$days" -lt 0 ]; then state="EXPIRED $(( -days )) days ago"; else state="in $days days"; fi
    echo "EXPIRY WARN: $item — $when ($state) — $who"
    due=$((due+1))
  fi
done <<< "$rows"
echo "expiry-register: $checked rows checked as of $TODAY — $due due within $WARN_DAYS days, $unknown without a date"
