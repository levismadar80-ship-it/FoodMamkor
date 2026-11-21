#!/usr/bin/env bash
#
# Module:   orphan-folder-scan.sh
# Purpose:  List tracked folders that nothing live points at and nobody has
#           touched in a while: the shape of design-reference/ (551 files,
#           15 MB) and frontend/e2e/_qa-archive/ before MEH-3614 deleted them.
# Touches:  nothing. Reads git and prints to stdout.
# Does NOT: delete anything, fail CI, or judge. A listed folder is a question
#           for a person ("do we still need this?"), never a verdict. It is
#           run by the weekly repo health scan (scripts/health/weekly-repo-health.sh),
#           not by scripts/checks/run-all.sh, because an age rule must not
#           warn on unrelated PRs.
# Related:  scripts/health/README.md, docs/media-archive.md (MEH-3614).
# History:  MEH-3615 (creation, 21/11/2026).
#
# WHAT "ORPHAN" MEANS HERE
#   A candidate folder D (depth <= 3, outside the excluded trees below) is
#   listed when BOTH hold:
#   1. No LIVE line mentions it. The token searched is D's path, minus a
#      leading frontend/ or backend/ (imports are relative to those roots):
#      design-reference, e2e/_qa-archive. A line is live when it is in a file
#      outside D, outside docs, markdown and CSS, outside the guards that
#      only allow or skip folders (scripts/checks/**, tests/*guard*), and is
#      not a comment line (//, #, *, /*, <!--). Comments, docs and allowlists
#      cite a folder; they do not use it. CSS is out because a block-comment
#      continuation line has no marker (globals.css:436 cited _qa-archive).
#   2. Its newest commit is older than MIN_AGE_DAYS (default 60), so a folder
#      being built this month is not reported.
#   A folder under a listed folder is not listed again.
#
#   Known blind spots, both handled by scripts/health/orphan-folder-allow.txt
#   (one folder per line, with the reason):
#   - a folder used only through a computed path (a glob, a runtime string);
#   - a folder used only by a guard in scripts/checks/ (fixtures, testdata),
#     because guard mentions do not count (see 1);
#   - a folder reached only by a relative path (../fixtures/x), which does not
#     contain the full token, so it is listed although it is used.
#   The opposite blind spot has no fix here: a short token (frontend/hooks →
#   "hooks") matches unrelated lines, so such a folder is never listed.
#
# Usage:    orphan-folder-scan.sh [--min-age-days N] [REV]
#           orphan-folder-scan.sh --self-test
# Output:   "ORPHAN: <dir>/ (last commit YYYY-MM-DD, N files)" per finding,
#           then "orphan-folder-scan: N candidates checked at <rev>, M orphan(s)".
#           Exit 0; 2 when the clone is shallow (every date would be the graft
#           date) or the search pipeline itself fails — a dead probe lists
#           every folder, and that must not read as findings.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT" || exit 2
ALLOW_FILE="scripts/health/orphan-folder-allow.txt"

# Trees that are never candidates: read by people or served by path, not
# referenced by name (docs, evidence, Next.js routes, static files, tool config).
EXCLUDE_RE='^(docs|qa-artifacts|frontend/qa-artifacts|\.claude|\.agents|\.github|frontend/app|frontend/public|backend/alembic|logo)(/|$)'
# Files whose mentions do not count as use.
NONLIVE_PATHSPEC=(':!*.md' ':!docs/**' ':!scripts/checks/**' ':!scripts/health/**'
                  ':!tests/*guard*' ':!*.css' ':!.gitattributes' ':!.gitignore' ':!**/.gitignore')
# Drops "rev:path:lineno:" and comment lines; prints the rest.
LIVE_AWK='{ line = $0; sub(/^[^:]*:[^:]*:[^:]*:/, "", line);
            if (line ~ /^[[:space:]]*(\/\/|#|\*|\/\*|<!--)/) next; print }'

live_hits() {  # $1 rev, $2 dir, $3 token → first live line, or nothing; rc 2 on pipeline error
  local raw rc out
  raw=$(git grep -n -F -e "$3" "$1" -- . ":!$2/**" "${NONLIVE_PATHSPEC[@]}" 2>&1); rc=$?
  [ "$rc" -gt 1 ] && { echo "git grep failed (rc $rc): $raw" >&2; return 2; }
  [ -z "$raw" ] && return 0
  out=$(printf '%s\n' "$raw" | awk "$LIVE_AWK") || { echo "awk filter failed" >&2; return 2; }
  printf '%s\n' "${out%%$'\n'*}"   # first line, without a pipe (head -1 would SIGPIPE under pipefail)
}

scan() {  # $1 = rev, $2 = min age days → prints ORPHAN lines + summary
  local rev="$1" min_age="$2" now cutoff checked=0 found=0 listed=()
  if [ "$(git rev-parse --is-shallow-repository)" = "true" ]; then
    echo "orphan-folder-scan ERROR: shallow clone — commit dates are the graft date; every result of this run is void. Run: git fetch --unshallow --filter=blob:none origin" >&2
    return 2
  fi
  now=$(git log -1 --format=%ct "$rev"); cutoff=$(( now - min_age * 86400 ))
  local allow=""; [ -f "$ALLOW_FILE" ] && allow=$(grep -v '^#' "$ALLOW_FILE" | awk '{print $1}' | grep . || true)

  while IFS= read -r d; do
    local p skip=0; for p in ${listed[@]+"${listed[@]}"}; do case "$d/" in "$p"/*) skip=1;; esac; done
    [ "$skip" = 1 ] && continue
    printf '%s\n' "$allow" | grep -qxF "$d" && continue
    checked=$((checked + 1))
    local last; last=$(git log -1 --format=%ct "$rev" -- "$d")
    [ -n "$last" ] && [ "$last" -gt "$cutoff" ] && continue
    local tok="${d#frontend/}"; tok="${tok#backend/}"
    local hits; hits=$(live_hits "$rev" "$d" "$tok") || {
      echo "orphan-folder-scan ERROR: search failed on $d — every result of this run is void" >&2; return 2; }
    [ -n "$hits" ] && continue
    local n; n=$(git ls-tree -r --name-only "$rev" -- "$d" | wc -l)
    echo "ORPHAN: $d/ (last commit $(date -u -d "@$last" +%F), $n files)"
    listed+=("$d"); found=$((found + 1))
  done < <(git ls-tree -d -r --name-only "$rev" | awk -F/ 'NF<=3' | grep -vE "$EXCLUDE_RE" | LC_ALL=C sort)

  if [ "$checked" -eq 0 ]; then  # a dead folder list reads as "0 orphans"; it is not
    echo "orphan-folder-scan ERROR: 0 candidate folders at $rev — the folder listing failed; every result of this run is void" >&2
    return 2
  fi
  echo "orphan-folder-scan: $checked candidates checked at $(git rev-parse --short "$rev"), $found orphan(s), min age ${min_age}d"
}

self_test() {
  # Anchored to the real repo: 3a5c2a3e3 is the staging tip MEH-3614 was cut
  # from, which still held both folders it deleted.
  local anchor=3a5c2a3e3 out status=0
  echo "orphan-folder-scan --self-test (anchor $anchor)"
  if ! git cat-file -e "$anchor^{commit}" 2>/dev/null; then
    echo "  [XX] anchor commit $anchor not in this clone — the self-test is void"; return 1
  fi
  check() { if printf '%s\n' "$out" | grep -qF "$2"; then r=listed; else r=absent; fi
            if [ "$r" = "$1" ]; then echo "  [ok] $3 → $r"; else echo "  [XX] $3 → $r (want $1)"; status=1; fi; }
  out=$(scan "$anchor" 60) || { echo "  [XX] scan exited non-zero"; return 1; }
  check listed "ORPHAN: design-reference/" "design-reference/ at 60d (untouched since 07/2026, cited only in docs/comments/guards)"
  check absent "ORPHAN: frontend/e2e/_qa-archive/" "_qa-archive at 60d (moved there the same day — too new)"
  check absent "ORPHAN: frontend/components/" "frontend/components (imported everywhere)"
  check absent "ORPHAN: backend/app/" "backend/app (the API itself)"
  out=$(scan "$anchor" 0) || { echo "  [XX] scan exited non-zero"; return 1; }
  check listed "ORPHAN: frontend/e2e/_qa-archive/" "_qa-archive at 0d (no live mention, only comments)"
  check absent "ORPHAN: design-reference/s2-logo/" "child of a listed folder is not listed again"
  return "$status"
}

case "${1:-}" in
  --self-test) self_test; exit $? ;;
  --min-age-days) scan "${3:-HEAD}" "${2:?N}"; exit $? ;;
  *) scan "${1:-HEAD}" 60; exit $? ;;
esac
