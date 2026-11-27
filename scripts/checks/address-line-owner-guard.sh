#!/usr/bin/env bash
#
# Module:   address-line-owner-guard.sh
# Purpose:  A printed «street, city» line is built ONLY by
#           backend/app/services/address_line.py (address_line) and
#           frontend/lib/address-line.js (addressLine). A hand-made join
#           repeats a city the street already carries — «הרצל 5, חיפה, חיפה»
#           (MEH-3959: eight hand-made joins, four in the backend emails and
#           order page, four on screens).
# Touches:  nothing — reads backend/app and frontend/ and prints file:line.
# Does NOT: catch a join split over several lines, a template literal
#           `${address}, ${city}`, or string concatenation with "+".
# History:  MEH-3959 (creation).
#
# THE RULE
#   No line that calls `.join(` and names both an address-like value
#   (address / location / street) and a city, outside the two owners.
#   Comment lines are skipped. Tests are out of scope.
#
# ESCAPE HATCH
#   `guard-ok: <reason>` on the line or ±1.
#
# USAGE
#   bash scripts/checks/address-line-owner-guard.sh               # exit 1 on a violation
#   bash scripts/checks/address-line-owner-guard.sh --self-test
set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

OWNERS="backend/app/services/address_line.py frontend/lib/address-line.js"
PATTERN='join\(.*(address|location|street).*city|(address|location|street).*city.*\]\.filter\(Boolean\)\.join'

scan() {
  grep -rnE "$PATTERN" "$@" \
    --include='*.py' --include='*.js' --include='*.jsx' --include='*.mjs' \
    --exclude-dir=node_modules --exclude-dir=generated --exclude-dir=__tests__ \
    --exclude-dir=__pycache__ 2>/dev/null \
  | grep -vE '\.(test|spec)\.[a-z]+:' \
  | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(//|\*|/\*|#)' \
  | grep -vE 'address_?[lL]ine\(' \
  | while IFS=: read -r file line _; do
      case " $OWNERS " in *" $file "*) continue ;; esac
      from=$(( line > 1 ? line - 1 : 1 ))
      sed -n "${from},$(( line + 1 ))p" "$file" | grep -q 'guard-ok:' && continue
      echo "$file:$line"
    done
}

self_test() {
  local tmp got want=3
  tmp="$(mktemp -d)" || return 1
  mkdir -p "$tmp/c"
  printf '%s\n' \
    'a = ", ".join(p for p in (loc.address, loc.city) if p)' \
    'const b = [p.location_address, p.location_city].filter(Boolean).join(", ");' \
    'place = ", ".join(p for p in (event.location, event.city) if p)' \
    '# ", ".join((address, city)) in a comment' \
    'c = address_line(loc.address, loc.city)' \
    'd = ", ".join((a, city))  # guard-ok: not an address' \
    'e = ", ".join(cities)' \
    'f = [place.label, addressLine(place.address, place.city)].filter(Boolean).join(" — ")' > "$tmp/c/x.py"
  got=$(cd "$tmp" && scan c | wc -l | tr -d ' ')
  rm -rf "$tmp"
  if [ "$got" != "$want" ]; then
    echo "address-line-owner-guard self-test FAILED: expected $want hits, got $got" >&2
    return 1
  fi
  echo "address-line-owner-guard self-test: $want/$want"
}

if [ "${1:-}" = "--self-test" ]; then self_test; exit $?; fi
self_test || exit 1
hits="$(scan backend/app frontend/app frontend/components frontend/lib frontend/hooks)"
if [ -n "$hits" ]; then
  echo "address-line-owner-guard: a «street, city» line built by hand. Use address_line (backend/app/services/address_line.py) or addressLine (frontend/lib/address-line.js), MEH-3959:" >&2
  echo "$hits" >&2
  exit 1
fi
echo "address-line-owner-guard: 0 hand-made «street, city» joins"
