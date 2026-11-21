#!/usr/bin/env bash
#
# og-site-image-guard.sh — every link preview has an image, and the site image
# is named in one place (MEH-3590).
#
# WHY THIS EXISTS
#   Next.js merges metadata shallowly: a page that writes its own
#   `openGraph: { … }` REPLACES the layout's object, image included. Three
#   business guides shipped that way and were shared on WhatsApp with no
#   picture. Pages that did remember an image had each copied the path, and 33
#   of them copied "/og-image.png" — the 1.26 MB PNG MEH-2827 retired because
#   WhatsApp drops a preview that heavy — while /en pages got the Hebrew art.
#
# THE TWO RULES
#   1. No literal og-image.png / og-image-en.png under frontend/{app,lib,
#      components}. The site image comes from lib/og-site-image.js
#      (siteOgImageUrl(locale)). The owner file itself is exempt.
#   2. Every `openGraph: {` block in frontend/app names `images`, or spreads an
#      object that does (`...base.openGraph`, `...BASE_METADATA.openGraph`).
#
# Source-text by nature (scripts/checks is exempt from the MEH-3531 rule):
# calling all ~60 generateMetadata functions needs the whole app mocked.
#
# KNOWN GAP: a spread is trusted, not followed. `...x.openGraph` passes even if
# x has no image; buildProducerMetadata (lib/seo.js) is the one spread source
# today and always sets images.
#
# Usage: og-site-image-guard.sh            scan the repo
#        og-site-image-guard.sh --self-test prove both rules go red and green
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

scan() {
  local fe="$1"
  python3 - "$fe" <<'PY'
import pathlib, re, sys
fe = pathlib.Path(sys.argv[1])
bad = []
OWNER = "lib/og-site-image.js"
for sub in ("app", "lib", "components"):
    for p in sorted((fe / sub).rglob("*")):
        if p.suffix not in (".js", ".jsx", ".ts", ".tsx") or not p.is_file():
            continue
        rel = p.relative_to(fe).as_posix()
        text = p.read_text(encoding="utf-8")
        if rel != OWNER:
            for n, line in enumerate(text.split("\n"), 1):
                if re.search(r"og-image(-en)?\.png", line):
                    bad.append(f"{rel}:{n}: literal og-image PNG — use siteOgImageUrl(locale) from lib/og-site-image.js")
        if sub != "app":
            continue
        for m in re.finditer(r"openGraph\s*:\s*\{", text):
            i, depth = m.end(), 1
            while i < len(text) and depth:
                depth += {"{": 1, "}": -1}.get(text[i], 0)
                i += 1
            block = text[m.end():i]
            if not re.search(r"\bimages\s*:", block) and not re.search(r"\.\.\.[\w.]*openGraph", block):
                n = text.count("\n", 0, m.start()) + 1
                bad.append(f"{rel}:{n}: openGraph without images — a page-level openGraph replaces the layout's image")
for b in bad:
    print(b)
sys.exit(1 if bad else 0)
PY
}

if [[ "${1:-}" == "--self-test" ]]; then
  tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
  mkdir -p "$tmp/app/a" "$tmp/lib" "$tmp/components"
  printf 'export const m = { openGraph: { title: "x", images: [siteOgImageUrl(locale)] } };\n' > "$tmp/app/a/page.js"
  printf 'export const m = { openGraph: { ...base.openGraph, locale: "he_IL" } };\n' > "$tmp/app/a/spread.js"
  scan "$tmp" >/dev/null || { echo "self-test FAILED: clean fixture went red"; exit 1; }
  printf 'export const m = { openGraph: { title: "x", nested: { a: 1 } } };\n' > "$tmp/app/a/noimg.js"
  out="$(scan "$tmp" || true)"
  [[ "$out" == *"app/a/noimg.js:1: openGraph without images"* ]] || { echo "self-test FAILED: missing image not caught"; exit 1; }
  rm "$tmp/app/a/noimg.js"
  printf 'const i = "/og-image.png";\n' > "$tmp/components/x.js"
  out="$(scan "$tmp" || true)"
  [[ "$out" == *"components/x.js:1: literal og-image PNG"* ]] || { echo "self-test FAILED: PNG literal not caught"; exit 1; }
  echo "og-site-image-guard self-test: ok (clean green, missing image red, PNG literal red)"
  exit 0
fi

if out="$(scan "$ROOT/frontend")"; then
  echo "og-site-image-guard: ok"
else
  echo "$out"
  echo "og-site-image-guard: FAILED (MEH-3590) — see lib/og-site-image.js"
  exit 1
fi
