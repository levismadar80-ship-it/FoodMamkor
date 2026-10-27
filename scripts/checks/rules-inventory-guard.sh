#!/usr/bin/env bash
#
# Module:   rules-inventory-guard.sh
# Purpose:  Prove that condensing a .claude/rules/ file removed no rule. Every
#           heading and every numbered rule in a frozen archive under
#           docs/rules-history/<name>.md must still exist in the live
#           .claude/rules/<name>.md.
# Touches:  nothing — reads the two files of each pair, writes stdout/stderr and
#           mktemp scratch files (self-test only).
# Does NOT: compare rule BODIES. Bodies were deliberately shortened; the full
#           text lives verbatim in the archive. It checks the inventory (what
#           rules exist), not the wording (how long each one is).
#           It also does not police ADDITIONS — a new rule in the live file is
#           fine (CC adds constraints, workflow rule 32).
# Related:  docs/rules-history/README.md, .claude/rules/workflow.md (header),
#           workflow rule 32 (monotonic constraints).
# History:  MEH-2338 (creation — the rules diet, parent MEH-2333).
#
# THE INVENTORY, per archive (text after its first `---` line, code fences
# skipped):
#   H <text>                 every non-indented `#`..`####` heading
#   R <id>                   an indented heading whose first token is a
#                            sub-rule id such as `29b`, `30b`, `31b`
#   N <h2> | <n> | <words>   a numbered rule `N. **Title…` — keyed by the H2 it
#                            sits under, its number, and the first 4 words of
#                            its bold title (the part on the first line,
#                            up to the closing `**`) (so rule 3 of "Bug Protocol" and
#                            rule 3 of "Regression prevention" stay distinct)
#
# RETIRING A RULE ON PURPOSE: add its exact inventory key to
# docs/rules-history/RETIRED.txt in a PR that says why. That is a constraint
# removal (rule 32) — Sapir's call, never CC's.
#
# CONTROL: a pair whose archive yields 0 inventory lines FAILS — a parser that
# reads nothing would otherwise report "nothing missing" (testing.md: a null
# that is also the reassuring answer). Run with --self-test to watch it go red.

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

HIST_DIR="docs/rules-history"
RULES_DIR=".claude/rules"
RETIRED="$HIST_DIR/RETIRED.txt"

# inventory <file> <skip_preamble:0|1> — prints "<line>\t<key>"
inventory() {
  awk -v skip="$2" '
    BEGIN { body = (skip == 1) ? 0 : 1; fence = 0; h2 = "" }
    !body { if ($0 == "---") body = 1; next }
    /^[[:space:]]*```/ { fence = !fence; next }
    fence { next }
    /^#{1,4} / {
      t = $0; sub(/^#+ /, "", t)
      if ($0 ~ /^## /) h2 = t
      printf "%d\tH %s\n", NR, t; next
    }
    /^[[:space:]]+#{2,4} [0-9]+[a-z] / {
      t = $0; sub(/^[[:space:]]+#+ /, "", t); split(t, a, " ")
      printf "%d\tR %s\n", NR, a[1]; next
    }
    /^[0-9]+[a-z]?\. \*\*/ {
      n = $0; sub(/\..*/, "", n)
      t = $0; sub(/^[^*]*\*\*/, "", t); sub(/\*\*.*/, "", t); split(t, w, /[[:space:]]+/)
      printf "%d\tN %s | %s | %s %s %s %s\n", NR, h2, n, w[1], w[2], w[3], w[4]
    }
  ' "$1"
}

# check_pair <archive> <live> — prints missing items, returns count via stdout tail
check_pair() {
  local archive="$1" live="$2" missing=0 total=0 key line
  local live_keys; live_keys="$(inventory "$live" 0 | cut -f2-)"
  while IFS=$'\t' read -r line key; do
    total=$((total + 1))
    if [ -f "$RETIRED" ] && grep -qxF -- "$key" "$RETIRED"; then continue; fi
    if ! grep -qxF -- "$key" <<<"$live_keys"; then
      echo "$archive:$line: missing from $live — $key"
      missing=$((missing + 1))
    fi
  done < <(inventory "$archive" 1)
  echo "TOTALS $total $missing"
}

run_all() {
  local fail=0 pairs=0 archive name live out total missing
  for archive in "$HIST_DIR"/*.md; do
    name="$(basename "$archive")"
    [ "$name" = "README.md" ] && continue
    live="$RULES_DIR/$name"
    pairs=$((pairs + 1))
    if [ ! -f "$live" ]; then
      echo "$archive:1: live rules file $live does not exist"; fail=1; continue
    fi
    out="$(check_pair "$archive" "$live")"
    grep -v '^TOTALS ' <<<"$out" || true
    read -r _ total missing < <(grep '^TOTALS ' <<<"$out")
    if [ "$total" -eq 0 ]; then
      echo "$archive:1: parsed 0 inventory items — the parser read nothing, so every 'nothing missing' is void"
      fail=1
    elif [ "$missing" -gt 0 ]; then
      fail=1
    else
      echo "rules-inventory-guard: $live keeps all $total items of $archive"
    fi
  done
  [ "$pairs" -eq 0 ] && echo "rules-inventory-guard: no archives in $HIST_DIR — nothing to check"
  return "$fail"
}

self_test() {
  local tmp; tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' RETURN
  local ok=1 archive live out
  # Anchored to a real archive from this repo, not a synthetic fixture.
  archive="$(ls "$HIST_DIR"/*.md | grep -v README | head -1)"
  [ -n "$archive" ] || { echo "self-test: no real archive to anchor on"; return 1; }
  # The "live" copy is the archive's own body (everything after its first
  # `---`), so the self-test depends only on the parser and the real archive,
  # never on whether today's live rules file happens to be complete.
  live="$tmp/live-clean"
  awk 'b{print} $0=="---"{b=1}' "$archive" > "$live"

  # 1. an untouched copy passes
  out="$(check_pair "$archive" "$live")"
  grep -q '^TOTALS [1-9][0-9]* 0$' <<<"$out" || { echo "self-test 1 FAIL (clean copy): $out"; ok=0; }

  # 2. drop one numbered rule from the live file -> exactly 1 missing
  awk 'BEGIN{d=0} !d && /^[0-9]+[a-z]?\. \*\*/ {d=1; next} {print}' "$live" > "$tmp/live"
  out="$(check_pair "$archive" "$tmp/live")"
  grep -q '^TOTALS [1-9][0-9]* 1$' <<<"$out" || { echo "self-test 2 FAIL (dropped rule not caught): $out"; ok=0; }

  # 3. drop one heading -> exactly 1 missing
  awk 'BEGIN{d=0} !d && /^## / {d=1; next} {print}' "$live" > "$tmp/live"
  out="$(check_pair "$archive" "$tmp/live")"
  grep -q '^TOTALS [1-9][0-9]* 1$' <<<"$out" || { echo "self-test 3 FAIL (dropped heading not caught): $out"; ok=0; }

  # 4. an empty archive body is a FAILURE, not a pass (the control)
  printf 'title\n\n---\n\nno headings here\n' > "$tmp/empty.md"
  out="$(check_pair "$tmp/empty.md" "$live")"
  grep -q '^TOTALS 0 0$' <<<"$out" || { echo "self-test 4 FAIL (empty parse): $out"; ok=0; }

  if [ "$ok" -eq 1 ]; then echo "self-test: 4/4 cases behaved"; return 0; fi
  return 1
}

if [ "${1:-}" = "--self-test" ]; then self_test; exit $?; fi
# Control first: if the parser cannot tell a dropped rule from a kept one,
# nothing the real run reports is worth reading.
if ! st="$(self_test 2>&1)"; then
  echo "scripts/checks/rules-inventory-guard.sh:1: self-test failed — every result below is void"
  echo "$st"
  exit 1
fi
run_all
