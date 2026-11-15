#!/usr/bin/env bash
#
# Module:   test-honesty-guard.sh
# Purpose:  Fail when a NEW test can pass without checking anything: a pytest
#           test with no assert / pytest.raises / mock assert_* / verifying
#           helper; a skip or xfail whose reason names no MEH card; an xfail
#           without strict=True; a vitest `.only`; a vitest `.skip`/`.todo`
#           with no MEH card next to it.
# Touches:  nothing — reads tests/ and frontend/__tests__/.
# Does NOT: measure assertion strength (scripts/mutation/run.sh does) or see a
#           vitest test with zero `expect` (vitest.config.js
#           `expect.requireAssertions` fails those when they run).
# Related:  scripts/checks/lib/test_honesty.py (the scanner),
#           scripts/checks/test-honesty-baseline.txt (pre-existing findings —
#           delete lines as they are fixed, never add one),
#           .claude/rules/testing.md «Tests that pass for the wrong reason».
# History:  MEH-3295 (creation).
#
# Escape hatch for a test whose whole point is "does not raise":
#   # no-assert: <why not raising is the behaviour>
# on the def line or inside the test body.
set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

if [[ ! -d tests || ! -f tests/conftest.py ]]; then
  echo "test-honesty-guard: tests/conftest.py not found — the scan would see nothing; failing instead of passing."
  exit 1
fi
python3 -I scripts/checks/lib/test_honesty.py "$REPO_ROOT" scripts/checks/test-honesty-baseline.txt
