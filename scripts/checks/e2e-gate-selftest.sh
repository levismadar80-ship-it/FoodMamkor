#!/usr/bin/env bash
# e2e-gate-selftest.sh — MEH-1742
#
# Proves that the `E2E gate` aggregation predicate in e2e.yml sorts three
# scenarios correctly, and reports whether the MEH-1742 fix
# (docs/ci/e2e-gate-strict-skip.patch.md) is applied yet. Mirrors
# scripts/ci-gate-selftest.sh (MEH-1582) — same strict_ok/check_ran split,
# same two-pass structure, same reason for living outside scripts/checks/.
#
# WHY IT NOW LIVES IN scripts/checks/ (MEH-1742 item 6, 17/11/2026)
#   It used to sit in scripts/ because it reported a KNOWN-UNAPPLIED state:
#   promoting it into scripts/checks/ — which run-all.sh auto-discovers and runs
#   under the required "Repo guards" job (run-all.sh:97-113) — would have redded
#   every PR until Sapir pasted the patch, turning her decision into coercion.
#
#   That condition is gone. PR #4743 (MEH-2956) landed the strict form in BOTH
#   workflows: e2e.yml has check_ran "Playwright E2E (Vercel preview)", and
#   deploy.yml carries strict_ok/check_ran on its own legs. Verified against
#   origin/staging on 17/11, not assumed from the PR title.
#
#   So the script changes role: it is no longer an informational report, it is a
#   REGRESSION GUARD. Losing check_ran from either workflow would silently
#   restore the skip-green hole this card exists for, and nothing else in CI
#   would notice. Pass 1 therefore now FAILS on a missing predicate instead of
#   printing "NOT YET". That is a constraint added, never relaxed (rule 32).
#
# NOTE ON FIDELITY (.claude/rules/testing.md — "exercise the real
# implementation, never a copy"): the gate's logic lives inside a YAML `run:`
# block and cannot be sourced. Pass 1 below reads the REAL workflow file to
# detect which predicate is live; Pass 2 exercises a local reproduction of
# both predicates to show they discriminate. Pass 1 is what catches drift
# between this script and the workflow.
#
# Usage:  bash scripts/checks/e2e-gate-selftest.sh
# Exit:   0 = both workflows carry the strict predicate AND the reproduction
#             discriminates
#         1 = a workflow lost check_ran (regression), or the reproduction failed
#             to discriminate -> in the second case this script is wrong
#
# Override WF_DIR to point at a different workflows directory; the
# shown-failing run for this guard uses it (see the PR body).

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WF_DIR="${WF_DIR:-$REPO_ROOT/.github/workflows}"
WF="$WF_DIR/e2e.yml"
WF_DEPLOY="$WF_DIR/deploy.yml"

# ---------------------------------------------------------------- Pass 1
echo "== Pass 1 — live state of the required gates =="
APPLIED=1

# A missing FILE is a different failure from a missing PREDICATE, and saying
# which one it is matters: the first means this guard is looking in the wrong
# place, the second means the hole came back.
for f in "$WF" "$WF_DEPLOY"; do
  if [ ! -f "$f" ]; then
    echo "  ERROR: workflow file not found at $f" >&2
    echo "         (guard is looking in WF_DIR=$WF_DIR — wrong path, not a regression)" >&2
    exit 1
  fi
done

# The leading boundary is load-bearing and was found by the control, not by
# review: a bare substring match also matches a RENAMED predicate such as
# `old_check_ran "Playwright E2E`, so the first version of this guard stayed
# green against a construction that had disabled the gate. Anchor on
# start-of-line or whitespace so a rename reads as the removal it is.
if grep -qE '(^|[[:space:]])check_ran[[:space:]]*"Playwright E2E' "$WF"; then
  echo "  OK        e2e.yml: the E2E leg goes through check_ran/strict_ok."
else
  APPLIED=0
  echo "  REGRESSION e2e.yml: 'check_ran \"Playwright E2E' is gone — the gate accepts" >&2
  echo "             'skipped' for ANY reason again, which is the MEH-1742 hole." >&2
fi

# deploy.yml is item 2b of the same card: the identical skip-green shape on a
# second required aggregator. Guarding only e2e.yml would leave half the fix
# unprotected, and that half is the one nobody remembers.
# Same boundary, and the INVOCATION rather than only the definition: a gate
# that defines check_ran and never calls it is not guarding anything.
if grep -qE '(^|[[:space:]])strict_ok\(\)' "$WF_DEPLOY" &&
  grep -qE '(^|[[:space:]])check_ran\(\)' "$WF_DEPLOY" &&
  grep -qE '(^|[[:space:]])check_ran[[:space:]]*"' "$WF_DEPLOY"; then
  echo "  OK        deploy.yml: carries strict_ok/check_ran on its own legs."
else
  APPLIED=0
  echo "  REGRESSION deploy.yml: strict_ok/check_ran missing — Deploy gate counts a" >&2
  echo "             job that never ran as a pass (MEH-1742 item 2b)." >&2
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

if [ $PASS -eq 0 ]; then
  echo "  SELF-TEST FAIL — this harness no longer models the gate; fix it before trusting it." >&2
  exit 1
fi
echo "  SELF-TEST PASS — the reproduction discriminates exactly scenario A."

# The order matters: a discrimination failure means THIS SCRIPT is wrong and its
# verdict about the workflows is worthless, so it is reported first and alone.
# Only once the harness is known good does its reading of the real files count.
if [ $APPLIED -eq 0 ]; then
  echo >&2
  echo "  GUARD FAIL — a required gate lost its strict predicate (see Pass 1)." >&2
  echo "               Restore check_ran/strict_ok in .github/workflows/; the staged" >&2
  echo "               hunks are docs/ci/e2e-gate-strict-skip.patch.md and" >&2
  echo "               docs/ci/deploy-gate-strict-skip.patch.md. CC cannot write that" >&2
  echo "               path (permissions.deny + sandbox proxy 403, MEH-2486) — a human" >&2
  echo "               pastes it. Landed originally in #4743 (MEH-2956)." >&2
  exit 1
fi
echo "  GUARD PASS — both required gates still refuse a job that did not run."
exit 0
