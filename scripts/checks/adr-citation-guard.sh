#!/usr/bin/env bash
#
# Module:   adr-citation-guard
# Purpose:  An `ADR-NNN (MEH-XXXX)` citation inside a always-loaded rule file must
#           point at the ADR that actually records MEH-XXXX's decision. Catches a
#           citation that resolves to a real file about an unrelated subject —
#           the failure mode that reads as healthy because the link works.
# Does NOT: Judge an ADR's content, its Status, or whether the index in
#           docs/decisions/README.md is complete. It checks one pairing and
#           nothing else. Bare `ADR-NNN` mentions with no adjacent MEH id are
#           deliberately ignored — see "Why the pattern is narrow" below.
# Related:  docs/decisions/README.md (index + the never-edit-an-Accepted-ADR rule),
#           scripts/checks/README.md (guard contract), scripts/checks/run-all.sh
# History:  MEH-1761 (creation — `.claude/rules/workflow.md:43` cited the
#           autonomous-remediation decision as "ADR-017 (MEH-1741)" while
#           ADR-017 is "JWT access token in localStorage". The link resolved, so
#           every reader saw ADR-017 exists ✅ and concluded the queue's merge
#           authority was verified. Same class as MEH-1030: a pointer that stops
#           matching and disables its own guarantee in silence.)
#
# WHY THE PATTERN IS NARROW
#   Only `ADR-NNN` immediately followed by a parenthesised MEH id counts as a
#   citation-with-source — e.g. `ADR-032 ([MEH-1741](…))` or `ADR-032 (MEH-1741)`.
#   Prose that happens to mention both on one line is NOT a citation:
#   `.claude/rules/labels.md:31` reads "…ADR-022); `kosher` (…, MEH-986/1087)",
#   where the MEH ids belong to the kosher clause, not to ADR-022. A same-line
#   heuristic would red that file forever. Grep-level on purpose
#   (scripts/checks/README.md) — simple patterns false-positive, which is what
#   the guard-ok escape hatch is for.
#
# Usage:  bash scripts/checks/adr-citation-guard.sh [--self-test]
# Exit:   0 = pass · 1 = a citation is dangling or names the wrong ADR

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1   # load-bearing: without it a failed cd greps nothing and exits 0

DECISIONS_DIR="docs/decisions"
status=0

fail() { echo "  $*"; status=1; }

# --- the rule, isolated so --self-test can drive the REAL implementation -----
# check_citation FILE LINENO ADR_NUM MEH_ID [decisions_dir]
#   1. docs/decisions/ADR-<num>-*.md must exist         -> else dangling
#   2. that file must mention MEH-<id>                  -> else wrong ADR
check_citation() {
  local file="$1" lineno="$2" adr="$3" meh="$4" dir="${5:-$DECISIONS_DIR}"
  local matches
  matches=$(find "$dir" -maxdepth 1 -name "ADR-${adr}-*.md" 2>/dev/null | LC_ALL=C sort)

  if [ -z "$matches" ]; then
    fail "${file}:${lineno}: cites ADR-${adr} (MEH-${meh}) but ${dir}/ADR-${adr}-*.md does not exist"
    return 1
  fi

  local hit=1 f
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    if grep -q "MEH-${meh}\b" "$f"; then hit=0; fi
  done <<< "$matches"

  if [ "$hit" -ne 0 ]; then
    local titles
    titles=$(head -1 "${matches%%$'\n'*}" | sed 's/^# *//')
    fail "${file}:${lineno}: cites ADR-${adr} as the source for MEH-${meh}, but ADR-${adr} never mentions it"
    fail "        ADR-${adr} is: ${titles}"
    fail "        -> cite the ADR that records MEH-${meh}, or fix the number."
    return 1
  fi
  return 0
}

# guard-ok: <reason> on the line or either neighbour (±1), per scripts/checks/README.md
suppressed() {
  local file="$1" lineno="$2" from=$((lineno > 1 ? lineno - 1 : 1)) to=$((lineno + 1))
  sed -n "${from},${to}p" "$file" 2>/dev/null | grep -q "guard-ok:"
}

scan_file() {
  local file="$1"
  [ -f "$file" ] || return 0
  # ADR-NNN, then up to 4 chars of markdown emphasis/space, then "(" or "([" then MEH-N
  grep -nEo 'ADR-[0-9]{3}[^(]{0,4}\(\[?MEH-[0-9]+' "$file" 2>/dev/null | while IFS= read -r hit; do
    local lineno adr meh
    lineno="${hit%%:*}"
    adr=$(printf '%s' "$hit" | grep -oE 'ADR-[0-9]{3}' | head -1 | cut -d- -f2)
    meh=$(printf '%s' "$hit" | grep -oE 'MEH-[0-9]+'   | head -1 | cut -d- -f2)
    suppressed "$file" "$lineno" && continue
    check_citation "$file" "$lineno" "$adr" "$meh" || echo "VIOLATION" >> "$TMP_FLAG"
  done
}

run_checks() {
  TMP_FLAG=$(mktemp)
  trap 'rm -f "$TMP_FLAG"' EXIT

  local scanned=0 f
  for f in .claude/rules/*.md CLAUDE.md AGENTS.md; do
    [ -f "$f" ] || continue
    scanned=$((scanned + 1))
    scan_file "$f"
  done

  if [ "$scanned" -eq 0 ]; then
    # Fail loud rather than report a green nothing — the MEH-1030 self-disabling class.
    echo "adr-citation-guard: scanned 0 files — expected .claude/rules/*.md to exist." >&2
    return 1
  fi

  if [ -s "$TMP_FLAG" ]; then
    echo "adr-citation-guard FAILED — an always-loaded rule cites the wrong ADR."
    return 1
  fi
  return 0
}

# ---------------------------------------------------------------- self-test
# Drives check_citation directly against a synthetic decisions dir, so the
# assertion exercises the real rule rather than a second copy of it.
self_test() {
  echo "adr-citation-guard --self-test"
  echo
  local st=0 tmp
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' RETURN

  mkdir -p "$tmp/decisions"
  printf '# ADR-017: JWT access token in localStorage\n\nSource: MEH-686\n' \
    > "$tmp/decisions/ADR-017-jwt-access-token-localStorage.md"
  printf '# ADR-032: Autonomous remediation mode\n\nSource: MEH-1741\n' \
    > "$tmp/decisions/ADR-032-autonomous-remediation-mode.md"

  expect() { # expect LABEL WANT_RC adr meh
    local label="$1" want="$2" adr="$3" meh="$4" got
    status=0
    check_citation "fixture.md" 1 "$adr" "$meh" "$tmp/decisions" >/dev/null 2>&1
    got=$?
    if [ "$got" -eq "$want" ]; then
      echo "  OK    $label (rc=$got)"
    else
      echo "  WRONG $label — wanted rc=$want, got rc=$got"; st=1
    fi
  }

  # 1. The real bug, reconstructed: ADR-017 cited as MEH-1741's source.
  expect "the MEH-1761 bug: ADR-017 cited for MEH-1741" 1 017 1741
  # 2. The corrected form must pass — otherwise the guard reds the fixed repo.
  expect "the fix: ADR-032 cited for MEH-1741"          0 032 1741
  # 3. ADR-017's own genuine source still passes (no over-blocking).
  expect "unrelated but correct: ADR-017 for MEH-686"   0 017 686
  # 4. A number with no file at all.
  expect "dangling: ADR-999 for MEH-1741"               1 999 1741

  echo
  if [ "$st" -eq 0 ]; then
    echo "self-test OK — all 4 cases behaved as specified."
    echo "Case 1 vs case 2 is the discriminating pair: the old citation fails,"
    echo "the corrected one passes, and case 3 proves it is not just rejecting ADR-017."
  else
    echo "self-test FAILED."
  fi
  status=0
  return "$st"
}

case "${1:-}" in
  --self-test) self_test ;;
  "")          run_checks; exit "$?" ;;
  *)           echo "usage: $(basename "$0") [--self-test]" >&2; exit 2 ;;
esac
