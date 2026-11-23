#!/usr/bin/env bash
#
# Module:   test-location-guard.sh
# Purpose:  A test file sits where a test runner will find it, or the PR fails.
# Touches:  nothing — reads `git ls-files`, prints, exits.
# Does NOT: check that a test inside a scanned folder passes or asserts
#           anything (vitest / pytest do that; test-honesty-guard.sh checks
#           assertions). It only checks the file is somewhere a runner looks.
# Related:  frontend/vitest.config.js (`include`), frontend/playwright.config.ts
#           (`testDir: "./e2e"`), tests/CLAUDE.md (pytest lives at repo root).
# History:  MEH-3714 (creation).
#
# WHY THIS EXISTS
#   frontend/lib/utils.test.mjs and frontend/lib/producer-completeness.test.mjs
#   sat next to the code, outside vitest's `include`, and vitest.config.js
#   excluded them on top. Nothing ran them. By 22/11/2026 one had 2 failing
#   cases and the other could not even load (`@/lib` import) — and every run
#   was green, because a file no runner collects can never be red.
#
# THE RULES
#   1. Under frontend/, a *.test.* / *.spec.* file lives in frontend/__tests__/
#      (as *.test.{js,jsx,ts,tsx} — vitest's include) or in a frontend/e2e/
#      folder a Playwright config collects (flows, visual, golden, mobile-audit).
#   2. Under backend/, no test_*.py: pytest runs the repo-root
#      tests/ only (tests/CLAUDE.md).
#
# ESCAPE HATCH
#   A path listed in ALLOW below, with the reason next to it. Keep it empty
#   unless a runner really does collect the file from where it is.
#
# USAGE
#   bash scripts/checks/test-location-guard.sh             # exit 1 on a violation
#   bash scripts/checks/test-location-guard.sh --self-test # the classifier discriminates
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

# Pre-existing specs no CI config collects (playwright.config.ts testMatch is
# e2e/flows + e2e/visual; golden has its own). Run by hand; listed so a NEW
# one still fails. Found by the MEH-3714 reviewer.
ALLOW=(
  frontend/e2e/rtl.spec.ts
  frontend/e2e/screenshots.spec.ts
)

# Prints a reason when PATH breaks a rule, nothing when it is fine.
classify() {
  local p="$1" a
  for a in "${ALLOW[@]+"${ALLOW[@]}"}"; do [ "$p" = "$a" ] && return 0; done
  case "$p" in
    frontend/node_modules/*) return 0 ;;
  esac
  if [[ "$p" == frontend/* ]] && [[ "$(basename "$p")" =~ \.(test|spec)\.[a-z]+$ ]]; then
    case "$p" in
      # playwright.config.ts collects flows + visual, its golden project golden;
      # playwright.mobile-audit.config.ts collects mobile-audit.
      frontend/e2e/flows/*|frontend/e2e/visual/*|frontend/e2e/golden/*|frontend/e2e/mobile-audit/*) return 0 ;;
      frontend/e2e/*)
        echo "in frontend/e2e but outside flows/, visual/, golden/, mobile-audit/ — no Playwright config collects it"
        return 0 ;;
      frontend/__tests__/*)
        [[ "$p" =~ \.test\.(js|jsx|ts|tsx)$ ]] && return 0
        echo "in __tests__ but vitest only collects *.test.{js,jsx,ts,tsx} (vitest.config.js include)"
        return 0 ;;
    esac
    echo "outside frontend/__tests__/ and frontend/e2e/ — no runner collects it"
    return 0
  fi
  # alembic/versions is excluded: a revision id can end in "_test.py".
  if [[ "$p" == backend/* && "$p" != backend/alembic/versions/* ]] && [[ "$(basename "$p")" =~ ^test_.*\.py$ ]]; then
    echo "pytest runs the repo-root tests/ only — move it there"
  fi
  return 0
}

if [ "${1:-}" = "--self-test" ]; then
  fails=0
  expect() { # expect <bad|ok> <path>
    local got; got=$(classify "$2")
    if { [ "$1" = bad ] && [ -z "$got" ]; } || { [ "$1" = ok ] && [ -n "$got" ]; }; then
      echo "  SELF-TEST FAIL: expected $1 for $2 (got: '${got}')"; fails=$((fails + 1))
    fi
  }
  expect bad frontend/lib/utils.test.mjs            # the MEH-3714 case
  expect bad frontend/components/Foo.test.jsx
  expect bad frontend/__tests__/foo.test.mjs
  expect bad backend/app/services/test_money.py
  expect bad frontend/__tests__/foo.spec.js
  expect bad frontend/e2e/new-probe.spec.ts
  expect ok  frontend/e2e/mobile-audit/mobile-audit.spec.ts  # real file, own config
  expect ok  frontend/__tests__/utils-phone-price.test.js   # real file (MEH-1909 anchor)
  expect ok  frontend/e2e/flows/05-map-navigation.spec.ts   # real file
  expect ok  frontend/lib/utils.js
  expect ok  tests/test_api.py
  expect ok  backend/alembic/versions/20261111_1800_c05dbc247ca1_meh2952_mcp_reader_is_test.py
  [ "$fails" -eq 0 ] && echo "test-location-guard self-test OK" && exit 0
  exit 1
fi

bash "$0" --self-test >/dev/null || { echo "test-location-guard: self-test failed — the classifier is broken, result void"; exit 1; }

echo "test-location-guard (MEH-3714)"
violations=0
scanned=0
while IFS= read -r p; do
  [ -e "$p" ] || continue   # deleted in the working tree, not yet committed
  scanned=$((scanned + 1))
  why=$(classify "$p")
  [ -n "$why" ] || continue
  echo "  VIOLATION $p — $why"
  violations=$((violations + 1))
done < <(git ls-files frontend backend)

if [ "$scanned" -eq 0 ]; then
  echo "test-location-guard: git ls-files returned nothing — result void"; exit 1
fi
if [ "$violations" -gt 0 ]; then
  echo "test-location-guard FAILED — $violations file(s) no runner will ever collect."
  exit 1
fi
echo "test-location-guard OK — $scanned tracked files scanned, every test file is where a runner looks."
exit 0
