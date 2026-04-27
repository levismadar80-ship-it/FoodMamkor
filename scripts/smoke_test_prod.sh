#!/usr/bin/env bash
#
# MEH-259 — post-deploy smoke test wrapper.
#
# Usage:
#   scripts/smoke_test_prod.sh                              # production (default)
#   scripts/smoke_test_prod.sh https://...up.railway.app    # any backend URL
#
# Env vars honored (passed through to smoke_test.py):
#   PENDING_PRODUCER_UUID   Required for check 3; unset → check is skipped.
#
# Exit codes:
#   0   all 6 checks passed (or skipped)
#   1   one or more failures — see stdout for details + fix hints
#   2   config error (bad URL, missing python)
#
set -euo pipefail

BASE_URL="${1:-https://mehamakor.online}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "MEH-259 smoke test"
echo "Target: ${BASE_URL}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python "${SCRIPT_DIR}/smoke_test.py" "${BASE_URL}"
