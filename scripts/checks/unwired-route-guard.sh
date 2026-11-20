#!/usr/bin/env bash
#
# Module:   unwired-route-guard.sh
# Purpose:  fail when a backend route has no caller in frontend/ and is not in
#           unwired-route-baseline.txt with a reason — a server feature with no
#           button on the site (MEH-3523).
# Touches:  nothing — reads files and prints.
# Does NOT: own the frontend/backend diff: that is run_static() in
#           scripts/check_api_contract.py. Implementation + self-test:
#           scripts/checks/lib/unwired_routes.py.
# History:  MEH-3523 (creation, 2026-11-20).
#
# USAGE
#   bash scripts/checks/unwired-route-guard.sh              # check
#   bash scripts/checks/unwired-route-guard.sh --self-test  # prove it discriminates
set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

if [ "${1:-}" = "--self-test" ]; then
  exec python3 scripts/checks/lib/unwired_routes.py --self-test
fi
# Preflight: a broken classifier must not pass silently.
python3 scripts/checks/lib/unwired_routes.py --self-test >/dev/null || {
  echo "scripts/checks/lib/unwired_routes.py:1: self-test failed — every result of this guard is void"
  python3 scripts/checks/lib/unwired_routes.py --self-test
  exit 1
}
python3 scripts/checks/lib/unwired_routes.py
rc=$?
[ "$rc" -eq 0 ] && echo "unwired-route-guard: PASS"
exit "$rc"
