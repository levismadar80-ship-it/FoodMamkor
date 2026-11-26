#!/usr/bin/env bash
#
# Module:   backend-error-copy-guard.sh
# Purpose:  MEH-1943 — API error copy a person reads lives in
#           frontend/messages/*.json (`error.api.<code>`), not in a Hebrew
#           sentence written in backend/app. Rules E1–E3 and their reasons live
#           in scripts/checks/lib/backend_error_copy.py.
# Touches:  nothing — reads the repo and prints file:line.
# Related:  scripts/checks/backend-error-copy-baseline.txt (E3 ratchet),
#           backend/app/api_errors.py, frontend/lib/errors.js.
# History:  MEH-1943 (creation).
#
# USAGE
#   bash scripts/checks/backend-error-copy-guard.sh              # exit 1 on any violation
#   bash scripts/checks/backend-error-copy-guard.sh --self-test
set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1
LIB=scripts/checks/lib/backend_error_copy.py

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
  echo "backend-error-copy-guard: PASS"
else
  echo "backend-error-copy-guard FAILED — new error copy: api_error_detail(code, message, **params) in backend/app/api_errors.py + error.api.<code> in messages/he.json and en.json (same words). E1 escape: 'guard-ok: <reason>' within ±1 line."
fi
exit "$rc"
