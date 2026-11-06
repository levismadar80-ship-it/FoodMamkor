#!/usr/bin/env bash
#
# Module:   raw-color-tokens
# Purpose:  Ratchet raw colours in the product UI. Every colour that bypasses
#           the design tokens (ADR-019, frontend/tailwind.tokens.json) is frozen,
#           occurrence by occurrence, in a committed baseline; a raw colour that
#           is not in the baseline fails, and a baseline line that no longer
#           matches anything fails too, so the file can only shrink. Three forms:
#             tw     Tailwind palette class   bg-gray-100 · text-red-500 · border-white
#             arb    Tailwind arbitrary hex   bg-[#2e6853] · text-[#fff]
#             hex    a hex literal            "#2e6853" in JS · color: #fff; in CSS
#           Token classes are NOT raw and never match: bg-primary, text-muted,
#           bg-surface, bg-green-500 (green-50/100/300/500/700/900 are token
#           keys in tailwind.tokens.json that override Tailwind's shades).
# Touches:  nothing on a normal run — reads frontend/{app,components,lib,hooks}
#           and the baseline. Writes scripts/checks/raw-color-baseline.txt only
#           under --update-baseline.
# Does NOT: migrate anything, and does NOT judge whether a raw colour is wrong
#           in its context (a WhatsApp-green button or a Leaflet SVG fill is a
#           legitimate fixed colour). It decides one thing: "did a colour enter
#           that skips the token layer and nobody wrote down". Two deliberate
#           carve-outs, both mode-independent by definition:
#             - text-white          — text on a brand/filled surface stays white
#                                     in a dark theme too
#             - bg-black/<opacity>  — modal scrims; MEH-1687 ruled bg-black/40 the
#                                     one scrim for every modal
#           Tests, specs, e2e and qa-*.mjs probes are out of scope (not UI).
#           Comment lines are not scanned (same isComment rule as
#           z-index-tokens.sh).
# Related:  scripts/checks/z-index-tokens.sh (the ratchet shape this copies,
#           incl. multiset keys, stale-line red and the parsed-0 control),
#           scripts/checks/raw-color-baseline.txt (the frozen multiset),
#           docs/DESIGN.md + frontend/tailwind.tokens.json (the token SoT).
# History:  MEH-2717 (creation — after the 06/11 dark-mode research: a theme
#           switch only works for colours that go through the token layer, and
#           ~1,360 occurrences did not; this stops the number from growing).
#
# WHY IT FAILS AND DOES NOT WARN
#   MEH-1868: "four warn-only gates are four non-gates". The escape hatch is
#   --update-baseline plus a reason in the PR body — the single mechanism
#   z-index-tokens.sh uses; no guard-ok marker (two suppression mechanisms for
#   one fact is smell #1, workflow.md).
#
# USAGE
#   bash scripts/checks/raw-color-tokens.sh                    # the gate
#   bash scripts/checks/raw-color-tokens.sh --update-baseline  # regenerate
#   bash scripts/checks/raw-color-tokens.sh --self-test        # fixtures only
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASELINE="$ROOT/scripts/checks/raw-color-baseline.txt"
DIRS=(app components lib hooks)

# Tailwind's built-in palette names. `green` is here too: only the shades that
# are NOT token keys count (see TOKEN_GREEN below).
PALETTE='white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
UTIL='bg|text|border(-[xytrblse])?|ring(-offset)?|fill|stroke|from|via|to|outline|divide|placeholder|caret|accent|decoration|shadow'
TOKEN_GREEN='^green-(50|100|300|500|700|900)$'

COMMENT_LINE='^[^:]*:[0-9]+:[[:space:]]*(\*|//|/\*|\{/\*)'

# Every candidate source file, one path per line, relative to $1.
list_files() {
  local repo="$1" d
  for d in "${DIRS[@]}"; do
    [ -d "$repo/frontend/$d" ] || continue
    ( cd "$repo" && find "frontend/$d" -type f \( -name '*.js' -o -name '*.jsx' -o -name '*.ts' -o -name '*.tsx' -o -name '*.css' \) \
        -not -path '*/node_modules/*' -not -path '*/__tests__/*' -not -name '*.test.*' -not -name '*.spec.*' )
  done
}

# Every raw colour, one record per OCCURRENCE: `path<TAB>line<TAB>literal`.
scan() {
  local repo="$1" files
  files="$(list_files "$repo")"
  [ -n "$files" ] || return 0
  (
    cd "$repo" || exit 1
    # shellcheck disable=SC2086
    printf '%s\n' "$files" | tr '\n' '\0' | xargs -0 grep -nHE "(^|[^a-zA-Z0-9_-])(${UTIL})-(${PALETTE})|-\[#[0-9a-fA-F]{3,8}\]|#[0-9a-fA-F]{3,8}" 2>/dev/null \
      | grep -vE "$COMMENT_LINE" \
      | awk -F: -v util="$UTIL" -v pal="$PALETTE" -v tg="$TOKEN_GREEN" '
          {
            p=$1; l=$2; line=$0; sub(/^[^:]*:[0-9]+:/, "", line)
            iscss = (p ~ /\.css$/)
            # tw — palette classes. The leading boundary keeps `hover:bg-gray-100`
            # (":" boundary) and rejects `my-bg-gray` identifiers.
            r=line
            re="(^|[^a-zA-Z0-9_-])(" util ")-(" pal ")(-[0-9][0-9]?[0-9]?)?(/[0-9]+)?([^a-zA-Z0-9_-]|$)"
            while (match(r, re)) {
              t=substr(r, RSTART, RLENGTH); adv=RSTART+RLENGTH-1; if (adv<1) adv=1
              sub(/^[^a-zA-Z]/, "", t); sub(/[^a-zA-Z0-9\/]$/, "", t)
              opa=""; if (index(t, "/")) { opa=substr(t, index(t, "/")); t=substr(t, 1, index(t, "/")-1) }
              shade=t; sub("^(" util ")-", "", shade)
              skip=0
              if (shade ~ tg) skip=1
              if (t == "text-white") skip=1
              if (t == "bg-black" && opa != "") skip=1
              if (!skip) print p "\t" l "\t" t
              r=substr(r, adv)
            }
            # arb — Tailwind arbitrary hex value
            r=line
            while (match(r, /-\[#[0-9a-fA-F]+\]/)) { t=substr(r, RSTART, RLENGTH); n=length(t)-4
              if (n==3||n==4||n==6||n==8) print p "\t" l "\tarb:" tolower(substr(t, 3, length(t)-3)); r=substr(r, RSTART+RLENGTH) }
            # hex — a quoted JS literal, or a CSS declaration value
            r=line
            if (iscss) hre="[:,( ]#[0-9a-fA-F]+([; ,)!]|$)"; else hre="[\"\x27`]#[0-9a-fA-F]+[\"\x27`]"
            while (match(r, hre)) { t=substr(r, RSTART+1, RLENGTH-1); sub(/[^0-9a-fA-F#]$/, "", t); n=length(t)-1
              if (n==3||n==4||n==6||n==8) print p "\t" l "\thex:" tolower(t); r=substr(r, RSTART+RLENGTH-1) }
          }'
  )
}

count_files() { list_files "$1" | grep -c . || true; }
keys_of() { awk -F'\t' '{ print $1 ":" $3 }' | LC_ALL=C sort; }
# `return 0` is load-bearing — see z-index-tokens.sh baseline_keys().
baseline_keys() { [ -f "$1" ] && grep -vE '^[[:space:]]*(#|$)' "$1" | LC_ALL=C sort; return 0; }

run() {
  local repo="$1" baseline="$2" label="$3"
  local files records current frozen new stale

  files="$(count_files "$repo")"
  if [ "${files:-0}" -eq 0 ]; then
    echo "::error::${label}: parsed 0 files under frontend/{app,components,lib,hooks} — every result below is void, NOT passing." >&2
    return 1
  fi

  records="$(scan "$repo")"
  current="$(printf '%s\n' "$records" | grep . | keys_of)"
  frozen="$(baseline_keys "$baseline")"
  new="$(comm -23 <(printf '%s\n' "$current" | grep .) <(printf '%s\n' "$frozen" | grep .))"
  stale="$(comm -13 <(printf '%s\n' "$current" | grep .) <(printf '%s\n' "$frozen" | grep .))"

  echo "${label}: ${files} files scanned · $(printf '%s\n' "$current" | grep -c . || true) raw colour occurrences (tw $(printf '%s\n' "$records" | grep -vcE $'\t(arb|hex):' || true) · arb $(printf '%s\n' "$records" | grep -c $'\tarb:' || true) · hex $(printf '%s\n' "$records" | grep -c $'\thex:' || true)) · baseline $(printf '%s\n' "$frozen" | grep -c . || true) lines"

  local rc=0
  if [ -n "$new" ]; then
    rc=1
    echo "::error::${label}: raw colour NOT in the baseline (new, or one more occurrence in a file that already has some):" >&2
    printf '%s\n' "$new" | LC_ALL=C uniq -c | while read -r cnt key; do
      local p="${key%%:*}" lit="${key#*:}" have
      have="$(printf '%s\n' "$frozen" | grep -cxF "$key" || true)"
      printf '%s\n' "$records" | awk -F'\t' -v p="$p" -v lit="$lit" '$1==p && $3==lit { print "  - " $1 ":" $2 "  " $3 }' >&2
      printf '    (%s in baseline, %s now)\n' "$have" "$((have + cnt))" >&2
    done
    echo "  Use a token class instead (bg-surface, text-muted, border-border, text-error … — frontend/tailwind.tokens.json). If the fixed colour is the decision (a third-party brand colour, an SVG fill), run --update-baseline and say why in the PR body." >&2
  fi
  if [ -n "$stale" ]; then
    rc=1
    echo "::error::${label}: baseline line(s) that match nothing any more — the baseline must shrink, remove the stale line(s):" >&2
    printf '%s\n' "$stale" | LC_ALL=C uniq -c | while read -r cnt key; do
      printf '  - scripts/checks/raw-color-baseline.txt: %s  (x%s)\n' "$key" "$cnt" >&2
    done
    echo "  Run --update-baseline (it only ever records what is live)." >&2
  fi
  return $rc
}

write_baseline() {
  {
    echo "# GENERATED by scripts/checks/raw-color-tokens.sh --update-baseline (MEH-2717)"
    echo "# One line per raw colour OCCURRENCE in frontend/{app,components,lib,hooks}: path:literal."
    echo "# A raw colour not listed here fails the gate; a line here that matches"
    echo "# nothing fails too. Shrinking this file is the point; growing it needs a"
    echo "# reason in the PR body. Never edit by hand — regenerate."
    scan "$1" | keys_of
  } > "$2"
}

self_test() {
  local tmp pass=0 total=7 got expect real
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  mkdir -p "$tmp/frontend/components" "$tmp/frontend/app" "$tmp/frontend/components/__tests__"

  # 1 — a new raw class, empty baseline → red
  printf 'export default () => <div className="p-4 bg-gray-100" />;\n' > "$tmp/frontend/components/A.jsx"
  : > "$tmp/base.txt"
  if run "$tmp" "$tmp/base.txt" "selftest/new" >/dev/null 2>&1; then
    echo "SELF-TEST FAIL 1: a new raw colour did not red the guard" >&2; return 1
  fi; pass=$((pass+1))

  # 2 — the same class, baselined → green
  printf 'frontend/components/A.jsx:bg-gray-100\n' > "$tmp/base.txt"
  if ! run "$tmp" "$tmp/base.txt" "selftest/baselined" >/dev/null 2>&1; then
    echo "SELF-TEST FAIL 2: a baselined raw colour did not pass" >&2; return 1
  fi; pass=$((pass+1))

  # 3 — tokens, carve-outs, comments, identifiers and tests → zero records
  cat > "$tmp/frontend/components/A.jsx" <<'JSX'
// bg-gray-100 and "#ffffff" in a line comment are prose
/* neither is text-red-500 here */
const debugBgGray = 1;
export default () => (
  <div className="bg-primary text-muted bg-surface border-border bg-green-500 hover:bg-green-700 text-white bg-black/40 bg-[var(--x)]" href="#top" />
);
JSX
  printf 'export default () => <div className="bg-gray-100" style={{ color: "#fff" }} />;\n' > "$tmp/frontend/components/__tests__/A.test.jsx"
  printf '.a { color: var(--c); }\n/* color: #fff; */\n' > "$tmp/frontend/app/t.css"
  : > "$tmp/base.txt"
  got="$(scan "$tmp")"
  if [ -n "$got" ]; then
    echo "SELF-TEST FAIL 3: scanner emitted records for token/carve-out/comment/test input:" >&2; printf '%s\n' "$got" >&2; return 1
  fi
  if ! run "$tmp" "$tmp/base.txt" "selftest/clean" >/dev/null 2>&1; then
    echo "SELF-TEST FAIL 3: clean input did not pass" >&2; return 1
  fi; pass=$((pass+1))

  # 4 — a stale baseline line → red even on a clean scan
  printf 'frontend/components/Gone.jsx:bg-gray-100\n' > "$tmp/base.txt"
  if run "$tmp" "$tmp/base.txt" "selftest/stale" >/dev/null 2>&1; then
    echo "SELF-TEST FAIL 4: a stale baseline line did not red the guard" >&2; return 1
  fi; pass=$((pass+1))

  # 5 — multiset: one occurrence baselined, the file now carries two → red
  printf 'export const A = () => <p className="text-gray-600" />;\nexport const B = () => <p className="text-gray-600" />;\n' > "$tmp/frontend/components/A.jsx"
  printf 'frontend/components/A.jsx:text-gray-600\n' > "$tmp/base.txt"
  if run "$tmp" "$tmp/base.txt" "selftest/second" >/dev/null 2>&1; then
    echo "SELF-TEST FAIL 5: a second occurrence did not red the guard" >&2; return 1
  fi; pass=$((pass+1))

  # 6 — every form is extracted: variants, opacity, sides, non-token green, arb, JS hex, CSS hex
  printf 'export default () => <div className="hover:bg-gray-50 border-t-gray-200 bg-white/80 bg-black text-green-600 bg-[#F5F0E8]" style={{ color: "#2E6853", fill: `#abc` }} />;\n' > "$tmp/frontend/components/A.jsx"
  printf '.a { color: #fff; background: linear-gradient(#000,#111111); }\n' > "$tmp/frontend/app/t.css"
  got="$(scan "$tmp" | keys_of)"
  expect="$(printf '%s\n' \
    frontend/app/t.css:hex:#000 frontend/app/t.css:hex:#111111 frontend/app/t.css:hex:#fff \
    frontend/components/A.jsx:arb:#f5f0e8 frontend/components/A.jsx:bg-black frontend/components/A.jsx:bg-gray-50 \
    frontend/components/A.jsx:bg-white frontend/components/A.jsx:border-t-gray-200 frontend/components/A.jsx:hex:#2e6853 \
    frontend/components/A.jsx:hex:#abc frontend/components/A.jsx:text-green-600 | LC_ALL=C sort)"
  if [ "$got" != "$expect" ]; then
    echo "SELF-TEST FAIL 6: form extraction — expected:" >&2; printf '%s\n' "$expect" >&2; echo "got:" >&2; printf '%s\n' "$got" >&2; return 1
  fi; pass=$((pass+1))

  # 7 — controls: an empty root is VOID, and the real corpus parses (MEH-1909)
  rm -rf "$tmp/frontend"; mkdir -p "$tmp/frontend"
  if run "$tmp" "$tmp/base.txt" "selftest/void" >/dev/null 2>&1; then
    echo "SELF-TEST FAIL 7: a root with no frontend files passed instead of failing loudly" >&2; return 1
  fi
  real="$(scan "$ROOT" | grep -c $'\tbg-white$' || true)"
  if [ "$real" -lt 1 ]; then
    echo "SELF-TEST FAIL 7: the scanner finds no bg-white in the real repo — it is not parsing the shape this repo uses" >&2; return 1
  fi; pass=$((pass+1))

  echo "self-test: ${pass}/${total} (new reds · baselined passes · tokens/carve-outs/comments/tests pass · stale reds · second occurrence reds · all forms extracted · void control + real-corpus anchor)"
  return 0
}

case "${1:-}" in
  --update-baseline)
    write_baseline "$ROOT" "$BASELINE"
    echo "wrote ${BASELINE#"$ROOT"/} ($(grep -vcE '^[[:space:]]*(#|$)' "$BASELINE") lines)"
    exit 0 ;;
  --self-test)
    self_test; exit $? ;;
  "")
    if ! self_test >/dev/null; then
      echo "::error::raw-color-tokens: preflight self-test failed — the gate's verdict below cannot be trusted" >&2
      self_test >&2; exit 1
    fi
    run "$ROOT" "$BASELINE" "raw-color-tokens"; exit $? ;;
  *)
    echo "raw-color-tokens: unknown flag '$1' (accepted: --update-baseline, --self-test)" >&2; exit 2 ;;
esac
