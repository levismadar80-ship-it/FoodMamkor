#!/usr/bin/env bash
#
# Module:   gate-wiring-guard.sh
# Purpose:  fail when a required aggregator (ci-gate, deploy-gate, e2e-gate)
#           drifts from the jobs it votes on: a needs: entry that is not a
#           job, a needs.X read that is not in needs:, a needed job with no
#           R_* vote, or an R_* the script never checks. docs/DEPLOYMENT.md
#           asked for this by hand ("in the same breath") — MEH-3192.
# Touches:  nothing — reads .github/workflows/*.yml (CC never writes there).
# Does NOT: decide which jobs should vote, or read branch-protection settings.
# Related:  scripts/checks/lib/gate_wiring.py (implementation + self-test).
# History:  MEH-3192 (creation).
#
# USAGE
#   bash scripts/checks/gate-wiring-guard.sh              # check
#   bash scripts/checks/gate-wiring-guard.sh --self-test  # prove it discriminates
set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

if [ "${1:-}" = "--self-test" ]; then
  exec python3 scripts/checks/lib/gate_wiring.py --self-test
fi
python3 scripts/checks/lib/gate_wiring.py --self-test >/dev/null || {
  echo "scripts/checks/lib/gate_wiring.py:1: self-test failed — every result of this guard is void"
  python3 scripts/checks/lib/gate_wiring.py --self-test
  exit 1
}
python3 scripts/checks/lib/gate_wiring.py
rc=$?
[ "$rc" -eq 0 ] && echo "gate-wiring-guard: PASS"
exit "$rc"
