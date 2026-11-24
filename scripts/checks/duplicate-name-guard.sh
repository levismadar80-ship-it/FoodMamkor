#!/usr/bin/env bash
#
# Module:   duplicate-name-guard.sh
# Purpose:  fail when a function name defined at module level in
#           frontend/{app,components,lib} or backend/app is now in more
#           files than duplicate-name-baseline.txt allows (MEH-3715: Sapir
#           asked that a second copy of a helper cannot come back unseen).
# Touches:  nothing — reads files and prints.
# Does NOT: compare function bodies (clone-ratchet does), or check names
#           that frameworks require per file.
# Related:  scripts/checks/lib/duplicate_names.py (implementation + self-test).
# History:  MEH-3715 (creation).
#
# USAGE
#   bash scripts/checks/duplicate-name-guard.sh                    # check
#   bash scripts/checks/duplicate-name-guard.sh --self-test
#   bash scripts/checks/duplicate-name-guard.sh --update-baseline  # after folding a copy
set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1
if [ -n "${1:-}" ]; then
  exec python3 scripts/checks/lib/duplicate_names.py "$@"
fi
python3 scripts/checks/lib/duplicate_names.py --self-test >/dev/null || {
  echo "scripts/checks/lib/duplicate_names.py:1: self-test failed — every result of this guard is void"
  python3 scripts/checks/lib/duplicate_names.py --self-test
  exit 1
}
exec python3 scripts/checks/lib/duplicate_names.py
