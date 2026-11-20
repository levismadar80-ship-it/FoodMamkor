#!/usr/bin/env bash
#
# Module:   patch-register-guard.sh
# Purpose:  Keep docs/ci/patch-register.tsv true. Every docs/ci/*.patch.md has a
#           row; a row marked `applied` must have its marker in the target file;
#           a row still `pending` / `decision` must NOT (that means someone
#           applied it and nobody updated the register or the doc).
# Touches:  nothing — reads docs/ci/ and the target files, prints, exits.
# Does NOT: apply anything, or judge whether a pending patch should be applied.
#           It cannot check `dead` / `external` / `unverified` rows (no marker),
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
#   pending     ready to paste; marker must be absent (FAIL if present) + WARN
#   decision    waits on Sapir; marker must be absent (FAIL if present) + WARN
#   dead        superseded / never to be applied      (not checked)
#   external    applied outside the repo, e.g. a repo setting (not checked)
#   unverified  pre-register patch nobody has checked yet (WARN; count only shrinks)

set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

REG="docs/ci/patch-register.tsv"
# Only shrinks: verify a row (give it a real state) and lower this number.
UNVERIFIED_MAX=33

fail=0
warn_pending=()
unverified=0

if [ ! -f "$REG" ]; then
  echo "$REG: missing"
  exit 1
fi

declare -A seen=()
lineno=0
while IFS=$'\t' read -r patch state target marker _note; do
  lineno=$((lineno + 1))
  [ "$lineno" -eq 1 ] && continue          # header
  [ -z "${patch// }" ] && continue
  loc="$REG:$lineno"
  doc="docs/ci/$patch.patch.md"
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
      else
        warn_pending+=("$patch ($state)")
      fi
      ;;
    dead|external) ;;
    unverified) unverified=$((unverified + 1)) ;;
    *)
      echo "$loc: unknown state '$state' (applied|pending|decision|dead|external|unverified)"
      fail=1
      ;;
  esac
done < "$REG"

for doc in docs/ci/*.patch.md; do
  p="$(basename "$doc" .patch.md)"
  if [ -z "${seen[$p]:-}" ]; then
    echo "$doc:1: no row in $REG — add one (state + target + a marker string that appears once applied)"
    fail=1
  fi
done

if [ "$unverified" -gt "$UNVERIFIED_MAX" ]; then
  echo "$REG:1: $unverified unverified rows, max $UNVERIFIED_MAX — a new patch gets a real state, not 'unverified'"
  fail=1
fi

if [ "${#warn_pending[@]}" -gt 0 ]; then
  echo "WARN: ${#warn_pending[@]} patch(es) not applied yet: ${warn_pending[*]}"
fi
if [ "$unverified" -gt 0 ]; then
  echo "WARN: $unverified patch doc(s) still unverified in $REG"
fi

exit "$fail"
