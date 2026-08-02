#!/usr/bin/env bash
#
# Module:   legacy-expiry-check.sh
# Purpose:  Give every expand/contract overlap an expiry date that CI enforces,
#           so a "temporary" legacy path cannot quietly become permanent. The
#           date IS the mechanism — no Linear API, no network, no bookkeeping.
# Touches:  nothing — reads tracked source files and prints to stdout/stderr.
# Does NOT: police what the legacy code DOES, open or close tickets, or sweep
#           pre-existing plain-English "legacy" comments (see GRANDFATHER).
#           It also does not decide whether an expiry should be extended —
#           that is a human call, made by editing the date in a reviewed PR.
# Related:  scripts/checks/README.md (the authoring contract this follows),
#           scripts/checks/changelog-branch-guard.sh (conventions mirrored),
#           docs/MIGRATIONS.md (the convention, written up),
#           docs/decisions/ADR-007-expand-contract-schema-changes.md.
# History:  MEH-1857 (creation).
#
# WHY THIS EXISTS
#   Three live overlaps were found on 02/08, all the same shape — an expand
#   shipped, the contract was promised "in a separate PR", and nothing ever
#   forced the second step:
#     * producer_me.py — "7-day overlap ... Phase 4 (separate PR)", ~14 months old
#     * models.py      — "legacy alias for price_range", no date, no ticket
#     * models.py      — products.price_range, follow-up ticket never opened
#   A FOURTH turned up in the guide that mandates Expand-Contract: MIGRATIONS.md
#   cited "MEH-456 (Phase 4)" as the canonical example, and MEH-456 does not
#   exist in Linear. The counter-example is MEH-293, which DID complete. The
#   difference is not diligence — a forgotten date has nothing to remind anyone.
#   This turns "we'll finish it later" into a dated claim a check can falsify.
#
# THE CONVENTION
#   LEGACY(YYYY-MM-DD, MEH-1234)
#   anywhere in a comment, alongside whatever prose you were going to write.
#   The date is when the overlap must be GONE; the ticket is who removes it.
#
#   FAIL when the date is in the past      → finish the contract, or extend the
#                                            date deliberately in a reviewed PR
#   FAIL when a marker is malformed (missing/non-ISO date, missing ticket) →
#        a marker that cannot expire is the loophole that recreates the very
#        problem this guard exists to close
#   PASS when the date is today or later
#
# GRANDFATHER (deliberate, not an oversight)
#   Plain-English "legacy" comments WITHOUT the marker are IGNORED. There is no
#   retroactive sweep: this guard governs new debt and the three seeded sites
#   only. Retrofitting every historical "legacy" mention would produce a wall of
#   red with no owner per line, and a guard nobody can green gets disabled.
#
# ESCAPE HATCH — asymmetric ON PURPOSE (README.md `guard-ok: <reason>`)
#   `guard-ok: <reason>` on the line or either neighbour suppresses a MALFORMED
#   finding, and NEVER an EXPIRED one.
#
#   The hatch exists for "the guard misidentified this line" — e.g. a comment in
#   backend/ that quotes the marker template while explaining the convention,
#   which this scanner cannot distinguish from a real marker. That is a false
#   positive and deserves an out.
#
#   An expired date is not a misidentification; it is the finding. Letting
#   `guard-ok` silence it would rebuild the exact hole this guard closes — one
#   comment and the overlap is exempt forever, which is the "LEGACY(someday)"
#   loophole wearing a different hat. To stop an expiry failing, either finish
#   the contract or move the date where a reviewer sees it.
#
# USAGE
#   bash scripts/checks/legacy-expiry-check.sh              # guard the tree
#   bash scripts/checks/legacy-expiry-check.sh --self-test  # prove it discriminates
#
#   Discovered and run automatically by scripts/checks/run-all.sh under the
#   required "Repo guards" job — no workflow edit (.github/workflows/** is
#   CC-deny, MEH-671; this directory exists precisely so guards are a file drop).
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# `|| exit 1` is load-bearing (SC2164) — see scripts/checks/README.md: a failed
# cd would leave this grepping the wrong tree, matching nothing, and exiting 0.
cd "$REPO_ROOT" || exit 1

# Directories scanned in a real run. The fixture lives OUTSIDE them on purpose:
# it holds deliberately-expired markers, so scanning it would make every run red
# forever — the guard failing on its own test data.
SCAN_DIRS=("backend" "frontend")
FIXTURE_REL="scripts/fixtures/legacy-expiry-fixture.txt"

# A well-formed marker. Anchored on the literal keyword so a malformed one is
# still DETECTED below rather than silently skipped.
VALID_RE='LEGACY\([0-9]{4}-[0-9]{2}-[0-9]{2}, MEH-[0-9]+\)'
ANY_RE='LEGACY\('

# ---------------------------------------------------------------------------
# scan_paths — emit "file:line:content" for every line carrying the keyword.
# git ls-files so untracked scratch files and node_modules never count.
# ---------------------------------------------------------------------------
scan_paths() {
  local dirs=("$@")
  # -H is load-bearing, not decoration: grep omits the `file:` prefix when it
  # receives exactly ONE file argument, and xargs is free to split a long list
  # into batches whose last one may hold a single file. Without -H that batch
  # would emit `line:content`, and check_lines' `cut -d: -f1` would read the
  # LINE NUMBER as the filename and shift every field after it — silently
  # misclassifying real markers instead of erroring. Today the repo passes in
  # one batch of ~1185 files so the prefix is always present, which is exactly
  # what makes this the kind of latent bug that surfaces after an unrelated
  # re-org. Found by the CI adversarial reviewer on PR #2541.
  # -I skips binary; `|| true` keeps a no-match grep (exit 1) from killing us.
  git ls-files -z -- "${dirs[@]}" 2>/dev/null |
    xargs -0 -r grep -HInE "$ANY_RE" 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# suppressed <file> <lineno> — is there a `guard-ok: <reason>` within ±1 line?
# Mirrors ui-pattern-guard.sh / the rtl-ok idiom. A bare `guard-ok` with no
# reason does NOT count: the point is that the next reader learns why.
# ---------------------------------------------------------------------------
suppressed() {
  local file="$1" lineno="$2" start end
  [ -f "$file" ] || return 1
  start=$(( lineno > 1 ? lineno - 1 : 1 ))
  end=$(( lineno + 1 ))
  sed -n "${start},${end}p" "$file" 2>/dev/null | grep -qE 'guard-ok:[[:space:]]*[^[:space:]]'
}

# ---------------------------------------------------------------------------
# check_lines — the rule. Reads "file:line:content" on stdin, prints offenders,
# returns 1 if any. Isolated from how lines were gathered so --self-test drives
# the real rule over fixture data.
#
# $1 = today as YYYY-MM-DD (injectable: the self-test pins it so the fixture's
#      "future" marker cannot rot into a failure in ~2 years — exactly the
#      silent decay this guard exists to prevent).
# ---------------------------------------------------------------------------
check_lines() {
  local today="$1"
  local expired=() malformed=() total=0 skipped=0
  local line loc content date_str file lineno

  while IFS= read -r line; do
    [ -n "$line" ] || continue
    total=$(( total + 1 ))
    # file:line:content — content may contain colons, so cut the first two only.
    file="$(printf '%s' "$line" | cut -d: -f1)"
    lineno="$(printf '%s' "$line" | cut -d: -f2)"
    loc="$file:$lineno"
    content="$(printf '%s' "$line" | cut -d: -f3-)"

    if ! printf '%s' "$content" | grep -qE "$VALID_RE"; then
      # Malformed IS suppressible — see ESCAPE HATCH in the header.
      if suppressed "$file" "$lineno"; then
        skipped=$(( skipped + 1 ))
        continue
      fi
      malformed+=("$loc|$(printf '%s' "$content" | sed 's/^[[:space:]]*//')")
      continue
    fi

    date_str="$(printf '%s' "$content" | grep -oE "$VALID_RE" | head -n 1 |
                sed -E 's/LEGACY\(([0-9]{4}-[0-9]{2}-[0-9]{2}).*/\1/')"
    # ISO-8601 sorts lexically, so this needs no date arithmetic.
    # NOTE: deliberately NOT suppressible. An expired date is the finding.
    if [[ "$date_str" < "$today" ]]; then
      expired+=("$loc|$date_str|$(printf '%s' "$content" | grep -oE 'MEH-[0-9]+' | head -n 1)")
    fi
  done

  echo "  scanned $total marker(s); today is $today"
  [ "$skipped" -gt 0 ] && echo "  $skipped malformed finding(s) suppressed by guard-ok"

  if [ ${#expired[@]} -eq 0 ] && [ ${#malformed[@]} -eq 0 ]; then
    echo "  no expired or malformed markers. OK."
    return 0
  fi

  local entry
  if [ ${#malformed[@]} -gt 0 ]; then
    echo
    echo "  MALFORMED — a marker that cannot expire is not a marker:"
    for entry in "${malformed[@]}"; do
      echo "    ${entry%%|*}  ${entry#*|}"
    done
    echo "    expected form: LEGACY(YYYY-MM-DD, MEH-1234)"
    echo "    false positive (e.g. quoting the template in prose)? add"
    echo "    'guard-ok: <reason>' on that line or either neighbour."
  fi

  if [ ${#expired[@]} -gt 0 ]; then
    echo
    echo "  EXPIRED — the contract step is overdue:"
    for entry in "${expired[@]}"; do
      local loc_p date_p ticket_p
      loc_p="${entry%%|*}"; entry="${entry#*|}"
      date_p="${entry%%|*}"; ticket_p="${entry#*|}"
      echo "    $loc_p  expired $date_p  ($ticket_p)"
    done
    echo
    echo "  FIX, one of two — both are decisions, which is the point:"
    echo "    (a) finish the contract: remove the legacy path and this marker"
    echo "    (b) extend deliberately: edit the date in this PR, so a reviewer"
    echo "        sees the overlap being prolonged instead of it lapsing quietly"
    echo "    guard-ok does NOT suppress this — see ESCAPE HATCH in the header."
  fi
  return 1
}

# ---------------------------------------------------------------------------
# --self-test — drive the REAL rule over the fixture: one expired, one future,
# one malformed, one grandfathered, one malformed-but-suppressed. Asserts the
# verdict AND the counts: a guard that fails for the wrong reason, or that also
# flags the future marker, is not doing its job. Run this before any green.
# ---------------------------------------------------------------------------
self_test() {
  local fixture="$REPO_ROOT/$FIXTURE_REL"
  local pinned_today="2026-08-02"
  local out rc status=0 n_expired n_malformed

  echo "legacy-expiry-check --self-test"
  echo "  fixture: $FIXTURE_REL"
  echo "  today pinned to $pinned_today (so the future marker cannot rot)"
  echo

  if [ ! -f "$fixture" ]; then
    echo "  [XX] fixture missing at $fixture"
    return 1
  fi

  out="$(grep -InE "$ANY_RE" "$fixture" | sed "s#^#$FIXTURE_REL:#" |
         check_lines "$pinned_today" 2>&1)"
  rc=$?
  printf '%s\n' "$out" | sed 's/^/     /'
  echo

  if [ "$rc" -eq 0 ]; then
    echo "  [XX] expected exit 1 on the fixture, got 0"
    status=1
  else
    echo "  [ok] exit 1 as expected"
  fi

  # Both reasons, counted. Exit code alone would pass a guard that found one
  # offender and missed the other entirely.
  n_expired="$(printf '%s\n' "$out" | grep -cE 'expired 2[0-9]{3}-')"
  n_malformed="$(printf '%s\n' "$out" | grep -cE '^ +[^ ]+:[0-9]+ +.*LEGACY\(')"

  if [ "$n_expired" -eq 1 ]; then
    echo "  [ok] exactly 1 expired marker reported"
  else
    echo "  [XX] expected 1 expired marker, got $n_expired"
    status=1
  fi

  if [ "$n_malformed" -eq 1 ]; then
    echo "  [ok] exactly 1 malformed marker reported"
  else
    echo "  [XX] expected 1 malformed marker, got $n_malformed"
    status=1
  fi

  # The discriminating half: a guard that flagged everything would satisfy the
  # exit-code check while being useless, and would red every PR in the repo.
  if printf '%s' "$out" | grep -q "2099-01-01"; then
    echo "  [XX] the future marker (2099-01-01) was reported — guard over-fires"
    status=1
  else
    echo "  [ok] the future marker was correctly ignored"
  fi

  # GRANDFATHER: the fixture's plain "legacy" line carries a canary string. If
  # the scan ever widens to bare "legacy", it surfaces here instead of silently.
  if printf '%s' "$out" | grep -q "GRANDFATHERED-CANARY"; then
    echo "  [XX] a plain 'legacy' comment was picked up — grandfather clause broken"
    status=1
  else
    echo "  [ok] plain 'legacy' prose ignored (grandfather clause holds)"
  fi

  # ESCAPE HATCH: malformed + guard-ok must be suppressed and COUNTED as such,
  # so a hatch that silently stopped working shows up as a missing line.
  if printf '%s' "$out" | grep -q "1 malformed finding(s) suppressed by guard-ok"; then
    echo "  [ok] guard-ok suppressed exactly 1 malformed finding"
  else
    echo "  [XX] the guard-ok fixture case was not suppressed"
    status=1
  fi
  if printf '%s' "$out" | grep -q "SUPPRESSED-CANARY"; then
    echo "  [XX] the guard-ok case was still reported — hatch not applied"
    status=1
  fi

  # scan_paths' OUTPUT SHAPE. The cases above feed check_lines directly, so
  # none of them exercises the real scanner — which is precisely where the
  # single-file `grep` prefix bug lived (PR #2541 review). Drive scan_paths
  # over a ONE-file list, the batch size that drops the prefix without -H, and
  # assert the first field is the path rather than the line number.
  local one_file shape
  one_file="$(git ls-files -- backend frontend | xargs -r grep -lE "$ANY_RE" 2>/dev/null | head -n 1)"
  if [ -z "$one_file" ]; then
    echo "  [--] no marker-bearing file to shape-check (skipped)"
  else
    shape="$(printf '%s\0' "$one_file" | xargs -0 -r grep -HInE "$ANY_RE" 2>/dev/null | head -n 1)"
    if printf '%s' "$shape" | grep -qE '^[^:]+/[^:]*:[0-9]+:'; then
      echo "  [ok] single-file scan keeps the file:line: prefix"
    else
      echo "  [XX] single-file scan lost the filename prefix — got: $shape"
      echo "       check_lines would read the line number as the filename."
      status=1
    fi
  fi

  echo
  if [ "$status" -eq 0 ]; then
    echo "self-test OK — expired / future / malformed / grandfathered / suppressed / scan-shape all sorted correctly."
  else
    echo "self-test FAILED."
  fi
  return "$status"
}

main() {
  echo "legacy-expiry-check (MEH-1857) — every overlap carries an expiry"
  echo

  local today
  today="$(date +%F)"

  if ! scan_paths "${SCAN_DIRS[@]}" | check_lines "$today"; then
    echo
    echo "legacy-expiry-check FAILED."
    exit 1
  fi

  echo
  echo "legacy-expiry-check OK."
  exit 0
}

case "${1:-}" in
  --self-test) self_test ;;
  "")          main ;;
  *)           echo "usage: $(basename "$0") [--self-test]" >&2; exit 2 ;;
esac
