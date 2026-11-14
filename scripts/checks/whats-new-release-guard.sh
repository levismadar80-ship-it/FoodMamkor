#!/usr/bin/env bash
#
# Module:   whats-new-release-guard.sh
# Purpose:  A release PR (base = main) cannot ship without a «מה חדש» entry for
#           the version it releases: the newest version in
#           frontend/lib/whats-new.js must be NEWER than the latest v* tag.
#           A release with nothing for businesses still adds an entry with
#           `items: 0` — so "no news" is a decision, never a forgotten step.
# Touches:  nothing — reads one file, asks origin for its tags (ls-remote).
# Does NOT: check the wording (Sapir approves it), the he/en lines
#           (frontend/__tests__/WhatsNew.test.jsx), or any PR into staging —
#           feature PRs land between releases and owe no entry.
# Related:  frontend/lib/whats-new.js (WHATS_NEW_RELEASES),
#           docs/release/whats-new.md (how an entry is written),
#           docs/RELEASE_CHECKLIST.md part א׳.
# History:  MEH-3200 (creation).
#
# INPUTS (env)
#   GITHUB_BASE_REF       set by Actions on pull_request; only "main" enforces.
#   WHATS_NEW_LATEST_TAG  optional override of the tag lookup (tests, offline).
#
# SELF-TEST runs first on every invocation (builder-model-guard precedent):
#   synthetic comparisons in both directions, plus the parser run against the
#   REAL frontend/lib/whats-new.js, which must yield a version. A parser that
#   returns nothing would make every release PR pass, so an empty parse fails.

set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DATA="$REPO_ROOT/frontend/lib/whats-new.js"

# First `version: "x.y.z"` after WHATS_NEW_RELEASES = newest (the list is newest first).
newest_entry() {
  awk '/WHATS_NEW_RELEASES *=/{on=1} on && match($0, /version: *"[0-9]+\.[0-9]+\.[0-9]+"/) {
    s=substr($0, RSTART, RLENGTH); gsub(/[^0-9.]/, "", s); print s; exit }' "$1"
}

# 0 when $1 > $2 (strictly newer), 1 otherwise.
is_newer() {
  [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -1)" = "$1" ]
}

latest_tag() {
  if [ -n "${WHATS_NEW_LATEST_TAG:-}" ]; then echo "${WHATS_NEW_LATEST_TAG#v}"; return; fi
  git -C "$REPO_ROOT" ls-remote --tags origin 'refs/tags/v*' 2>/dev/null \
    | sed -E 's#.*refs/tags/v##; s#\^\{\}$##' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -1
}

self_test() {
  local bad=0 tmp
  is_newer 1.5.1 1.5.0 || { echo "self-test: 1.5.1 > 1.5.0 failed"; bad=1; }
  is_newer 1.10.0 1.9.9 || { echo "self-test: 1.10.0 > 1.9.9 failed (text compare?)"; bad=1; }
  is_newer 1.5.0 1.5.0 && { echo "self-test: equal version counted as newer"; bad=1; }
  is_newer 1.4.9 1.5.0 && { echo "self-test: older version counted as newer"; bad=1; }
  tmp="$(mktemp)"
  printf 'export const WHATS_NEW_RELEASES = [\n  { version: "2.0.0", key: "v2_0_0", date: "2027-01-01", items: 0 },\n  { version: "1.9.0", key: "v1_9_0", date: "2026-12-01", items: 2 },\n];\n' > "$tmp"
  [ "$(newest_entry "$tmp")" = "2.0.0" ] || { echo "self-test: parser did not pick the first (newest) entry"; bad=1; }
  rm -f "$tmp"
  [ -n "$(newest_entry "$DATA")" ] || { echo "$DATA:1: self-test: no version parsed from the real file"; bad=1; }
  return $bad
}

self_test || { echo "FAIL whats-new-release-guard: self-test failed — every result below would be void"; exit 1; }
[ "${1:-}" = "--self-test" ] && { echo "self-test: 6 cases passed"; exit 0; }

if [ "${GITHUB_BASE_REF:-}" != "main" ]; then
  echo "whats-new-release-guard: not a release PR (base '${GITHUB_BASE_REF:-none}') — nothing to check"
  exit 0
fi

newest="$(newest_entry "$DATA")"
tag="$(latest_tag)"
if [ -z "$tag" ]; then
  echo "frontend/lib/whats-new.js:1: could not read the v* tags from origin — failing closed on a release PR"
  exit 1
fi
if is_newer "$newest" "$tag"; then
  echo "whats-new-release-guard: entry $newest is newer than tag v$tag — OK"
  exit 0
fi
line="$(grep -n "version: \"$newest\"" "$DATA" | head -1 | cut -d: -f1)"
echo "frontend/lib/whats-new.js:${line:-1}: newest «מה חדש» entry is $newest, but v$tag is already released."
echo "  Add the entry for this release (docs/release/whats-new.md), or { items: 0 } if nothing changed for businesses."
exit 1
