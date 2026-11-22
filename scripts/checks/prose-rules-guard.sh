#!/usr/bin/env bash
#
# Module:   prose-rules-guard.sh
# Purpose:  Hold rules that were written only in words (routers/CLAUDE.md,
#           db.md, backend.md, testing.md) with a machine check. The rules and
#           their reasons live in scripts/checks/lib/prose_rules.py.
# Touches:  nothing — reads the repo and prints file:line.
# Related:  scripts/checks/hebrew-detail-allowlist.tsv (R1 exceptions)
# History:  MEH-3601 (creation, under MEH-3600).
#
# USAGE
#   bash scripts/checks/prose-rules-guard.sh              # exit 1 on any violation
#   bash scripts/checks/prose-rules-guard.sh --self-test
set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1
LIB=scripts/checks/lib/prose_rules.py

if [ "${1:-}" = "--self-test" ]; then
  exec python3 -I "$LIB" --self-test
fi
# The self-test runs first: if the checker cannot find what it must find in
# the real repo files, every PASS below would mean nothing.
python3 -I "$LIB" --self-test >/dev/null || {
  echo "$LIB:1: self-test failed — every result of this guard is void"
  python3 -I "$LIB" --self-test
  exit 1
}
python3 -I "$LIB"
rc=$?
if [ "$rc" -eq 0 ]; then
  echo "prose-rules-guard: PASS"
else
  echo "prose-rules-guard FAILED — fix the lines above, or (R2–R5) add 'guard-ok: <reason>' within ±1 line."
fi
exit "$rc"
