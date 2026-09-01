#!/usr/bin/env bash
# wake-when.sh — run the WAKE-WHEN checks for every parked card on MEH-2227.
#
# WHAT THIS IS
#   Each parked card carries one condition that, when it becomes true, means the
#   gate holding it has opened and the card returns to the queue. This runs those
#   conditions and prints OPEN / parked. That is all it does.
#
# WHY IT IS NOT IN scripts/checks/
#   run-all.sh auto-discovers *executable* *.sh directly in scripts/checks/ and
#   runs every one of them (see its discovery block). This is a REPORTER, not a
#   guard: it must never influence a PR's verdict. There are two ways to keep it
#   out of the dispatcher, and only one of them is honest:
#     - drop it in scripts/checks/ without +x → run-all.sh prints
#       "NOTICE ... is not executable — not run. (chmod +x to enable)" on EVERY
#       run, forever. That notice exists to catch a guard that silently lost its
#       +x bit (the MEH-1030 self-disabling class). A file deliberately parked in
#       that state trains the reader to ignore the notice, which disarms it.
#     - keep it out of the directory entirely. ← this
#   So scripts/checks/wake-when.sh is deliberately NOT the path used.
#
# EXIT CODE
#   Always 0 — including when checks are OPEN, and including when the control
#   fails. An OPEN result is information, not a failure; nothing here should ever
#   be able to red a PR.
#
# USAGE
#   bash scripts/wake-when.sh            # against origin/staging
#   REF=origin/main bash scripts/wake-when.sh
set -uo pipefail

REF="${REF:-origin/staging}"
cd "$(git rev-parse --show-toplevel)" || exit 0

# The PR-checks workflow the F-9 row reads. Held in a variable, and annotated,
# because the literal filename trips check-rtl.sh: the name begins with the two
# characters of the physical Tailwind padding-end class, so the matcher reads a
# CSS violation in a shell script. False positive, annotated rather than
# allowlisted — .claude/hooks/rtl-allowlist.txt is CC-deny.
PR_CHECKS_WF=".github/workflows/pr-checks.yml"   # rtl-ok: a filename, not a CSS class

printf '\nWAKE-WHEN — parked-card gate checks against %s\n' "$REF"
printf 'as-of %s\n\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ---------------------------------------------------------------------------
# CONTROL — runs FIRST, and every result below is void if it fails.
#
# Without it this reporter has exactly the failure mode it exists to avoid: if
# REF is missing or unfetched, every `git grep -c` returns 0 — and 0 is the
# parked value for some rows and the OPEN value for others. The output would
# look perfectly ordinary and mean nothing. So: prove the ref resolves AND that
# a token known to be present is actually found.
# ---------------------------------------------------------------------------
control_ok=1
git rev-parse --verify --quiet "$REF" >/dev/null || control_ok=0
if [ "$control_ok" = 1 ]; then
  sentinel=$(git grep -c 'class Producer' "$REF" -- backend/app/models/models.py 2>/dev/null | sed 's/.*://' | head -1)
  [ -n "${sentinel:-}" ] && [ "${sentinel:-0}" -ge 1 ] || control_ok=0
fi

if [ "$control_ok" != 1 ]; then
  echo "  CONTROL FAILED — '$REF' does not resolve, or a token known to be present"
  echo "  was not found in it. EVERY result this script could print is void: a"
  echo "  missing ref makes every grep return 0, and 0 is the parked value for"
  echo "  some rows and the OPEN value for others."
  echo "  Fix: git fetch origin staging"
  echo
  echo "wake-when: VOID (control failed). Reporter only — exiting 0."
  exit 0
fi
echo "  control: ok ($REF resolves; sentinel token found)"
echo

open=0; parked=0; skipped=0

count() { git grep -c "$1" "$REF" -- "$2" 2>/dev/null | sed 's/.*://' | head -1 || true; }

report() {   # <card> <desc> <now> <is_open>
  if [ "$4" = 1 ]; then
    printf '  OPEN    %-16s %-34s now=%s\n' "$1" "$2" "$3"; open=$((open + 1))
  else
    printf '  parked  %-16s %-34s now=%s\n' "$1" "$2" "$3"; parked=$((parked + 1))
  fi
}

v=$(count 'LEGACY(2026-10-01, MEH-1855)' backend/app/models/models.py); v=${v:-0}
report "MEH-1855 ch2" "marker gone (wake when 0)"        "$v" "$([ "$v" -eq 0 ] && echo 1 || echo 0)"

v=$(count 'rejection_reason_code' backend/app/models/models.py); v=${v:-0}
report "MEH-2210 A"   "column present (wake when >=1)"   "$v" "$([ "$v" -ge 1 ] && echo 1 || echo 0)"

v=$(count 'the job ran and did not pass' "$PR_CHECKS_WF"); v=${v:-0}
report "MEH-1907 F-9" "F-9 string present (wake >=1)"    "$v" "$([ "$v" -ge 1 ] && echo 1 || echo 0)"

v=$(count 'does not have' .github/workflows/vrt-update.yml); v=${v:-0}
report "MEH-2224"     "false claim gone (wake when 0)"   "$v" "$([ "$v" -eq 0 ] && echo 1 || echo 0)"

v=$(count 'MEH-' .github/pull_request_template.md); v=${v:-0}
report "MEH-2167"     "fewer MEH ids (wake when <4)"     "$v" "$([ "$v" -lt 4 ] && echo 1 || echo 0)"

if git cat-file -e "$REF:.github/CODEOWNERS" 2>/dev/null; then v=1; else v=0; fi
report "MEH-1915 s1"  "CODEOWNERS on base (wake when 1)" "$v" "$v"

echo
echo "  Linear-status checks — real conditions, but they need the API, not git:"
echo "    SKIP    MEH-2189         wake when MEH-2168 is Done"
echo "    SKIP    MEH-1249         wake when MEH-1909 is Done"
skipped=$((skipped + 2))

# ---------------------------------------------------------------------------
# Gates that are decisions, not states. Listed so the set stays complete — a
# reporter that silently omits them reads as "everything is covered".
# Deliberately NOT given invented conditions: the two candidates rejected on
# 01/09 (a token already present for another reason, and a string whose real
# spelling differed by one space) are what an unrun check looks like.
# ---------------------------------------------------------------------------
echo
echo "  Not expressible as a check — a ruling, not a state:"
for c in "MEH-1981      lawyer" \
         "MEH-1938      per-chunk go" \
         "MEH-2210 B/C  per-chunk go" \
         "MEH-1508      per-chunk go" \
         "MEH-2087      brand ruling" \
         "MEH-1694      dispatch on the right ref" \
         "MEH-2226      hooks write + bot command"; do
  echo "    SKIP    $c"
  skipped=$((skipped + 1))
done

printf '\nwake-when: %d OPEN · %d parked · %d skipped. Reporter only — exit 0.\n' \
  "$open" "$parked" "$skipped"
echo "Anything OPEN goes back in the queue (MEH-2227 §4ה)."
exit 0
