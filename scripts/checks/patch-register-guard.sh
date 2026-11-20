#!/usr/bin/env bash
#
# Module:   patch-register-guard.sh
# Purpose:  Keep docs/ci/patch-register.tsv true. Every docs/ci/*.patch.md has a
#           row; a row marked `applied` must have its marker in the target file;
#           a row still `pending` / `decision` must NOT (that means someone
#           applied it and nobody updated the register or the doc).
# Touches:  nothing — reads docs/ci/ and the target files, prints, exits.
# Does NOT: apply anything, or judge whether a pending patch should be applied.
#           It cannot check `dead` / `external` rows (no marker),
#           and a marker is a literal string, so it proves the change is present,
#           not that the whole patch was pasted byte for byte.
# Related:  docs/ci/patch-register.tsv (the register and its columns),
#           scripts/checks/README.md (guard contract).
# History:  MEH-3520 (20/11/2026). An audit found 3 patches applied but still
#           marked NOT APPLIED, and 3 low-risk patches staged for weeks and never
#           pasted. Nothing compared the docs with the code.
#
# STATES
#   applied     marker must be in target              (FAIL if missing)
#   pending     ready to paste; marker must be absent (FAIL if present) + WARN.
#               FAILS once the row is older than PENDING_MAX_DAYS: a patch that
#               is ready does not wait. Apply it, or decide and change its state.
#   decision    waits on Sapir; marker must be absent (FAIL if present) + WARN
#               with its age. It never fails on age: her open decision must not
#               block every other PR.
#   dead        superseded / never to be applied      (not checked)
#   external    applied outside the repo, e.g. a repo setting (not checked)
#
# There is no "unverified" state. A new patch doc gets a real state the day it
# is written. `since` (YYYY-MM-DD) is required for pending and decision rows.
#
# --self-test builds a throwaway tree and checks that each rule goes red.

set -uo pipefail

if [ "${1:-}" = "--self-test" ]; then
  self="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  ran=0; bad=0
  # case <name> <expected exit> <register rows...>; target file holds "MARK".
  run_case() {
    local name="$1" want="$2"; shift 2
    rm -rf "$tmp/r"; mkdir -p "$tmp/r/docs/ci" "$tmp/r/src"
    printf 'MARK here\n' > "$tmp/r/src/t.txt"
    printf '# a patch\n\nbody\n' > "$tmp/r/docs/ci/a.patch.md"
    { printf '# patch\tstate\ttarget\tmarker\tsince\tnote\n'; printf '%b\n' "$@"; } > "$tmp/r/docs/ci/patch-register.tsv"
    [ "$name" = "doc without a row" ] && printf '# b\n' > "$tmp/r/docs/ci/b.patch.md"
    [ "$name" = "applied, doc says NOT APPLIED" ] && printf '> NOT APPLIED\n' > "$tmp/r/docs/ci/a.patch.md"
    PATCH_REGISTER_ROOT="$tmp/r" PATCH_REGISTER_TODAY="2026-11-20" bash "$self" >/dev/null 2>&1
    local got=$?
    ran=$((ran + 1))
    if [ "$got" -eq "$want" ]; then echo "  ok   $name (exit $got)"; else echo "  FAIL $name: exit $got, wanted $want"; bad=1; fi
  }
  run_case "applied, marker present"            0 'a\tapplied\tsrc/t.txt\tMARK\t-\t-'
  run_case "applied, marker missing"            1 'a\tapplied\tsrc/t.txt\tNOPE\t-\t-'
  run_case "applied, doc says NOT APPLIED"      1 'a\tapplied\tsrc/t.txt\tMARK\t-\t-'
  run_case "pending, marker already in target"  1 'a\tpending\tsrc/t.txt\tMARK\t2026-11-20\t-'
  run_case "pending, fresh"                     0 'a\tpending\tsrc/t.txt\tNOPE\t2026-11-10\t-'
  run_case "pending, older than the limit"      1 'a\tpending\tsrc/t.txt\tNOPE\t2026-11-01\t-'
  run_case "pending without a date"             1 'a\tpending\tsrc/t.txt\tNOPE\t-\t-'
  run_case "decision, old, never fails on age"  0 'a\tdecision\tsrc/t.txt\tNOPE\t2026-01-01\t-'
  run_case "decision, marker already in target" 1 'a\tdecision\tsrc/t.txt\tMARK\t2026-11-20\t-'
  run_case "unknown state"                      1 'a\tunverified\t-\t-\t-\t-'
  run_case "row with a missing column"          1 'a\tapplied\tsrc/t.txt\tMARK'
  run_case "row without a doc"                  1 'a\tdead\t-\t-\t-\t-' 'zzz\tdead\t-\t-\t-\t-'
  run_case "same patch on two rows"             1 'a\tdead\t-\t-\t-\t-' 'a\tdead\t-\t-\t-\t-'
  run_case "pending dated in the future"        1 'a\tpending\tsrc/t.txt\tNOPE\t2027-01-01\t-'
  run_case "doc without a row"                  1 'a\tdead\t-\t-\t-\t-'
  echo "cases ran=$ran"
  [ "$ran" -eq 15 ] || { echo "SELF-TEST BROKEN: expected 15 cases"; exit 1; }
  [ "$bad" -eq 0 ] && { echo "SELF-TEST PASS"; exit 0; }
  echo "SELF-TEST FAIL"; exit 1
fi

REPO_ROOT="${PATCH_REGISTER_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$REPO_ROOT" || exit 1

REG="docs/ci/patch-register.tsv"
PENDING_MAX_DAYS=14
TODAY="${PATCH_REGISTER_TODAY:-$(date -u +%Y-%m-%d)}"

fail=0
warn_pending=()

if [ ! -f "$REG" ]; then
  echo "$REG: missing"
  exit 1
fi

# Whole days from $1 to $TODAY; empty when $1 is not a date.
age_days() {
  local a b
  [[ "$1" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || return 1
  a=$(date -u -d "$1" +%s 2>/dev/null) || return 1
  b=$(date -u -d "$TODAY" +%s 2>/dev/null) || return 1
  echo $(( (b - a) / 86400 ))
}

declare -A seen=()
lineno=0
# Tab is IFS whitespace, so `read` would collapse an empty middle field and
# shift the columns. Every field is therefore required; `-` means "none".
while IFS= read -r line; do
  lineno=$((lineno + 1))
  [ "$lineno" -eq 1 ] && continue          # header
  [ -z "${line//[[:space:]]/}" ] && continue
  loc="$REG:$lineno"
  ncol=$(printf '%s' "$line" | awk -F'\t' '{print NF}')
  if [ "$ncol" -ne 6 ] || printf '%s' "$line" | grep -q $'\t\t'; then
    echo "$loc: need exactly 6 tab-separated, non-empty fields (use - for none), got $ncol"
    fail=1
    continue
  fi
  IFS=$'\t' read -r patch state target marker since _note <<< "$line"
  doc="docs/ci/$patch.patch.md"
  if [ -n "${seen[$patch]:-}" ]; then
    echo "$loc: '$patch' has two rows — keep one"
    fail=1
    continue
  fi
  seen["$patch"]=1
  if [ ! -f "$doc" ]; then
    echo "$loc: row '$patch' has no $doc"
    fail=1
    continue
  fi
  case "$state" in
    applied)
      if [ ! -f "$target" ]; then
        echo "$loc: '$patch' is applied but its target $target does not exist"
        fail=1
      elif ! grep -qF -- "$marker" "$target"; then
        echo "$loc: '$patch' is marked applied but its marker is not in $target: $marker"
        fail=1
      fi
      if head -n 15 "$doc" | grep -q 'NOT APPLIED'; then
        echo "$doc:1: register says applied, but the doc's status still says NOT APPLIED"
        fail=1
      fi
      ;;
    pending|decision)
      if [ -f "$target" ] && grep -qF -- "$marker" "$target"; then
        echo "$loc: '$patch' is marked $state, but its marker is already in $target — mark it applied (register + the doc's Status line)"
        fail=1
        continue
      fi
      if ! age=$(age_days "$since"); then
        echo "$loc: '$patch' is $state and needs a since date (YYYY-MM-DD), got '$since'"
        fail=1
        continue
      fi
      if [ "$age" -lt 0 ]; then
        echo "$loc: '$patch' has a since date in the future ($since) — it would never expire"
        fail=1
        continue
      fi
      if [ "$state" = "pending" ] && [ "$age" -gt "$PENDING_MAX_DAYS" ]; then
        echo "$loc: '$patch' has been ready to apply for $age days (max $PENDING_MAX_DAYS). Apply it, or change its state to decision / dead with the reason."
        fail=1
      else
        warn_pending+=("$patch ($state, $age days)")
      fi
      ;;
    dead|external) ;;
    *)
      echo "$loc: unknown state '$state' (applied|pending|decision|dead|external)"
      fail=1
      ;;
  esac
done < "$REG"

for doc in docs/ci/*.patch.md; do
  [ -e "$doc" ] || continue
  p="$(basename "$doc" .patch.md)"
  if [ -z "${seen[$p]:-}" ]; then
    echo "$doc:1: no row in $REG — add one (state + target + a marker string that appears once applied)"
    fail=1
  fi
done

if [ "${#warn_pending[@]}" -gt 0 ]; then
  echo "WARN: ${#warn_pending[@]} patch(es) written and not applied:"
  printf '  - %s\n' "${warn_pending[@]}"
fi

exit "$fail"
