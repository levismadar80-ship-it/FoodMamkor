#!/usr/bin/env bash
# e2e-gate-selftest.sh — MEH-1742
#
# Proves that the `E2E gate` aggregation predicate in e2e.yml sorts three
# scenarios correctly, and reports whether the MEH-1742 fix
# (docs/ci/e2e-gate-strict-skip.patch.md) is applied yet. Mirrors
# scripts/ci-gate-selftest.sh (MEH-1582) — same strict_ok/check_ran split,
# same two-pass structure, same reason for living outside scripts/checks/.
#
# WHY IT LIVES HERE AND NOT IN scripts/checks/
#   scripts/checks/run-all.sh auto-discovers every *executable* *.sh directly
#   inside scripts/checks/ and runs it under the required "Repo guards" job
#   (run-all.sh:97-113). This script reports a KNOWN-UNAPPLIED state as
#   informational, but promoting it into that directory before Sapir applies
#   the patch would red every PR. Move it once the patch has landed, if wanted.
#
# NOTE ON FIDELITY (.claude/rules/testing.md — "exercise the real
# implementation, never a copy"): the gate's logic lives inside a YAML `run:`
# block and cannot be sourced. Pass 1 below reads the REAL workflow file to
# detect which predicate is live; Pass 2 exercises a local reproduction of
# both predicates to show they discriminate. Pass 1 is what catches drift
# between this script and the workflow.
#
# Usage:  bash scripts/e2e-gate-selftest.sh
# Exit:   0 = predicates discriminate as expected (regardless of applied state)
#         1 = the reproduction failed to discriminate -> this script is wrong

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WF="$REPO_ROOT/.github/workflows/e2e.yml"

# ---------------------------------------------------------------- Pass 1
echo "== Pass 1 — live state of $(basename "$WF") =="
if [ ! -f "$WF" ]; then
  echo "  ERROR: workflow file not found at $WF" >&2
  exit 1
fi

if grep -q 'check_ran "Playwright E2E' "$WF"; then
  APPLIED=1
  echo "  APPLIED   — e2e-gate uses check_ran/strict_ok when frontend was touched."
else
  APPLIED=0
  echo "  NOT YET   — e2e-gate still accepts 'skipped' for any reason (the MEH-1742 hole)."
  echo "              Fix is staged in docs/ci/e2e-gate-strict-skip.patch.md (Sapir applies;"
  echo "              .github/workflows/** is CC-deny, MEH-671)."
fi

# ---------------------------------------------------------------- Pass 2
echo
echo "== Pass 2 — do the two predicates actually discriminate? =="

run_gate() {
  bash -s "$1" <<'GATE'
set -uo pipefail
variant="$1"
fail=0
ok()        { case "$1" in success|skipped) return 0 ;; *) return 1 ;; esac; }
strict_ok() { case "$1" in success)         return 0 ;; *) return 1 ;; esac; }
check()     { if ok "$2";        then echo "  OK  $1: $2"; else echo "  FAIL $1: $2"; fail=1; fi; }
check_ran() { if strict_ok "$2"; then echo "  OK  $1: $2"; else echo "  FAIL $1: $2 (did not run)"; fail=1; fi; }
# "old" = the pre-MEH-1742 gate: check_ran did not exist, e2e always used check.
if [ "$variant" = old ]; then check_ran() { check "$@"; }; fi

ok "$R_FILTER" || { echo "filter failed"; exit 1; }
if [ "$FRONTEND_TOUCHED" = "true" ]; then
  check_ran "Playwright E2E (Vercel preview)" "$R_E2E"
else
  check "Playwright E2E (Vercel preview)" "$R_E2E"
fi
exit "$fail"
GATE
}

# A — frontend PR, e2e skipped for a reason unrelated to scope. THE BUG.
export R_FILTER=success FRONTEND_TOUCHED=true R_E2E=skipped
run_gate old >/dev/null 2>&1; A_OLD=$?
run_gate new >/dev/null 2>&1; A_NEW=$?

# B — docs-only PR: filter says frontend untouched. LEGITIMATE skip, must stay green.
export R_FILTER=success FRONTEND_TOUCHED=false R_E2E=skipped
run_gate old >/dev/null 2>&1; B_OLD=$?
run_gate new >/dev/null 2>&1; B_NEW=$?

# C — ordinary frontend PR, e2e ran and passed.
export R_FILTER=success FRONTEND_TOUCHED=true R_E2E=success
run_gate old >/dev/null 2>&1; C_OLD=$?
run_gate new >/dev/null 2>&1; C_NEW=$?

v() { [ "$1" -eq 0 ] && echo GREEN || echo RED; }
printf '  %-45s %-10s %-10s\n' "SCENARIO" "OLD" "NEW"
printf '  %-45s %-10s %-10s\n' "A frontend PR, e2e skipped, no known cause" "$(v $A_OLD)" "$(v $A_NEW)"
printf '  %-45s %-10s %-10s\n' "B docs-only, filter says frontend=false"    "$(v $B_OLD)" "$(v $B_NEW)"
printf '  %-45s %-10s %-10s\n' "C frontend PR, e2e ran and passed"          "$(v $C_OLD)" "$(v $C_NEW)"

echo
PASS=1
if ! { [ $A_OLD -eq 0 ] && [ $A_NEW -ne 0 ]; }; then
  echo "  DISCRIMINATION FAIL: A must be GREEN under old and RED under new." >&2; PASS=0
fi
if ! { [ $B_OLD -eq 0 ] && [ $B_NEW -eq 0 ]; }; then
  echo "  REGRESSION: docs-only must stay GREEN under both predicates." >&2; PASS=0
fi
if ! { [ $C_OLD -eq 0 ] && [ $C_NEW -eq 0 ]; }; then
  echo "  REGRESSION: a healthy frontend PR must stay GREEN under both predicates." >&2; PASS=0
fi

if [ $PASS -eq 1 ]; then
  echo "  SELF-TEST PASS — the change discriminates exactly scenario A."
  [ $APPLIED -eq 0 ] && echo "  (Gate is still UNPATCHED in this checkout — scenario A is live today.)"
  exit 0
fi
echo "  SELF-TEST FAIL — this harness no longer models the gate; fix it before trusting it." >&2
exit 1
