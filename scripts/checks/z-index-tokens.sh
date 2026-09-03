#!/usr/bin/env bash
#
# Module:   z-index-tokens
# Purpose:  Ratchet the z-index scale. Every LITERAL z-index in frontend/ is
#           frozen, occurrence by occurrence, in a committed baseline; a literal
#           that is not in the baseline fails, and a baseline line that no
#           longer matches anything fails too, so the file can only shrink and
#           cannot rot. Three literal forms are scanned:
#             tw     Tailwind arbitrary   className="… z-[1050] …"     (.js .jsx .ts .tsx)
#             css    a declaration        z-index: 1000;               (.css)
#             style  an inline style      style={{ zIndex: 9999 }}     (.js .jsx .ts .tsx)
#           Token-derived forms are NOT literals and never match: z-[var(--z-x)],
#           zIndex: Z.x, a bare Tailwind class (z-10, z-modal), z-index: var(--z-x).
# Touches:  nothing on a normal run — reads frontend/ and the baseline. Writes
#           scripts/checks/z-index-baseline.txt only under --update-baseline.
# Does NOT: judge whether a value is RIGHT for its context. MEH-2148 is the
#           proof that a synced table cannot: MiniMap's z-[1000] was recorded
#           correctly for months while painting over a CTA. What a script can
#           decide is "did a literal enter that nobody wrote down", and that is
#           all this decides. It also does not scan comments: a line that starts
#           with `*`, `//`, `/*` or `{/*` is prose (same isComment() as
#           frontend/__tests__/ZTokenLedgerSync.test.js:27-29 — and the same
#           blind spot: a block-comment continuation line starting with prose is
#           counted; spell tokens without brackets in prose, per rtl.md).
# Related:  scripts/checks/z-index-baseline.txt (the frozen multiset — the FILE
#           is the baseline; no count is typed anywhere),
#           frontend/__tests__/ZTokenLedgerSync.test.js (the ledger ↔ code sync
#           this gate sits in front of: that test catches a table that drifted,
#           this catches a value that entered),
#           scripts/checks/dashboard-field-guidance-ratchet.sh (the ratchet
#           shape copied, incl. the parsed-0 control), .claude/rules/rtl.md
#           § "Map z-index tokens" (the scale as documentation).
# History:  MEH-2228 (creation).
#
# WHY A MULTISET AND NOT A SET
#   A baseline line is `path:literal`, one line PER OCCURRENCE, so a file that
#   already carries one z-[9000] and gains a second reds — the second one is
#   the new literal, and a set would have hidden it behind the first. Line
#   numbers are deliberately NOT part of the key: moving code inside a file
#   must not churn the baseline. On failure the guard prints file:line anyway,
#   by re-reading the scan.
#
# WHY IT FAILS AND DOES NOT WARN
#   MEH-1868: "four warn-only gates are four non-gates". A new literal is a
#   red. The escape hatch is `--update-baseline` plus a reason in the PR body,
#   the same single mechanism dashboard-field-guidance-ratchet.sh uses; there is
#   deliberately NO `guard-ok:` marker here — two suppression mechanisms for one
#   fact is the smell #1 shape (workflow.md), and a baseline line is already an
#   attributed, reviewable exception.
#
# CONTROLS (README: "a probe whose null output is also its pass is not a probe")
#   - parsed 0 files → exit 1, "every result below is void". A broken cd or a
#     wrong include list must not read as "no literals".
#   - the committed baseline is non-empty, so a scanner whose regex silently
#     stopped matching reds on STALE lines rather than passing on an empty scan.
#   - --self-test runs 7 fixture cases, one anchored to the real corpus
#     (MEH-1909), and is run as a preflight on every normal invocation.
#
# USAGE
#   bash scripts/checks/z-index-tokens.sh                    # the gate
#   bash scripts/checks/z-index-tokens.sh --update-baseline  # regenerate the file
#   bash scripts/checks/z-index-tokens.sh --self-test        # fixtures only
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASELINE="$ROOT/scripts/checks/z-index-baseline.txt"

INCLUDE_JS=(--include='*.js' --include='*.jsx' --include='*.ts' --include='*.tsx')
INCLUDE_CSS=(--include='*.css')
EXCLUDE=(--exclude-dir=node_modules --exclude-dir=.next --exclude-dir=coverage --exclude-dir='*-snapshots')

# A line that is purely a comment carries prose about a token, not a usage.
COMMENT_LINE='^[^:]*:[0-9]+:[[:space:]]*(\*|//|/\*|\{/\*)'

# Every literal, one record per OCCURRENCE: `path<TAB>line<TAB>literal`.
# Runs from the repo root passed as $1 so paths come out as `frontend/…`.
scan() {
  local repo="$1"
  (
    cd "$repo" || exit 1
    [ -d frontend ] || exit 0
    # tw: z-[N] anywhere on a non-comment line, every match on the line
    grep -rnE 'z-\[[0-9]+\]' frontend "${INCLUDE_JS[@]}" "${EXCLUDE[@]}" 2>/dev/null \
      | grep -vE "$COMMENT_LINE" \
      | awk -F: '{ p=$1; l=$2; sub(/^[^:]*:[0-9]+:/, ""); r=$0
                   while (match(r, /z-\[[0-9]+\]/)) { print p "\t" l "\t" substr(r, RSTART, RLENGTH); r=substr(r, RSTART+RLENGTH) } }'
    # style: zIndex: <int> on a non-comment line
    grep -rnE 'zIndex[[:space:]]*:[[:space:]]*-?[0-9]+' frontend "${INCLUDE_JS[@]}" "${EXCLUDE[@]}" 2>/dev/null \
      | grep -vE "$COMMENT_LINE" \
      | awk -F: '{ p=$1; l=$2; sub(/^[^:]*:[0-9]+:/, ""); r=$0
                   while (match(r, /zIndex[ \t]*:[ \t]*-?[0-9]+/)) { t=substr(r, RSTART, RLENGTH); gsub(/[ \t]/, "", t); print p "\t" l "\t" t; r=substr(r, RSTART+RLENGTH) } }'
    # css: a DECLARATION — the value is followed by its terminator (`;` or `}`,
    # optionally `!important` first). That is what separates `z-index: 1000
    # !important;` (globals.css:347) from the prose at globals.css:354
    # ("… Earlier pass pinned it to z-index:1"), which has no terminator; a
    # `*`/`/*`-led line is dropped like the JS side. A prose line that happens
    # to end `z-index: 5;` would still count — same blind-spot class rtl.md
    # records for bracketed tokens in prose.
    grep -rnE 'z-index[[:space:]]*:[[:space:]]*-?[0-9]+[[:space:]]*(!important)?[[:space:]]*[;}]' frontend "${INCLUDE_CSS[@]}" "${EXCLUDE[@]}" 2>/dev/null \
      | grep -vE "$COMMENT_LINE" \
      | awk -F: '{ p=$1; l=$2; sub(/^[^:]*:[0-9]+:/, ""); r=$0
                   while (match(r, /z-index[ \t]*:[ \t]*-?[0-9]+[ \t]*(!important)?[ \t]*[;}]/)) { t=substr(r, RSTART, RLENGTH); sub(/[ \t]*(!important)?[ \t]*[;}]$/, "", t); gsub(/[ \t]/, "", t); print p "\t" l "\t" t; r=substr(r, RSTART+RLENGTH) } }'
  )
}

# How many candidate files the scan could have looked at — the control.
count_files() {
  local repo="$1"
  [ -d "$repo/frontend" ] || { echo 0; return; }
  find "$repo/frontend" -type f \( -name '*.js' -o -name '*.jsx' -o -name '*.ts' -o -name '*.tsx' -o -name '*.css' \) \
    -not -path '*/node_modules/*' -not -path '*/.next/*' -not -path '*/coverage/*' -not -path '*-snapshots/*' \
    | wc -l | tr -d ' '
}

# scan records → sorted multiset of baseline keys `path:literal`
keys_of() { awk -F'\t' '{ print $1 ":" $3 }' | LC_ALL=C sort; }

baseline_keys() { [ -f "$1" ] && grep -vE '^[[:space:]]*(#|$)' "$1" | LC_ALL=C sort; return 0; }

run() {
  local repo="$1" baseline="$2" label="$3"
  local files records current frozen new stale n_tw n_css n_style

  files="$(count_files "$repo")"
  if [ "$files" -eq 0 ]; then
    echo "::error::${label}: parsed 0 files under frontend/ — every result below is void, NOT passing. (wrong cwd, or the include list no longer matches anything)" >&2
    return 1
  fi

  records="$(scan "$repo")"
  current="$(printf '%s\n' "$records" | grep . | keys_of)"
  frozen="$(baseline_keys "$baseline")"

  n_tw="$(printf '%s\n' "$records" | grep -c $'\tz-\[' || true)"
  n_style="$(printf '%s\n' "$records" | grep -c $'\tzIndex:' || true)"
  n_css="$(printf '%s\n' "$records" | grep -c $'\tz-index:' || true)"

  new="$(comm -23 <(printf '%s\n' "$current" | grep .) <(printf '%s\n' "$frozen" | grep .))"
  stale="$(comm -13 <(printf '%s\n' "$current" | grep .) <(printf '%s\n' "$frozen" | grep .))"

  echo "${label}: ${files} files scanned · $(printf '%s\n' "$current" | grep -c . || true) literal occurrences (tw ${n_tw} · css ${n_css} · style ${n_style}) · baseline $(printf '%s\n' "$frozen" | grep -c . || true) lines"

  local rc=0
  if [ -n "$new" ]; then
    rc=1
    echo "::error::${label}: literal z-index NOT in the baseline (new value, or one more occurrence in a file that already has some):" >&2
    printf '%s\n' "$new" | LC_ALL=C uniq -c | while read -r cnt key; do
      local p="${key%:*}" lit="${key##*:}" have
      have="$(printf '%s\n' "$frozen" | grep -cxF "$key" || true)"
      printf '%s\n' "$records" | awk -F'\t' -v p="$p" -v lit="$lit" '$1==p && $3==lit { print "  - " $1 ":" $2 "  " $3 }' >&2
      printf '    (%s in baseline, %s now)\n' "$have" "$((have + cnt))" >&2
    done
    echo "  Use a token from the scale (.claude/rules/rtl.md § Map z-index tokens) instead of a literal. If the literal is the decision, run --update-baseline and say why in the PR body." >&2
  fi
  if [ -n "$stale" ]; then
    rc=1
    echo "::error::${label}: baseline line(s) that match nothing any more — the baseline must shrink, remove the stale line(s):" >&2
    printf '%s\n' "$stale" | LC_ALL=C uniq -c | while read -r cnt key; do
      printf '  - scripts/checks/z-index-baseline.txt: %s  (x%s)\n' "$key" "$cnt" >&2
    done
    echo "  Run --update-baseline (it only ever records what is live)." >&2
  fi
  return $rc
}

write_baseline() {
  local repo="$1" out="$2"
  {
    echo "# GENERATED by scripts/checks/z-index-tokens.sh --update-baseline (MEH-2228)"
    echo "# One line per literal z-index OCCURRENCE in frontend/: path:literal."
    echo "# A literal not listed here fails the gate; a line here that matches"
    echo "# nothing fails too. Shrinking this file is the point; growing it needs a"
    echo "# reason in the PR body. Never edit by hand — regenerate."
    scan "$repo" | keys_of
  } > "$out"
}

self_test() {
  local tmp pass=0 total=7 real_tw
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  mkdir -p "$tmp/frontend/components" "$tmp/frontend/app"

  # 1 — a new literal, no baseline → red
  printf 'export default () => <div className="fixed z-[9999]" />;\n' > "$tmp/frontend/components/A.jsx"
  : > "$tmp/base.txt"
  if run "$tmp" "$tmp/base.txt" "selftest/new-literal" >/dev/null 2>&1; then
    echo "SELF-TEST FAIL 1: a new literal did not red the guard" >&2; return 1
  fi; pass=$((pass+1))

  # 2 — the same literal, baselined → green
  printf 'frontend/components/A.jsx:z-[9999]\n' > "$tmp/base.txt"
  if ! run "$tmp" "$tmp/base.txt" "selftest/baselined" >/dev/null 2>&1; then
    echo "SELF-TEST FAIL 2: a baselined literal did not pass" >&2; return 1
  fi; pass=$((pass+1))

  # 3 — token-derived usages and comments only → 0 occurrences → green on an empty baseline
  cat > "$tmp/frontend/components/A.jsx" <<'JSX'
// prose about z-[9999] on a comment line is not a usage
/* neither is zIndex: 9999 here */
export default () => (
  <div className="fixed z-[var(--z-modal)] z-modal z-50" style={{ zIndex: Z.modal, opacity: 1 }} />
);
JSX
  # The CSS comment mirrors globals.css:354 — a block-comment continuation
  # line that starts with prose and carries `z-index:1` mid-line.
  printf '.a { z-index: var(--z-header); }\n/* legally required to be VISIBLE.\n   Earlier pass pinned it to z-index:1\n * z-index: 7 on a comment-marker line */\n' > "$tmp/frontend/app/t.css"
  : > "$tmp/base.txt"
  if ! run "$tmp" "$tmp/base.txt" "selftest/token-derived" >/dev/null 2>&1; then
    echo "SELF-TEST FAIL 3: token-derived usage was reported as a literal" >&2; return 1
  fi
  if [ -n "$(scan "$tmp")" ]; then
    echo "SELF-TEST FAIL 3: scanner emitted records for token-derived/comment-only input: $(scan "$tmp")" >&2; return 1
  fi; pass=$((pass+1))

  # 4 — a stale baseline line (file gone) → red, even though the scan is clean
  printf 'frontend/components/Gone.jsx:z-[50]\n' > "$tmp/base.txt"
  if run "$tmp" "$tmp/base.txt" "selftest/stale" >/dev/null 2>&1; then
    echo "SELF-TEST FAIL 4: a stale baseline line did not red the guard" >&2; return 1
  fi; pass=$((pass+1))

  # 5 — multiset: one occurrence baselined, the file now carries two → red
  printf 'export const A = () => <div className="z-[9000]" />;\nexport const B = () => <div className="z-[9000]" />;\n' > "$tmp/frontend/components/A.jsx"
  printf 'frontend/components/A.jsx:z-[9000]\n' > "$tmp/base.txt"
  if run "$tmp" "$tmp/base.txt" "selftest/second-occurrence" >/dev/null 2>&1; then
    echo "SELF-TEST FAIL 5: a second occurrence of a baselined literal did not red the guard" >&2; return 1
  fi
  printf 'frontend/components/A.jsx:z-[9000]\nfrontend/components/A.jsx:z-[9000]\n' > "$tmp/base.txt"
  if ! run "$tmp" "$tmp/base.txt" "selftest/second-occurrence-baselined" >/dev/null 2>&1; then
    echo "SELF-TEST FAIL 5: two baselined occurrences did not pass" >&2; return 1
  fi; pass=$((pass+1))

  # 6 — all three forms are seen, css and style included; the CSS comment continuation is not
  printf 'const s = { position: "fixed", zIndex: 9999 };\nexport default () => <div style={{zIndex:9990}} />;\n' > "$tmp/frontend/components/A.jsx"
  printf '.leaflet-top { z-index: 1000 !important; }\n/* pinned it to z-index:1 once */\n' > "$tmp/frontend/app/t.css"
  local got expect
  got="$(scan "$tmp" | keys_of)"
  expect="$(printf 'frontend/app/t.css:z-index:1000\nfrontend/components/A.jsx:zIndex:9990\nfrontend/components/A.jsx:zIndex:9999\n' | LC_ALL=C sort)"
  if [ "$got" != "$expect" ]; then
    echo "SELF-TEST FAIL 6: form extraction — expected:" >&2; printf '%s\n' "$expect" >&2; echo "got:" >&2; printf '%s\n' "$got" >&2; return 1
  fi; pass=$((pass+1))

  # 7 — controls: an empty root is VOID (exit 1), and the real corpus parses
  #     (MEH-1909: a probe green only on shapes it invented is not validated).
  rm -rf "$tmp/frontend"; mkdir -p "$tmp/frontend"
  if run "$tmp" "$tmp/base.txt" "selftest/void" >/dev/null 2>&1; then
    echo "SELF-TEST FAIL 7: a root with no frontend files passed instead of failing loudly" >&2; return 1
  fi
  real_tw="$(scan "$ROOT" | grep -c $'\tz-\[' || true)"
  if [ "$real_tw" -lt 1 ]; then
    echo "SELF-TEST FAIL 7: the scanner finds no z-[N] in the real repo — it is not parsing the shape this repo uses" >&2; return 1
  fi; pass=$((pass+1))

  echo "self-test: ${pass}/${total} (new literal reds · baselined passes · token-derived passes · stale line reds · second occurrence reds · css+style extracted · void control + real-corpus anchor)"
  return 0
}

case "${1:-}" in
  --update-baseline)
    write_baseline "$ROOT" "$BASELINE"
    echo "wrote ${BASELINE#"$ROOT"/} ($(grep -vcE '^[[:space:]]*(#|$)' "$BASELINE") lines)"
    exit 0
    ;;
  --self-test)
    self_test; exit $?
    ;;
  "")
    # Preflight: a guard whose own discrimination is unproven is a green of
    # unknown wiring (builder-model-guard / claude-md-line-cap-guard precedent).
    if ! self_test >/dev/null; then
      echo "::error::z-index-tokens: preflight self-test failed — the gate's verdict below cannot be trusted" >&2
      self_test >&2; exit 1
    fi
    run "$ROOT" "$BASELINE" "z-index-tokens"; exit $?
    ;;
  *)
    echo "z-index-tokens: unknown flag '$1' (accepted: --update-baseline, --self-test)" >&2; exit 2
    ;;
esac
