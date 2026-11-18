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
BL=scripts/checks/test-honesty-baseline.txt
# The baseline only shrinks: compare it with the base branch's copy. A PR that
# changes the scanner itself may add lines (a new detector finds old tests);
# any other PR that adds one fails. No base copy (first PR, no fetch) → no
# comparison, and the guard says so.
BASE_REF="origin/${GITHUB_BASE_REF:-staging}"
BASE_BL="$(mktemp)"; trap 'rm -f "$BASE_BL"' EXIT
EXTRA=()
if git show "$BASE_REF:$BL" > "$BASE_BL" 2>/dev/null; then
  if git diff --quiet "$BASE_REF" -- scripts/checks/lib/test_honesty.py 2>/dev/null; then
    EXTRA=("$BASE_BL")
  else
    echo "test-honesty-guard: the scanner changed in this branch — baseline growth allowed for this PR."
  fi
else
  echo "test-honesty-guard: no $BL on $BASE_REF — baseline growth not checked."
fi
python3 -I scripts/checks/lib/test_honesty.py "$REPO_ROOT" "$BL" "${EXTRA[@]}"
