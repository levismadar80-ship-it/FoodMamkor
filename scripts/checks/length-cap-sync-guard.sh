#!/usr/bin/env bash
#
# Module:   length-cap-sync-guard.sh
# Purpose:  Fail when a frontend length-cap constant drifts from the backend
#           schema cap it depends on (MEH-1393) — the "keep in sync" comment
#           class of architectural smell #2, replaced by enforcement.
# Touches:  nothing — greps two source files and prints to stdout/stderr.
# Does NOT: police any other client/server contract (routes and methods are
#           scripts/check_api_contract.py's job), and does NOT decide what the
#           caps SHOULD be — it only pins the relationship the code relies on.
# Related:  scripts/checks/run-all.sh (discovers + runs this),
#           scripts/checks/README.md (authoring contract),
#           .claude/rules/workflow.md ("Architectural smell #2").
# History:  MEH-1393 (creation; surfaced by PR #1990's review on MEH-1335).
#
# THE INVARIANTS (verified against the code, not the ticket's assumption)
#   1. OWNER_BIO_MAX (cards.jsx) == the owner_bio sanitize cap (schemas.py).
#      A true mirror: the UI counter and the server truncation must agree.
#   2. DESC_MAX     <= every description sanitize cap in schemas.py.
#   3. TAGLINE_MAX  <= every short_description cap in schemas.py.
#      2-3 are DELIBERATELY tighter UX caps (150 vs 2000; 160 vs 160/200) —
#      the failure mode is the client allowing MORE than the server accepts,
#      which silently truncates server-side. Equality is not required there.
#
#   If any value cannot be extracted the guard FAILS — it must never report
#   OK for a check it did not perform (MEH-420 decorative-guard precedent).
#
# USAGE
#   bash scripts/checks/length-cap-sync-guard.sh              # run the checks
#   bash scripts/checks/length-cap-sync-guard.sh --self-test  # prove it can fail
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# `|| exit 1` is load-bearing (SC2164) — see scripts/checks/README.md.
cd "$REPO_ROOT" || exit 1

CARDS="frontend/app/[locale]/producer/dashboard/edit/cards.jsx"
SCHEMAS="backend/app/schemas/schemas.py"

status=0

fail() {
  echo "  FAIL $1"
  status=1
}

# --- extraction helpers (grep-level on purpose — see README contract) -------

# First numeric literal assigned to a `const NAME = N;` in cards.jsx.
client_const() {
  sed -n "s/^const $1 = \([0-9][0-9]*\);.*/\1/p" "$CARDS" | head -n 1
}

# Every max_length=N on the line(s) following a field_validator("<field>")
# decorator's function body, plus Field(... max_length=N) on the field's own
# declaration line. Prints one number per line.
server_caps() {
  local field="$1"
  # sanitize_text(v, max_length=N) inside the validator registered for $field
  grep -A 3 "field_validator(\"$field\")" "$SCHEMAS" \
    | sed -n 's/.*max_length=\([0-9][0-9]*\).*/\1/p'
  # Field(..., max_length=N) on the declaration itself
  grep "^\s*$field:.*max_length=\([0-9]\)" "$SCHEMAS" \
    | sed -n 's/.*max_length=\([0-9][0-9]*\).*/\1/p'
}

# --- the rule, isolated so --self-test can drive it directly ----------------
# check_equal NAME client server_caps…   → every server cap must equal client
# check_lte   NAME client server_caps…   → client must be <= every server cap
check_equal() {
  local name="$1" client="$2"; shift 2
  [ -n "$client" ] || { fail "$name: client constant not found in $CARDS"; return; }
  [ "$#" -gt 0 ] || { fail "$name: no server cap found in $SCHEMAS"; return; }
  local cap
  for cap in "$@"; do
    if [ "$client" -ne "$cap" ]; then
      fail "$name: client=$client != server=$cap ($CARDS:1 vs $SCHEMAS:1)"
      return
    fi
  done
  echo "  OK   $name: client=$client == server ($*)"
}

check_lte() {
  local name="$1" client="$2"; shift 2
  [ -n "$client" ] || { fail "$name: client constant not found in $CARDS"; return; }
  [ "$#" -gt 0 ] || { fail "$name: no server cap found in $SCHEMAS"; return; }
  local cap
  for cap in "$@"; do
    if [ "$client" -gt "$cap" ]; then
      fail "$name: client=$client > server=$cap — the UI would accept input the server truncates"
      return
    fi
  done
  echo "  OK   $name: client=$client <= server ($*)"
}

run_checks() {
  echo "length-cap-sync-guard (MEH-1393)"
  echo

  # shellcheck disable=SC2046 — word-splitting the cap lists is intended.
  check_equal "OWNER_BIO_MAX / owner_bio" "$(client_const OWNER_BIO_MAX)" $(server_caps owner_bio)
  check_lte   "DESC_MAX / description"    "$(client_const DESC_MAX)"      $(server_caps description)
  check_lte   "TAGLINE_MAX / short_description" "$(client_const TAGLINE_MAX)" $(server_caps short_description)

  echo
  if [ "$status" -eq 0 ]; then
    echo "length-cap-sync-guard OK."
  else
    echo "length-cap-sync-guard FAILED — a mirrored length cap drifted."
    echo "  Fix the side that changed unintentionally; both files are named above."
  fi
  return "$status"
}

self_test() {
  echo "length-cap-sync-guard --self-test"
  echo
  local st=0

  # A drifted mirror must fail…
  status=0
  check_equal "fixture-equal" 300 200 >/dev/null
  [ "$status" -eq 1 ] || { echo "[XX] equal-check missed a drift"; st=1; }

  # …a matching mirror must pass…
  status=0
  check_equal "fixture-equal" 300 300 >/dev/null
  [ "$status" -eq 0 ] || { echo "[XX] equal-check false-positived"; st=1; }

  # …a client cap above the server cap must fail…
  status=0
  check_lte "fixture-lte" 250 200 >/dev/null
  [ "$status" -eq 1 ] || { echo "[XX] lte-check missed an overshoot"; st=1; }

  # …a tighter client cap must pass…
  status=0
  check_lte "fixture-lte" 150 2000 200 >/dev/null
  [ "$status" -eq 0 ] || { echo "[XX] lte-check false-positived"; st=1; }

  # …and a missing extraction must fail, never silently pass.
  status=0
  check_equal "fixture-missing" "" 300 >/dev/null
  [ "$status" -eq 1 ] || { echo "[XX] missing client value slipped through"; st=1; }
  status=0
  check_equal "fixture-missing" 300 >/dev/null
  [ "$status" -eq 1 ] || { echo "[XX] missing server cap slipped through"; st=1; }

  if [ "$st" -eq 0 ]; then
    echo "self-test OK — all 6 cases behaved as specified."
  else
    echo "self-test FAILED."
  fi
  return "$st"
}

case "${1:-}" in
  --self-test) self_test ;;
  "")          run_checks ;;
  *)           echo "usage: $(basename "$0") [--self-test]" >&2; exit 2 ;;
esac
