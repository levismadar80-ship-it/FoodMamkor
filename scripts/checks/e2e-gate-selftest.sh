#!/usr/bin/env bash
# e2e-gate-selftest.sh — MEH-1742 item 6
#
# Asserts that the two required aggregators still REFUSE a job that did not
# run. MEH-1742 exists because `skipped` and `success` reached `E2E gate` as the
# same token, so a suite that never ran reported a pass.
#
# WHAT IT CHECKS, AND WHAT IT CANNOT
#   The gate's logic lives inside a YAML `run:` block and cannot be sourced, so
#   this reads the real workflow text. That makes it a check on the gate's
#   SHAPE, not a behavioural test of a live run — but the shape is checked at
#   the four places a regression would actually land:
#     1. `strict_ok`'s BODY is exactly `success` (not `success|skipped`).
#        Checking only that the name exists is worthless: flipping the body
#        restores the whole hole and leaves every name in place.
#     2. the E2E leg is reached through `check_ran`, not `check`.
#     3. the condition that routes it there still consults the paths filter
#        (FRONTEND_TOUCHED / BACKEND_TOUCHED) — a hard-false condition sends
#        every run down the lenient branch while the call site reads fine.
#     4. deploy.yml guards BOTH of its legs, not one. (The first draft of this
#        guard required one, which let either leg be reverted silently.)
#   Comments are stripped before any match, because `# check_ran "Playwright
#   E2E` satisfies a naive grep while the live gate calls plain `check`. The
#   repo's own gate-wiring-guard.sh strips comments for the same reason.
#   Comment stripping is textual (`#` to end of line); these blocks contain no
#   `#` inside a string, which is why that is sufficient here.
#
# WHAT IT DELIBERATELY DOES NOT DO
#   An earlier version carried a "Pass 2" that defined its own ok/strict_ok/
#   check_ran inside a heredoc and asserted THOSE discriminate. That is a
#   tautology: it never read the workflow, passed against any content, and had
#   already drifted from the real gate (no `cancelled` branch, no
#   BACKEND_TOUCHED, no OTHER_LABEL, no IS_DEPENDABOT — it modelled the
#   pre-MEH-2956 gate). It printed "SELF-TEST PASS", which read as evidence and
#   was none. Removing it shrinks nothing: it could not fail on a real
#   regression, so the set of caught violations is unchanged (rule 32 judges by
#   outcome). Found by the fresh reviewer on PR #4750.
#
# WHY IT NOW LIVES IN scripts/checks/
#   It used to sit in scripts/ because it reported a KNOWN-UNAPPLIED state:
#   promoting it into scripts/checks/ — which run-all.sh auto-discovers and runs
#   under the required "Repo guards" job — would have redded every PR until the
#   patch was pasted, turning a decision into coercion. That condition is gone:
#   #4743 (MEH-2956) landed the strict form in both workflows. So the script
#   changes role, from an informational report to a blocking regression guard.
#
# A FALSE RED IS POSSIBLE AND IS THE INTENDED TRADE
#   A legitimate refactor — renaming the helper, single-quoting the label,
#   moving the gate into a composite action — reds this guard until the
#   expectations below are updated too. That is a tripwire on a deliberately
#   narrow shape, not a claim that the refactor broke anything, and the failure
#   message says so.
#
# Usage:  bash scripts/checks/e2e-gate-selftest.sh
# Exit:   0 = both gates still refuse a job that did not run
#         1 = a gate lost part of that shape, or a workflow file is missing
#
# Override WF_DIR to run against copies of the workflows; the shown-failing
# runs for this guard use it, since .github/workflows/** is CC-deny.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WF_DIR="${WF_DIR:-$REPO_ROOT/.github/workflows}"
WF_E2E="$WF_DIR/e2e.yml"
WF_DEPLOY="$WF_DIR/deploy.yml"

fail=0
note() { echo "  OK        $1"; }
bad() {
  echo "  REGRESSION $1" >&2
  fail=1
}

# A missing FILE is a different failure from a missing PREDICATE, and saying
# which it is matters: the first means this guard is looking in the wrong place,
# the second means the hole came back.
for f in "$WF_E2E" "$WF_DEPLOY"; do
  if [ ! -f "$f" ]; then
    echo "  ERROR: workflow file not found at $f" >&2
    echo "         (WF_DIR=$WF_DIR — a wrong path, not a regression)" >&2
    exit 1
  fi
done

# Strip comments, then collapse runs of whitespace so a reflowed line still
# matches on content rather than on spacing.
strip() { sed 's/#.*$//' "$1" | tr -s '[:space:]' ' '; }
E2E_TEXT="$(strip "$WF_E2E")"
DEPLOY_TEXT="$(strip "$WF_DEPLOY")"

echo "== the strict predicate's BODY =="
# This is the check the first draft of this guard was missing, and the one that
# matters most: every other assertion here passes unchanged if the body is
# widened to success|skipped, and the MEH-1742 hole is fully restored.
STRICT_BODY='strict_ok() { case "$1" in success) return 0 ;; *) return 1 ;; esac; }'
for pair in "e2e.yml:$E2E_TEXT" "deploy.yml:$DEPLOY_TEXT"; do
  name="${pair%%:*}"
  text="${pair#*:}"
  if [ "${text#*"$STRICT_BODY"}" != "$text" ]; then
    note "$name: strict_ok accepts ONLY 'success'."
  else
    bad "$name: strict_ok's body is not exactly 'in success)' — a widened body"
    echo "             (e.g. success|skipped) restores the MEH-1742 hole while every" >&2
    echo "             call site still reads correctly." >&2
  fi
done

echo
echo "== e2e.yml: the E2E leg, and the condition that routes it =="
if [ "${E2E_TEXT#*'check_ran "Playwright E2E'}" != "$E2E_TEXT" ]; then
  note "e2e.yml: the E2E leg goes through check_ran."
else
  bad "e2e.yml: no check_ran call on the Playwright E2E leg — a skipped suite"
  echo "             counts as a pass again." >&2
fi

# The call site is not enough: a hard-false condition routes every run to the
# lenient `check` branch while `check_ran` still appears in the file. Assert the
# condition consults the paths filter.
GUARD_LINE="$(sed 's/#.*$//' "$WF_E2E" | grep -n 'check_ran "Playwright E2E' | head -1 | cut -d: -f1)"
if [ -n "$GUARD_LINE" ]; then
  COND="$(sed 's/#.*$//' "$WF_E2E" | sed -n "$((GUARD_LINE > 3 ? GUARD_LINE - 3 : 1)),$((GUARD_LINE - 1))p")"
  if printf '%s' "$COND" | grep -q 'FRONTEND_TOUCHED' &&
    printf '%s' "$COND" | grep -q 'BACKEND_TOUCHED'; then
    note "e2e.yml: the routing condition still reads the paths filter."
  else
    bad "e2e.yml: the condition above the check_ran call no longer consults"
    echo "             FRONTEND_TOUCHED/BACKEND_TOUCHED — every run then takes the" >&2
    echo "             lenient branch while the call site still reads correctly." >&2
  fi

  # Naming the variables is NOT enough, and this is the subtle one: a constant
  # short-circuit in front of them (`if false && [ "$IS_DEPENDABOT" ... ]`)
  # leaves FRONTEND_TOUCHED and BACKEND_TOUCHED in the text while routing every
  # run to the lenient branch. The check above passed that mutation; this one
  # catches it. Narrow by design — it looks for a folded constant, it does not
  # evaluate the condition.
  if printf '%s' "$COND" | grep -qE '(^|[[:space:]])(if|&&|\|\|)[[:space:]]+(false|true)([[:space:]]|$|;)'; then
    bad "e2e.yml: the routing condition contains a constant (true/false) term —"
    echo "             a folded constant disables the strict branch without removing" >&2
    echo "             any of the names this guard looks for." >&2
  else
    note "e2e.yml: no constant short-circuit folded into that condition."
  fi
fi

echo
echo "== deploy.yml: BOTH enforced legs =="
LEGS="$(printf '%s' "$DEPLOY_TEXT" | grep -o 'check_ran "' | wc -l | tr -d ' ')"
if [ "${DEPLOY_TEXT#*'check_ran() {'}" != "$DEPLOY_TEXT" ] && [ "$LEGS" -ge 2 ]; then
  note "deploy.yml: check_ran defined and invoked on $LEGS legs (needs >= 2)."
else
  bad "deploy.yml: check_ran is defined on $LEGS leg(s); both the lint and the"
  echo "             api-contract legs must be enforced (MEH-1742 item 2b)." >&2
  echo "             Requiring only one lets either be reverted silently." >&2
fi

echo
if [ $fail -ne 0 ]; then
  echo "  GUARD FAIL — a required gate no longer refuses a job that did not run." >&2
  echo "               The strict form landed in #4743 (MEH-2956); losing it means a" >&2
  echo "               suite that never ran reports a pass. Restore it in" >&2
  echo "               .github/workflows/ — CC cannot write that path" >&2
  echo "               (permissions.deny + sandbox proxy 403, MEH-2486), so a human" >&2
  echo "               commits it." >&2
  echo "               If instead the gate was deliberately REFACTORED and is still" >&2
  echo "               strict, update the expectations in this script in the same PR —" >&2
  echo "               see 'A FALSE RED IS POSSIBLE' in its header." >&2
  exit 1
fi
echo "  GUARD PASS — both required gates still refuse a job that did not run."
exit 0
