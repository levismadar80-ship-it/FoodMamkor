#!/usr/bin/env bash
# ci-gate-selftest.sh — MEH-1582
#
# Proves that the `CI gate (required)` aggregation predicate in the PR-checks
# workflow sorts three scenarios correctly, and reports whether the MEH-1582 fix
# (docs/ci/ci-gate-skip-green.patch.md) is applied yet.
#
# WHY IT LIVES HERE AND NOT IN scripts/checks/
#   scripts/checks/run-all.sh auto-discovers every *executable* *.sh directly
#   inside scripts/checks/ and runs it under the required "Repo guards" job
#   (run-all.sh:97-113). This script reports a KNOWN-UNAPPLIED state as
#   informational, but promoting it into that directory before Sapir applies the
#   patch would red every PR. Move it once the patch has landed, if wanted.
#
# NOTE ON FIDELITY (.claude/rules/testing.md — "exercise the real
# implementation, never a copy"): the gate's logic lives inside a YAML `run:`
# block and cannot be sourced. Pass 1 below reads the REAL workflow file to
# detect which predicate is live; Pass 2 exercises a local reproduction of both
# predicates to show they discriminate. Pass 1 is what catches drift between
# this script and the workflow.
#
# Usage:  bash scripts/ci-gate-selftest.sh
# Exit:   0 = predicates discriminate as expected (regardless of applied state)
#         1 = the reproduction failed to discriminate -> this script is wrong

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# rtl-ok — "pr-checks.yml" trips the physical-class scan on the substring "pr-c".
WF="$REPO_ROOT/.github/workflows/pr-checks.yml"
# rtl-ok

# ---------------------------------------------------------------- Pass 1
echo "== Pass 1 — live state of $(basename "$WF") =="
if [ ! -f "$WF" ]; then
  echo "  ERROR: workflow file not found at $WF" >&2
  exit 1
fi

if grep -q 'check_ran "Frontend build' "$WF"; then
  APPLIED=1
  echo "  APPLIED   — gate uses check_ran/strict_ok; skipped required jobs FAIL."
else
  APPLIED=0
  echo "  NOT YET   — gate still accepts 'skipped' for enforced jobs (the MEH-1582 hole)."
  echo "              Fix is staged in docs/ci/ci-gate-skip-green.patch.md (Sapir applies;"
  echo "              .github/workflows/** is CC-deny, MEH-671)."
fi

DRAFT_GATED=$(grep -c "github.event.pull_request.draft == false" "$WF")
echo "  draft-gated jobs currently in the file: $DRAFT_GATED (expected 6)"

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
# "old" = the pre-MEH-1582 gate: check_ran did not exist, everything used check.
if [ "$variant" = old ]; then check_ran() { check "$@"; }; fi

ok "$R_CHANGES" || { echo "changes failed"; exit 1; }
check_ran "Env drift" "$R_ENV_DRIFT"
if [ "$BACKEND_TOUCHED" = "true" ]; then
  check_ran "pytest" "$R_PYTEST"
  check_ran "ruff"   "$R_LINT_BACKEND"
  check     "mypy"   "$R_BACKEND_MYPY"
fi
if [ "$FRONTEND_TOUCHED" = "true" ]; then
  check_ran "build"   "$R_BUILD"
  check_ran "ai-scan" "$R_AI_SCAN"
  check_ran "vitest"  "$R_FRONTEND_VITEST"
  check     "knip"    "$R_FRONTEND_KNIP"
  check     "tsc"     "$R_FRONTEND_TSC"
fi
exit "$fail"
GATE
}

# A — draft frontend PR: every draft-gated job suppressed. THE BUG.
export R_CHANGES=success FRONTEND_TOUCHED=true BACKEND_TOUCHED=false \
  R_ENV_DRIFT=skipped R_BUILD=skipped R_AI_SCAN=skipped R_FRONTEND_VITEST=skipped \
  R_FRONTEND_KNIP=success R_FRONTEND_TSC=success \
  R_PYTEST=skipped R_LINT_BACKEND=skipped R_BACKEND_MYPY=skipped
run_gate old >/dev/null 2>&1; A_OLD=$?
run_gate new >/dev/null 2>&1; A_NEW=$?

# B — docs-only PR: neither stack touched. LEGITIMATE skip, must stay green.
export R_CHANGES=success FRONTEND_TOUCHED=false BACKEND_TOUCHED=false \
  R_ENV_DRIFT=success R_BUILD=skipped R_AI_SCAN=skipped R_FRONTEND_VITEST=skipped \
  R_FRONTEND_KNIP=skipped R_FRONTEND_TSC=skipped \
  R_PYTEST=skipped R_LINT_BACKEND=skipped R_BACKEND_MYPY=skipped
run_gate old >/dev/null 2>&1; B_OLD=$?
run_gate new >/dev/null 2>&1; B_NEW=$?

# C — ordinary non-draft frontend PR, everything ran green. Mirrors PR #2412.
export R_CHANGES=success FRONTEND_TOUCHED=true BACKEND_TOUCHED=false \
  R_ENV_DRIFT=success R_BUILD=success R_AI_SCAN=success R_FRONTEND_VITEST=success \
  R_FRONTEND_KNIP=success R_FRONTEND_TSC=success \
  R_PYTEST=skipped R_LINT_BACKEND=skipped R_BACKEND_MYPY=skipped
run_gate old >/dev/null 2>&1; C_OLD=$?
run_gate new >/dev/null 2>&1; C_NEW=$?

v() { [ "$1" -eq 0 ] && echo GREEN || echo RED; }
printf '  %-40s %-10s %-10s\n' "SCENARIO" "OLD" "NEW"
printf '  %-40s %-10s %-10s\n' "A draft FE PR, all checks skipped" "$(v $A_OLD)" "$(v $A_NEW)"
printf '  %-40s %-10s %-10s\n' "B docs-only, stack untouched"      "$(v $B_OLD)" "$(v $B_NEW)"
printf '  %-40s %-10s %-10s\n' "C non-draft FE PR, everything ran" "$(v $C_OLD)" "$(v $C_NEW)"

echo
PASS=1
if ! { [ $A_OLD -eq 0 ] && [ $A_NEW -ne 0 ]; }; then
  echo "  DISCRIMINATION FAIL: A must be GREEN under old and RED under new." >&2; PASS=0
fi
if ! { [ $B_OLD -eq 0 ] && [ $B_NEW -eq 0 ]; }; then
  echo "  REGRESSION: docs-only must stay GREEN under both predicates." >&2; PASS=0
fi
if ! { [ $C_OLD -eq 0 ] && [ $C_NEW -eq 0 ]; }; then
  echo "  REGRESSION: a healthy PR must stay GREEN under both predicates." >&2; PASS=0
fi

if [ $PASS -eq 1 ]; then
  echo "  SELF-TEST PASS — the change discriminates exactly scenario A."
  [ $APPLIED -eq 0 ] && echo "  (Gate is still UNPATCHED in this checkout — scenario A is live today.)"
  exit 0
fi
echo "  SELF-TEST FAIL — this harness no longer models the gate; fix it before trusting it." >&2
exit 1
