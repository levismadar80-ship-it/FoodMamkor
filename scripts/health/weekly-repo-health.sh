#!/usr/bin/env bash
#
# Module:   weekly-repo-health.sh
# Purpose:  The machine half of the weekly repo health scan: run every
#           date-, age- and dead-code check that must not run on each PR, and
#           print one report the scheduled session turns into Linear cards and
#           a short Hebrew summary for Sapir.
# Touches:  nothing. Reads the tree and git history; needs a full (unshallow)
#           clone and network for `uvx vulture`.
# Does NOT: open cards, delete files, or fail anything. Every section prints
#           its own self-test first, so a dead probe reads as ERROR, not as
#           "nothing found" (testing.md «probe whose null output…»).
# Related:  scripts/health/README.md · scripts/checks/run-all.sh (the per-PR
#           guards) · MEH-3143 (the scan's first spec) · MEH-3615 (this file).
# History:  MEH-3615 (creation, 21/11/2026).
#
# Usage:    bash scripts/health/weekly-repo-health.sh
set -uo pipefail
cd "$(cd "$(dirname "$0")/../.." && pwd)" || exit 2
H=scripts/health
section() { printf '\n===== %s =====\n' "$1"; }

if [ "$(git rev-parse --is-shallow-repository)" = "true" ]; then
  git fetch -q --unshallow --filter=blob:none origin || echo "ERROR: could not unshallow — age-based sections are void"
fi

section "1. Orphan folders (no live reference, untouched 60 days)"
bash $H/orphan-folder-scan.sh --self-test >/dev/null && echo "self-test ok" || echo "ERROR: self-test failed — section 1 is void"
bash $H/orphan-folder-scan.sh || echo "ERROR: scan failed (rc $?)"

section "2. Folders whose Re-check date has come"
bash $H/recheck-date-scan.sh --self-test >/dev/null && echo "self-test ok" || echo "ERROR: self-test failed — section 2 is void"
bash $H/recheck-date-scan.sh || echo "ERROR: scan failed (rc $?)"

section "3. Python dead code (vulture ≥ 80%), new since the baseline"
base=$(grep -v -e '^#' -e '^[[:space:]]*$' $H/vulture-baseline.txt)   # a blank line would match every finding
if v=$(uvx --quiet vulture==2.16 backend/app --min-confidence 80 2>&1; true); then
  found=$(printf '%s\n' "$v" | grep '% confidence)' | sed -E 's/:[0-9]+:/:/')
  total=$(printf '%s\n' "$found" | grep -c . || true)
  [ "$total" -eq 0 ] && echo "ERROR: vulture printed no finding at all; the baseline is not empty — section 3 is void (output: ${v:0:200})"
  printf '%s\n' "$found" | grep . | grep -vxF -f <(printf '%s\n' "$base") | sed 's/^/NEW: /'
  printf '%s\n' "$base" | grep -vxF -f <(printf '%s\n' "$found" | grep .) | sed 's/^/GONE (remove from the baseline): /'
  echo "vulture: $total finding(s), baseline $(printf '%s\n' "$base" | grep -c .)"
fi

section "3b. Python functions nobody calls (vulture ≥ 60%, services + utils), new since the baseline"
# MEH-3714: an orphan function scores 60%, so section 3 (80%) never sees one.
# The whole app is scanned so callers in routers count; only services/utils
# are reported, because a router handler at 60% is a decorated route.
fbase=$(grep -v -e '^#' -e '^[[:space:]]*$' $H/vulture-functions-baseline.txt)
if fv=$(uvx --quiet vulture==2.16 backend/app --min-confidence 60 2>&1; true); then
  ffound=$(printf '%s\n' "$fv" | grep "unused function" | grep -E '^backend/app/(services|utils)/' | sed -E 's/:[0-9]+:/:/')
  ftotal=$(printf '%s\n' "$fv" | grep -c "unused function" || true)
  [ "$ftotal" -eq 0 ] && echo "ERROR: vulture reported no unused function anywhere in backend/app — section 3b is void (output: ${fv:0:200})"
  printf '%s\n' "$ffound" | grep . | grep -vxF -f <(printf '%s\n' "$fbase") | sed 's/^/NEW: /'
  printf '%s\n' "$fbase" | grep -vxF -f <(printf '%s\n' "$ffound" | grep .) | sed 's/^/GONE (remove from the baseline): /'
  echo "vulture functions: $(printf '%s\n' "$ffound" | grep -c .) in services/utils, baseline $(printf '%s\n' "$fbase" | grep -c .)"
fi

section "4. Frontend dead code (knip ratchet baseline, CI blocks any rise)"
awk -F'\t' '!/^#/ && NF==3 {s[$2]+=$3} END {for (k in s) printf "  %-16s %s\n", k, s[k]}' scripts/checks/lint-ratchet-baseline.tsv | LC_ALL=C sort
echo "(grandfathered findings; a falling number is progress, a rise cannot merge)"

section "5. Expiry dates (docs/ACCESS.md §9, code LEGACY markers)"
bash scripts/checks/expiry-register-check.sh || echo "ERROR: expiry-register-check rc $?"
bash scripts/checks/legacy-expiry-check.sh >/dev/null 2>&1 && echo "legacy-expiry-check: nothing past its date" || bash scripts/checks/legacy-expiry-check.sh 2>&1 | tail -20

section "6. Per-PR guards that only warn"
ra=$(bash scripts/checks/run-all.sh 2>&1)
if ! printf '%s\n' "$ra" | grep -q '^Guard summary ('; then
  echo "ERROR: run-all.sh printed no Guard summary — section 6 is void (last lines: $(printf '%s\n' "$ra" | tail -3 | tr '\n' ' '))"
else
  printf '%s\n' "$ra" | grep -E '^\s*(WARN|FAIL)\b' || echo "run-all: no WARN or FAIL lines"
  # the warning text, not only the guard names: run-all prints each block between these rules
  printf '%s\n' "$ra" | awk '/^───── (WARN|FAIL): /{on=1} on{print} /^───── end /{on=0}' | head -60
fi
