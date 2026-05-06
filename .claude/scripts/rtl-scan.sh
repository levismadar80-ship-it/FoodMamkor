#!/usr/bin/env bash
# rtl-scan.sh — Mehamakor RTL violation scan.
#
# Externalized from .claude/agents/verify-frontend.md step 3 (MEH-373).
# Originated as inline bash heredoc in the agent prompt; subagents
# approximated the multi-line awk-with-getline pipeline instead of
# executing it, producing 4/9/5 drift against deterministic ground
# truth of 0. Externalizing makes the agent emit a single shell
# invocation it cannot misread, and pre-formats violations so the
# agent has nothing to parse.
#
# Output contract:
#   exit 0 → line 1 = integer count, lines 2..N = "<file>:<line> — <class[, class]>"
#   exit 1 → "SCAN_DIR_MISSING" on stdout
#   exit 2 → "ALLOWLIST_MISSING" on stdout
#
# mawk compatibility note: the awk script uses `getline w < $1` to
# read source files for ±1 adjacency rtl-ok suppression. Under
# mawk 1.3.4 (Ubuntu default), `getline file < $1` silently fails
# when awk's stdin is a pipe. Fix: stage the grep+filter result to
# an intermediate file and pass it as awk's positional arg, not via
# pipe. Confirmed during MEH-373 investigation against gawk-absent
# environments.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
ALLOWLIST="$REPO_ROOT/.claude/hooks/rtl-allowlist.txt"

PATH_PAT=""
RTL_RAW=""
RTL_FILE=""
cleanup() {
  [ -n "$PATH_PAT" ] && rm -f "$PATH_PAT"
  [ -n "$RTL_RAW" ]  && rm -f "$RTL_RAW"
  [ -n "$RTL_FILE" ] && rm -f "$RTL_FILE"
}
trap cleanup EXIT

if [ ! -f "$ALLOWLIST" ]; then
  echo "ALLOWLIST_MISSING"
  exit 2
fi
if [ ! -d "$REPO_ROOT/frontend/components" ] || [ ! -d "$REPO_ROOT/frontend/app" ]; then
  echo "SCAN_DIR_MISSING"
  exit 1
fi

PATH_PAT=$(mktemp)
awk '
  /^#.*PATH EXCEPTIONS/  { section="path";    next }
  /^#.*CONTENT PATTERNS/ { section="content"; next }
  /^[[:space:]]*(#|$)/   { next }
  section == "path"      { print }
' "$ALLOWLIST" > "$PATH_PAT"

RTL_RAW=$(mktemp)
grep -rEn '\b(left-|right-|ml-|mr-|pl-|pr-)[0-9a-z]' \
  "$REPO_ROOT/frontend/components" "$REPO_ROOT/frontend/app" 2>/dev/null \
  | grep -v -f "$PATH_PAT" > "$RTL_RAW" || true

RTL_FILE=$(mktemp)
awk -F: '
  NF < 3 { next }
  !cached[$1]++ {
    n = 0
    while ((getline w < $1) > 0) { n++; L[$1, n] = w }
    C[$1] = n
    close($1)
  }
  {
    lineno = $2 + 0
    ok = 0
    for (i = lineno - 1; i <= lineno + 1; i++) {
      if (i >= 1 && i <= C[$1] && L[$1, i] ~ /rtl-ok/) { ok = 1; break }
    }
    if (ok) next

    content = $3
    for (i = 4; i <= NF; i++) content = content ":" $i

    rest = content
    classes = ""
    while (match(rest, /(left-|right-|ml-|mr-|pl-|pr-)[a-zA-Z0-9./\[\]_-]+/)) {
      if (classes != "") classes = classes ", "
      classes = classes substr(rest, RSTART, RLENGTH)
      rest = substr(rest, RSTART + RLENGTH)
    }
    print $1 ":" $2 " — " classes
  }
' "$RTL_RAW" > "$RTL_FILE"

COUNT=$(wc -l < "$RTL_FILE")
echo "$COUNT"
cat "$RTL_FILE"
