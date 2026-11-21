#!/usr/bin/env bash
#
# Module:   recheck-date-scan.sh
# Purpose:  A folder that is kept "for now" says until when, and someone is
#           told when that date comes. A folder's README.md carries one line
#           `Re-check: MM/YYYY`; this lists every such line whose month has
#           arrived, so "do we still need this?" is asked on a date and not
#           by luck (design-reference/ sat 4 months unasked, MEH-3614).
# Touches:  nothing. Reads tracked README.md files, prints to stdout.
# Does NOT: delete anything or fail CI. Run by the weekly repo health scan
#           (scripts/health/weekly-repo-health.sh), not run-all.sh, because a
#           calendar date must not warn on unrelated PRs. Same date-as-mechanism
#           idea as scripts/checks/expiry-register-check.sh (docs/ACCESS.md §9)
#           and legacy-expiry-check.sh (code markers); this one is for folders.
# History:  MEH-3615 (creation, 21/11/2026).
#
# Usage:    recheck-date-scan.sh [today YYYY-MM-DD] [root]   |   --self-test
# Output:   "RECHECK DUE: <README> Re-check MM/YYYY" per due line,
#           "RECHECK BAD: <README> '<value>'" per unreadable date, then a
#           summary. Exit 0; 2 when "today" is not a date.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"

scan() {  # $1 today, $2 root dir, $3 include testdata (1/0)
  local today="$1" root="$2" with_fixtures="$3" ym files checked=0 due=0 bad=0
  if ! ym=$(date -u -d "$today" +%Y%m 2>/dev/null); then
    echo "RECHECK ERROR: '$today' is not a date — every result of this run is void" >&2; return 2
  fi
  if [ "$with_fixtures" = 1 ]; then
    files=$(cd "$root" && find . -name README.md -path '*testdata/recheck-*' | sed 's#^\./##' | LC_ALL=C sort)
  else
    files=$(cd "$root" && git ls-files -- '*README.md' ':!scripts/health/testdata/**' | LC_ALL=C sort)
  fi
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    local v; v=$(grep -m1 -oE '^Re-check: *[^ ]+' "$root/$f" | sed -E 's/^Re-check: *//') || true
    [ -z "$v" ] && continue
    checked=$((checked + 1))
    if [[ "$v" =~ ^(0[1-9]|1[0-2])/(20[0-9]{2})$ ]]; then
      if [ "${BASH_REMATCH[2]}${BASH_REMATCH[1]}" -le "$ym" ]; then
        echo "RECHECK DUE: $f Re-check $v"; due=$((due + 1))
      fi
    else
      echo "RECHECK BAD: $f '$v' (want MM/YYYY)"; bad=$((bad + 1))
    fi
  done <<< "$files"
  echo "recheck-date-scan: $checked folder(s) with a Re-check line, $due due, $bad unreadable (today $today)"
}

self_test() {
  local out status=0
  echo "recheck-date-scan --self-test"
  out=$(scan 2026-11-21 "$REPO" 1) || { echo "  [XX] scan exited non-zero"; return 1; }
  t() { if printf '%s\n' "$out" | grep -qF "$2"; then r=yes; else r=no; fi
        if [ "$r" = "$1" ]; then echo "  [ok] $3"; else echo "  [XX] $3 (got $r)"; status=1; fi; }
  t yes "RECHECK DUE: scripts/health/testdata/recheck-past/README.md"   "01/2026 is due on 21/11/2026"
  t no  "recheck-future"                                              "12/2099 is not due"
  t yes "RECHECK BAD: scripts/health/testdata/recheck-bad/README.md"    "13/2026 is reported as unreadable"
  t yes "3 folder(s) with a Re-check line"                             "all three fixtures were read (a dead probe reads 0)"
  out=$(scan 2025-12-31 "$REPO" 1)
  t no  "RECHECK DUE: scripts/health/testdata/recheck-past"             "01/2026 is not due on 31/12/2025 (month boundary)"
  if scan not-a-date "$REPO" 1 >/dev/null 2>&1; then echo "  [XX] a bad 'today' must exit 2"; status=1; else echo "  [ok] a bad 'today' exits non-zero"; fi
  return "$status"
}

case "${1:-}" in
  --self-test) self_test; exit $? ;;
  *) scan "${1:-$(TZ=Asia/Jerusalem date +%F)}" "${2:-$REPO}" 0; exit $? ;;
esac
