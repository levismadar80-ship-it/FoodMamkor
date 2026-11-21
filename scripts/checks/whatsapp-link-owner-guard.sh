#!/usr/bin/env bash
#
# Module:   whatsapp-link-owner-guard.sh
# Purpose:  Hold frontend.md «Shared helpers»: a WhatsApp link is built ONLY in
#           frontend/lib/utils.js (getWhatsAppHref, getWhatsAppChatHref). A
#           second builder is the bug — it drifts from the one form MEH-2189
#           ruled on. Before MEH-3603 four files built wa.me by hand.
# Touches:  nothing — reads frontend/ and prints file:line.
# Does NOT: catch a link assembled from pieces ("wa" + ".me"), or one that
#           only DETECTS a wa.me href (a regex like /wa\.me/ is not a builder).
# History:  MEH-3603 (creation, under MEH-3600).
#
# THE RULE
#   No string literal that starts a WhatsApp URL — `https://wa.me…`,
#   `"wa.me/…"`, `api.whatsapp.com/send`, `web.whatsapp.com/send` — in
#   frontend/{app,components,lib,hooks} outside frontend/lib/utils.js.
#   Comment lines are skipped. Tests and lib/generated/ are out of scope.
#
# ESCAPE HATCH
#   `guard-ok: <reason>` on the line or ±1 (same as the other guards here).
#
# USAGE
#   bash scripts/checks/whatsapp-link-owner-guard.sh               # exit 1 on a violation
#   bash scripts/checks/whatsapp-link-owner-guard.sh --self-test
set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

OWNER="frontend/lib/utils.js"
# A literal that starts a URL: `https://wa.me…` / `https://api.whatsapp.com/send…`,
# or a bare "wa.me/…". Prose like «the CTA is a `wa.me` deep link» (no slash,
# no scheme) is not a builder — ContactCard.jsx:277 carries exactly that.
PATTERN="[\`\"'](https?://(wa\\.me|api\\.whatsapp\\.com/send|web\\.whatsapp\\.com/send)|wa\\.me/)"

# scan DIR... → prints file:line of every builder outside the owner
scan() {
  grep -rnE "$PATTERN" "$@" \
    --include='*.js' --include='*.jsx' --include='*.ts' --include='*.tsx' --include='*.mjs' \
    --exclude-dir=node_modules --exclude-dir=generated --exclude-dir=__tests__ 2>/dev/null \
  | grep -vE '\.(test|spec)\.[a-z]+:' \
  | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(//|\*|/\*)' \
  | while IFS=: read -r file line _; do
      [ "$file" = "$OWNER" ] && continue
      from=$(( line > 1 ? line - 1 : 1 ))
      sed -n "${from},$(( line + 1 ))p" "$file" | grep -q 'guard-ok:' && continue
      echo "$file:$line"
    done
}

self_test() {
  local tmp fails=0 got
  tmp="$(mktemp -d)" || return 1
  mkdir -p "$tmp/c"
  printf '%s\n' 'const a = `https://wa.me/${p}`;' 'const b = "https://api.whatsapp.com/send?phone=1";' \
    '// a comment about https://wa.me/' 'const c = getWhatsAppHref("", t);' \
    'const d = "https://wa.me/"; // guard-ok: test fixture' \
    '   the CTA is a `wa.me` deep link, in prose' 'const e = "wa.me/" + p;' > "$tmp/c/x.jsx"
  got=$(scan "$tmp/c" | sed 's|.*/||' | tr '\n' ' ')
  [ "$got" = "x.jsx:1 x.jsx:2 x.jsx:7 " ] || { echo "self-test FAIL synthetic: got [$got]"; fails=1; }
  # Anchored on the real owner: it must contain a builder, or the pattern is dead.
  got=$(grep -cE "$PATTERN" "$OWNER")
  [ "$got" -ge 2 ] || { echo "self-test FAIL anchor: $OWNER holds $got builders, expected >= 2"; fails=1; }
  rm -rf "$tmp"
  [ "$fails" -eq 0 ] && echo "whatsapp-link-owner-guard self-test PASS"
  return "$fails"
}

if [ "${1:-}" = "--self-test" ]; then self_test; exit $?; fi
self_test >/dev/null || { echo "$0:1: self-test failed — every result of this guard is void"; self_test; exit 1; }

hits=$(scan frontend/app frontend/components frontend/lib frontend/hooks)
if [ -n "$hits" ]; then
  while read -r h; do
    echo "  VIOLATION $h: a WhatsApp link built by hand — use getWhatsAppHref / getWhatsAppChatHref from $OWNER (frontend.md, MEH-3603)"
  done <<< "$hits"
  exit 1
fi
echo "whatsapp-link-owner-guard: PASS"
