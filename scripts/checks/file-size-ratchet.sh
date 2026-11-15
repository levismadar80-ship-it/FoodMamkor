#!/usr/bin/env bash
#
# Module:   file-size-ratchet.sh
# Purpose:  Keep source files small enough for an AI agent (and a person) to
#           read whole. A source file that is NOT in the baseline may not pass
#           LIMIT lines (fail). A file already in the baseline may not grow
#           past its frozen count (warning only, pre-launch) — and when it
#           shrinks, lower its number in the baseline.
# Touches:  nothing — reads tracked files, prints file:line, exits 0/1.
# Does NOT: count tests, alembic revisions (outside backend/app), scripts, or
#           generated files (frontend/lib/generated/). Does not force anyone to split a file
#           they are not touching.
# Related:  scripts/checks/file-size-baseline.txt, .claude/rules/code-execution.md
#           § File size.
# History:  13/11/2026 — created (AI-friendliness review, thread
#           "לבדוק אם הקוד נוח לעבודה עם AI").
#
# CONTROL: --self-test builds a fake 1,501-line file and requires a red.

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

LIMIT=1500
BASELINE="scripts/checks/file-size-baseline.txt"

list_sources() {
  git ls-files 'backend/app/*.py' 'frontend/app/*' 'frontend/components/*' 'frontend/lib/*' \
    | grep -E '\.(py|js|jsx|ts|tsx|mjs)$' \
    | grep -vE '(^|/)(__tests__|tests?|e2e)/|\.test\.|\.spec\.|^frontend/lib/generated/' || true
}

# check <file-list-on-stdin> — prints violations, returns 1 on a fail
check() {
  local fail=0 f n base
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    n=$(wc -l <"$f" | tr -d ' ')
    base=$(awk -v f="$f" '$2 == f { print $1 }' "$BASELINE" 2>/dev/null || true)
    if [ -n "$base" ]; then
      if [ "$n" -gt "$base" ]; then
        echo "WARNING: $f:1: grew to $n lines (baseline $base). Extract the part you are changing instead of adding to it."
      fi
    elif [ "$n" -gt "$LIMIT" ]; then
      if sed -n '1,3p' "$f" | grep -q 'guard-ok:'; then continue; fi
      echo "$f:1: $n lines > $LIMIT — split it (one module per job) before it lands."
      fail=1
    fi
  done
  return $fail
}

if [ "${1:-}" = "--self-test" ]; then
  tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
  seq 1 $((LIMIT + 1)) >"$tmp/big.py"; seq 1 10 >"$tmp/small.py"
  if echo "$tmp/big.py" | check >/dev/null; then echo "self-test FAIL: oversize file passed"; exit 1; fi
  if ! echo "$tmp/small.py" | check >/dev/null; then echo "self-test FAIL: small file failed"; exit 1; fi
  # growth path: a baselined file that grew must WARN (uppercase token run-all.sh reads) and pass
  BASELINE="$tmp/baseline.txt"; echo "1500 $tmp/big.py" >"$BASELINE"
  out="$(echo "$tmp/big.py" | check)" || { echo "self-test FAIL: baselined growth failed instead of warning"; exit 1; }
  grep -q '^WARNING: ' <<<"$out" || { echo "self-test FAIL: baselined growth printed no WARNING"; exit 1; }
  echo "self-test: 3/3 cases behaved"; exit 0
fi

[ -f "$BASELINE" ] || { echo "$BASELINE:1: baseline missing"; exit 1; }
files="$(list_sources)"
count=$(printf '%s\n' "$files" | grep -c . || true)
[ "$count" -gt 100 ] || { echo "file-size-ratchet: listed only $count source files — the listing is broken, every pass is void"; exit 1; }
if printf '%s\n' "$files" | check; then
  echo "file-size-ratchet: $count source files, none new over $LIMIT lines"
else
  exit 1
fi
