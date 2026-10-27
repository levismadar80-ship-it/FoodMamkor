#!/usr/bin/env bash
#
# Module:   doc-freshness-guard.sh
# Purpose:  warn when a watched doc's '**Last reviewed:**' date (docs/CONTEXT.md, docs/BRAND.md, docs/PROJECT_INSTRUCTIONS.md) is older than 120 days.
# Touches:  nothing — reads tracked files and prints.
# Does NOT: block. WARN-ONLY: prints WARNING (surfaced by run-all.sh, MEH-1715)
#           and exits 0. It also does not judge whether the content is still
#           true; it only notices that nobody has looked in a while.
# Related:  scripts/docs/knowledge_freshness.py (the single implementation and
#           its --self-test), docs/decisions/ADR-035-one-home-per-fact.md,
#           scripts/checks/README.md (guard contract).
# History:  MEH-2346 (creation). The rule existed in prose and lapsed with no
#           signal: HANDOFF.md reached 13,716 lines under a "rolling 7-day"
#           definition, CONTEXT.md went five months unreviewed.
#
# USAGE
#   bash scripts/checks/doc-freshness-guard.sh               # check (warn-only)
#   bash scripts/checks/doc-freshness-guard.sh --self-test   # prove the parser discriminates
#   KNOWLEDGE_TODAY=2027-01-01 bash scripts/checks/doc-freshness-guard.sh   # pin "today"
set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

if [ "${1:-}" = "--self-test" ]; then
  exec python3 scripts/docs/knowledge_freshness.py self-test
fi

# Preflight on every run (claude-md-line-cap / rules-inventory precedent): a
# parser that cannot tell a stale section from a fresh one would print nothing,
# which reads exactly like "all fresh". A broken checker is a FAILURE, not a
# warning — it is the guard that is wrong, not the docs.
if ! selftest_out="$(python3 scripts/docs/knowledge_freshness.py self-test 2>&1)"; then
  printf '%s\n' "$selftest_out"
  echo "doc-freshness-guard: self-test failed — the checker cannot be trusted, so nothing below would mean anything"
  exit 1
fi

python3 scripts/docs/knowledge_freshness.py docs-check || {
  echo "doc-freshness-guard: WARNING the checker itself failed to run — nothing was checked"
}
exit 0
