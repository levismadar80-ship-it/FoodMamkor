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
# Related:  scripts/checks/changelog-branch-guard.sh (guard conventions this
#           mirrors), docs/MIGRATIONS.md (the convention, written up),
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
#   The counter-example is MEH-293, which DID complete. The difference is not
#   diligence, it is that a forgotten date has nothing to remind anyone. This
#   turns "we'll finish it later" into a dated claim a check can falsify.
#
# THE CONVENTION
#   LEGACY(YYYY-MM-DD, MEH-1234)
#   anywhere in a comment, alongside whatever prose you were going to write.
#   The date is when the overlap must be GONE; the ticket is who removes it.
#
#   FAIL when the date is in the past      → finish the contract, or extend the
#                                            date deliberately in a reviewed PR
#   FAIL when a `LEGACY(` marker is malformed (missing/!ISO date, missing or
#        malformed ticket) → a marker that cannot expire is the loophole that
#        recreates the very problem this guard exists to close
#   PASS when the date is today or later
#
# GRANDFATHER (deliberate, not an oversight)
#   Plain-English "legacy" comments WITHOUT the LEGACY( marker are IGNORED.
#   There is no retroactive sweep: this guard governs new debt and the three
#   seeded sites only. Retrofitting every historical "legacy" mention would
#   produce a wall of red with no owner per line, and a guard nobody can green
#   is a guard that gets disabled.
#
# USAGE
#   bash scripts/legacy-expiry-check.sh              # guard the tree
#   bash scripts/legacy-expiry-check.sh --self-test  # prove it discriminates
#
# NOTE ON WIRING
#   rtl-ok: the workflow filename below is a path, not a pl-/pr- padding class
#   This file lives in scripts/, so it needs a pr-checks.yml step to run in CI
#   (that snippet ships in the PR body — .github/workflows/** is CC-deny).
#   Moving it to scripts/checks/ would make run-all.sh discover it with NO
#   workflow edit at all. That is Sapir's call; see the PR body.
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

# Directories scanned in a real run. The fixture path is excluded explicitly:
# it exists to contain deliberately-expired markers, so scanning it would make
# every run red forever — the guard would fail on its own test data.
SCAN_DIRS=("backend" "frontend")
FIXTURE_REL="scripts/fixtures/legacy-expiry-fixture.txt"

# A well-formed marker. Anchored on the literal LEGACY( so a malformed one is
# still *detected* (below) rather than silently skipped.
VALID_RE='LEGACY\([0-9]{4}-[0-9]{2}-[0-9]{2}, MEH-[0-9]+\)'
ANY_RE='LEGACY\('

# ---------------------------------------------------------------------------
# scan_paths — emit "file:line:content" for every line containing LEGACY(.
# Uses git ls-files so untracked scratch files and node_modules never count.
# ---------------------------------------------------------------------------
scan_paths() {
  local dirs=("$@")
  # -I skips binary; the || true keeps a no-match grep (exit 1) from killing us.
  git ls-files -z -- "${dirs[@]}" 2>/dev/null |
    xargs -0 -r grep -InE "$ANY_RE" 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# check_lines — the rule. Reads "file:line:content" on stdin, prints offenders,
# returns 1 if any. Isolated from how lines were gathered so --self-test can
# drive the real rule over fixture data.
#
# $1 = today's date as YYYY-MM-DD (injectable: the self-test pins it so the
#      fixture's "future" marker cannot rot into a failure in ~2 years, which
#      is exactly the silent-decay this guard exists to prevent).
# ---------------------------------------------------------------------------
check_lines() {
  local today="$1"
  local expired=() malformed=() total=0
  local line loc content date_str

  while IFS= read -r line; do
    [ -n "$line" ] || continue
    total=$(( total + 1 ))
    # file:line:content — content may itself contain colons, so cut twice.
    loc="$(printf '%s' "$line" | cut -d: -f1-2)"
    content="$(printf '%s' "$line" | cut -d: -f3-)"

    if ! printf '%s' "$content" | grep -qE "$VALID_RE"; then
      malformed+=("$loc|$(printf '%s' "$content" | sed 's/^[[:space:]]*//')")
      continue
    fi

    date_str="$(printf '%s' "$content" | grep -oE "$VALID_RE" | head -n 1 |
                sed -E 's/LEGACY\(([0-9]{4}-[0-9]{2}-[0-9]{2}).*/\1/')"
    # ISO-8601 dates sort lexically, so this needs no date arithmetic.
    if [[ "$date_str" < "$today" ]]; then
      expired+=("$loc|$date_str|$(printf '%s' "$content" | grep -oE 'MEH-[0-9]+' | head -n 1)")
    fi
  done

  echo "  scanned $total LEGACY( marker(s); today is $today"

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
  fi
  return 1
}

# ---------------------------------------------------------------------------
# --self-test — drive the REAL rule over the fixture, which carries exactly one
# expired, one future, and one malformed marker. Asserts the verdict AND the
# offender counts: a guard that fails for the wrong reason, or that flags the
# future marker too, is not doing its job. Run this before trusting any green.
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

  # 1. It must fail at all.
  if [ "$rc" -eq 0 ]; then
    echo "  [XX] expected exit 1 on the fixture, got 0"
    status=1
  else
    echo "  [ok] exit 1 as expected"
  fi

  # 2. It must fail for BOTH the right reasons — one expired, one malformed.
  #    Checking only the exit code would pass a guard that found one offender
  #    and missed the other entirely.
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

  # 3. The future marker must NOT be reported. This is the discriminating half:
  #    a guard that flagged everything would satisfy (1) while being useless,
  #    and would make every PR red.
  if printf '%s' "$out" | grep -q "2099-01-01"; then
    echo "  [XX] the future marker (2099-01-01) was reported — guard over-fires"
    status=1
  else
    echo "  [ok] the future marker was correctly ignored"
  fi

  # 4. A plain "legacy" comment with no marker must be invisible (GRANDFATHER).
  #    The fixture carries one tagged GRANDFATHERED-CANARY; if the scan ever
  #    widens to bare "legacy", that string appears in the output and this trips.
  if printf '%s' "$out" | grep -q "GRANDFATHERED-CANARY"; then
    echo "  [XX] a plain 'legacy' comment was picked up — grandfather clause broken"
    status=1
  else
    echo "  [ok] plain 'legacy' prose ignored (grandfather clause holds)"
  fi

  echo
  if [ "$status" -eq 0 ]; then
    echo "self-test OK — the guard discriminates expired / future / malformed."
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
