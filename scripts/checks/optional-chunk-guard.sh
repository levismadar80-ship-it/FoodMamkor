#!/usr/bin/env bash
#
# Module:   optional-chunk-guard.sh
# Purpose:  Hold MEH-3946: a lazily loaded add-on goes through
#           optionalChunk() (frontend/lib/optional-chunk.js), so a failed
#           download renders nothing instead of the whole-page error screen.
#           A plain `dynamic(() => import(…))` is allowed only for a chunk the
#           page itself needs, listed below with its reason.
# Touches:  nothing — reads frontend/{app,components} and prints file:line.
# Does NOT: see a loader written on a later line than `dynamic(`, or a
#           React.lazy (none in the tree, 27/11); judge whether a listed chunk
#           really is required (the rule-5a reviewer does).
# History:  MEH-3946 (creation).
#
# ESCAPE HATCH
#   Add the file to REQUIRED with the reason, or `guard-ok: <reason>` on the
#   line or ±1.
#
# USAGE
#   bash scripts/checks/optional-chunk-guard.sh             # exit 1 on a violation
#   bash scripts/checks/optional-chunk-guard.sh --self-test
set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

# file — why the page cannot do without the chunk
REQUIRED=(
  "frontend/app/[locale]/map/components/MapPane.jsx"   # /map is the map; without it the error screen and «נסו שוב» are right
  "frontend/app/[locale]/producer/[id]/ProducerDetail.jsx" # the order sheet: a customer who tapped «להזמנה» must see the failure
)

PATTERN='dynamic\(\s*\(\)\s*=>\s*import\('

scan() { # $@ = roots; prints violations
  grep -rnE --include='*.js' --include='*.jsx' "$PATTERN" "$@" 2>/dev/null | while IFS=: read -r file line _; do
    for r in "${REQUIRED[@]}"; do [[ "$file" == "$r" ]] && continue 2; done
    if sed -n "$((line > 1 ? line - 1 : 1)),$((line + 1))p" "$file" | grep -q 'guard-ok:'; then continue; fi
    echo "$file:$line"
  done
}

if [[ "${1:-}" == "--self-test" ]]; then
  tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
  printf 'const A = dynamic(() => import("./A"), { ssr: false });\n' > "$tmp/bad.jsx"
  printf 'const B = dynamic(optionalChunk(() => import("./B"), "B"), { ssr: false });\n' > "$tmp/good.jsx"
  printf '// guard-ok: test\nconst C = dynamic(() => import("./C"));\n' > "$tmp/ok.jsx"
  out="$(scan "$tmp")"
  [[ "$out" == *bad.jsx:1* && "$out" != *good.jsx* && "$out" != *ok.jsx* ]] || { echo "optional-chunk-guard self-test FAILED: $out"; exit 1; }
  # Anchored to the real tree: the two required sites still exist and still match.
  for r in "${REQUIRED[@]}"; do
    grep -qE "$PATTERN" "$r" || { echo "optional-chunk-guard self-test FAILED: $r no longer has a plain dynamic() — drop it from REQUIRED"; exit 1; }
  done
  echo "optional-chunk-guard self-test OK."
  exit 0
fi

bad="$(scan frontend/app frontend/components)"
if [[ -n "$bad" ]]; then
  echo "optional-chunk-guard FAIL — a lazily loaded component without optionalChunk() (MEH-3946):"
  echo "$bad" | sed 's/^/  /'
  echo "Wrap it: dynamic(optionalChunk(() => import(\"…\"), \"Name\"), …) from @/lib/optional-chunk,"
  echo "or, if the page cannot work without it, add the file to REQUIRED in this script with the reason."
  exit 1
fi
echo "optional-chunk-guard OK."
