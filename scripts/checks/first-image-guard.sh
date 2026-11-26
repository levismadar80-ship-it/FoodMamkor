#!/usr/bin/env bash
#
# Module:   first-image-guard.sh
# Purpose:  Hold MEH-3894: "which photo stands for this business" is picked
#           ONLY by backend/app/services/producer_images.py first_image(),
#           which skips blank entries. A hand-written `images[0]` /
#           `(images or [None])[0]` handed a blank first entry to group-buy
#           and rescue cards as their photo (an icon or a broken image while
#           the business had other photos); five copies had drifted apart.
# Touches:  nothing — reads backend/app and prints file:line.
# Does NOT: read the frontend (the card picks from what the API sends; the
#           business page gallery filters through getRenderableImages);
#           catch an index through another name (`imgs = p.images; imgs[0]`).
# History:  MEH-3894 (creation).
#
# THE RULE
#   No `.images[0]`, `.images or [None])[0]` or `.images or [])[0]` in
#   backend/app/**/*.py outside the owner. Comment lines are skipped.
#
# ESCAPE HATCH
#   `guard-ok: <reason>` on the line or ±1.
#
# USAGE
#   bash scripts/checks/first-image-guard.sh               # exit 1 on a violation
#   bash scripts/checks/first-image-guard.sh --self-test
set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

OWNER="backend/app/services/producer_images.py"
PATTERN='\.images[[:space:]]*\[[[:space:]]*0[[:space:]]*\]|\.images[[:space:]]+or[[:space:]]*\[[^]]*\][[:space:]]*\)[[:space:]]*\[[[:space:]]*0[[:space:]]*\]'

scan() {
  grep -rnE "$PATTERN" "$@" --include='*.py' 2>/dev/null \
  | grep -vE '^[^:]+:[0-9]+:[[:space:]]*#' \
  | while IFS=: read -r file line _; do
      [ "$file" = "$OWNER" ] && continue
      from=$(( line > 1 ? line - 1 : 1 ))
      sed -n "${from},$(( line + 1 ))p" "$file" | grep -q 'guard-ok:' && continue
      echo "$file:$line"
    done
}

self_test() {
  local tmp got want
  tmp="$(mktemp -d)" || return 1
  printf '%s\n' \
    'a = (producer.images or [None])[0]' \
    'b = p.images[0]' \
    '# c = p.images[0] in a comment' \
    'd = first_image(p.images)' \
    'e = gb.producer.images or [])[0]' \
    'g = p.images [ 0 ]' \
    'h = 1' \
    'f = p.images[0]  # guard-ok: fixture' > "$tmp/x.py"
  got="$(scan "$tmp" | sed "s|$tmp/||" | tr '\n' ' ')"
  rm -rf "$tmp"
  want="x.py:1 x.py:2 x.py:5 x.py:6 "
  if [ "$got" != "$want" ]; then
    echo "first-image-guard self-test FAILED: got '$got', want '$want'"
    return 1
  fi
  echo "first-image-guard self-test OK"
}

if [ "${1:-}" = "--self-test" ]; then self_test; exit $?; fi

self_test || exit 1
hits="$(scan backend/app)"
if [ -n "$hits" ]; then
  echo "first-image-guard: pick the business's photo with first_image() ($OWNER), not by index (MEH-3894):"
  echo "$hits"
  exit 1
fi
echo "first-image-guard OK — no hand-picked first photo in backend/app."
