#!/usr/bin/env bash
#
# Module:   temporary-marker-guard.sh
# Purpose:  A comment that declares something temporary (TODO, FIXME, HACK,
#           @deprecated, strangler, "DELETE THIS FILE") must carry an expiry:
#           LEGACY(YYYY-MM-DD, MEH-1234) on the same line or either neighbour.
#           legacy-expiry-check.sh then fails the build when that date passes.
# Touches:  nothing — reads tracked source files and prints to stdout/stderr.
# Does NOT: check the date itself (legacy-expiry-check.sh owns that), or read
#           softer words ("for now", "temporary", "shim") — too many of those
#           are history notes, and a guard that cries wolf gets silenced.
# Related:  scripts/checks/legacy-expiry-check.sh (the date check),
#           scripts/checks/temporary-marker-baseline.txt (markers that predate
#           this guard; the list only shrinks), scripts/checks/README.md.
# History:  MEH-3144 (creation). The old i18n layer sat for six months under
#           "@deprecated — Wave 2 deletes this file" with no date and no
#           ticket that existed; nothing reminded anyone (removed in MEH-3139).
#
# FAIL  a marker line with no valid LEGACY(date, ticket) within ±1 line, that
#       is not in the baseline and has no `guard-ok: <reason>` within ±1 line.
# FAIL  a baseline entry that no longer matches a marker (remove the line — the
#       baseline never keeps a slot open for a future marker).
#
# USAGE
#   bash scripts/checks/temporary-marker-guard.sh              # guard the tree
#   bash scripts/checks/temporary-marker-guard.sh --self-test  # prove it discriminates
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

SCAN_DIRS=("backend/app" "frontend/app" "frontend/components" "frontend/lib" "frontend/hooks")
BASELINE="scripts/checks/temporary-marker-baseline.txt"
# Upper-case TODO/FIXME/HACK as whole words; the rest as written in comments.
MARKER_RE='(^|[^A-Za-z0-9_])(TODO|FIXME|HACK)([^A-Za-z0-9_]|$)|@deprecated|[Ss]trangler|DELETE THIS FILE'
VALID_RE='LEGACY\([0-9]{4}-[0-9]{2}-[0-9]{2}, MEH-[0-9]+\)'

# near <file> <lineno> <regex> — does the line or a neighbour match?
near() {
  local file="$1" lineno="$2" re="$3" start
  start=$(( lineno > 1 ? lineno - 1 : 1 ))
  sed -n "${start},$(( lineno + 1 ))p" "$file" 2>/dev/null | grep -qE "$re"
}

# Prints "file:line:text" for every marker with no expiry and no guard-ok.
undated_markers() {
  local line file lineno
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    file="${line%%:*}"; lineno="${line#*:}"; lineno="${lineno%%:*}"
    near "$file" "$lineno" "$VALID_RE" && continue
    near "$file" "$lineno" 'guard-ok:[[:space:]]*[^[:space:]]' && continue
    printf '%s\n' "$line"
  done
}

scan() {
  git ls-files -z -- "$@" 2>/dev/null |
    grep -zv '/generated/' |
    xargs -0 -r grep -HInE "$MARKER_RE" 2>/dev/null || true
}

self_test() {
  local tmp; tmp="$(mktemp -d)" || exit 1
  trap 'rm -rf "$tmp"' RETURN
  printf '%s\n' "ok line" "// TODO: tidy this" "more" > "$tmp/undated.js"
  printf '%s\n' "// LEGACY(2027-01-01, MEH-1): remove after the switch" "// TODO finish the switch" > "$tmp/dated.js"
  printf '%s\n' "// guard-ok: quoting the word in a rule" "// TODO is the word we scan for" > "$tmp/hatch.js"
  printf '%s\n' "const TODOS = []; // todo list, methodology" > "$tmp/clean.js"
  printf '%s\n' " * @deprecated use next-intl" > "$tmp/deprecated.js"
  local got
  got="$(grep -HInE "$MARKER_RE" "$tmp"/*.js | undated_markers | sed "s|$tmp/||" | cut -d: -f1 | sort | tr '\n' ' ')"
  if [ "$got" != "deprecated.js undated.js " ]; then
    echo "  SELF-TEST FAILED: expected 'deprecated.js undated.js ', got '$got'"
    return 1
  fi
  echo "  self-test OK: 2 undated markers caught; dated, guard-ok and non-marker lines pass."
}

if [ "${1:-}" = "--self-test" ]; then
  self_test; exit $?
fi

self_test || exit 1

all="$(scan "${SCAN_DIRS[@]}")"
total="$(printf '%s\n' "$all" | grep -c . || true)"
# Control: the scan must be able to see the tree at all.
files="$(git ls-files -- "${SCAN_DIRS[@]}" | wc -l)"
if [ "$files" -lt 100 ]; then
  echo "  temporary-marker-guard: only $files tracked files under the scan dirs — the scan is not seeing the tree. FAIL."
  exit 1
fi

undated="$(printf '%s\n' "$all" | undated_markers)"
# Baseline lines are "path<TAB>marker text (trimmed)"; compare without line numbers.
key() { sed -E 's/^([^:]+):[0-9]+:[[:space:]]*/\1\t/'; }
found_keys="$(printf '%s\n' "$undated" | grep . | key | sort -u)"
base_keys="$(grep -vE '^[[:space:]]*(#|$)' "$BASELINE" 2>/dev/null | sort -u)"

new="$(comm -23 <(printf '%s\n' "$found_keys" | grep .) <(printf '%s\n' "$base_keys" | grep .))"
stale="$(comm -13 <(printf '%s\n' "$found_keys" | grep .) <(printf '%s\n' "$base_keys" | grep .))"

echo "  scanned $files file(s); $total marker line(s); $(printf '%s\n' "$base_keys" | grep -c . || true) in the baseline"
status=0
if [ -n "$new" ]; then
  echo
  echo "  NO EXPIRY — a 'temporary' with no date stays forever:"
  printf '%s\n' "$undated" | while IFS= read -r l; do
    k="$(printf '%s\n' "$l" | key)"
    printf '%s\n' "$new" | grep -qxF "$k" && echo "    ${l%%:*}:$(printf '%s' "$l" | cut -d: -f2)  $(printf '%s' "$l" | cut -d: -f3- | sed 's/^[[:space:]]*//')"
  done
  echo "    add LEGACY(YYYY-MM-DD, MEH-1234) on that line or a neighbour, or finish it now."
  echo "    not a temporary (e.g. the word quoted in prose)? add 'guard-ok: <reason>'."
  status=1
fi
if [ -n "$stale" ]; then
  echo
  echo "  STALE BASELINE — these entries match nothing; delete them from $BASELINE:"
  printf '%s\n' "$stale" | sed 's/^/    /'
  status=1
fi
[ "$status" -eq 0 ] && echo "  every temporary marker is dated or in the baseline. OK."
exit "$status"
