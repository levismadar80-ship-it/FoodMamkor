#!/usr/bin/env bash
#
# Module:   api-docs-route-guard.sh
# Purpose:  fail when a path in backend/openapi.json is not named in
#           docs/DATA.md (workflow rule 12 / backend.md «Docs update rule» was
#           prose only — 25 of 202 paths had drifted out, 14/11/2026).
# Touches:  nothing — reads files and prints.
# Does NOT: check .ai/diagrams/api-routes.md, which is a map, not the
#           inventory (one owner per fact, Smell #1); or the content of the
#           doc. Today's gaps live in api-docs-baseline.txt, which only shrinks.
# Related:  scripts/checks/lib/api_docs_routes.py (implementation + self-test),
#           openapi-codegen-drift-guard.sh (keeps openapi.json fresh).
# History:  MEH-3192 (creation).
#
# USAGE
#   bash scripts/checks/api-docs-route-guard.sh                    # check
#   bash scripts/checks/api-docs-route-guard.sh --self-test        # prove it discriminates
#   bash scripts/checks/api-docs-route-guard.sh --update-baseline  # after documenting paths
set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

if [ "${1:-}" = "--self-test" ] || [ "${1:-}" = "--update-baseline" ]; then
  exec python3 scripts/checks/lib/api_docs_routes.py "$1"
fi
# Preflight: a broken parser must not pass silently.
python3 scripts/checks/lib/api_docs_routes.py --self-test >/dev/null || {
  echo "scripts/checks/lib/api_docs_routes.py:1: self-test failed — every result of this guard is void"
  python3 scripts/checks/lib/api_docs_routes.py --self-test
  exit 1
}
python3 scripts/checks/lib/api_docs_routes.py
rc=$?
[ "$rc" -eq 0 ] && echo "api-docs-route-guard: PASS"
exit "$rc"
