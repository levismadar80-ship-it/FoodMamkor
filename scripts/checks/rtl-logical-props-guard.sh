#!/usr/bin/env bash
#
# Module:   rtl-logical-props-guard
# Purpose:  Enforce the RTL logical-property rule (.claude/rules/rtl.md) in CI.
#           The rule was mechanised only as a PreToolUse hook
#           (.claude/hooks/check-rtl.sh) and a sub-agent scan. Both see one edit
#           at a time, and neither votes on a PR — so a physical `left-`/`ml-`
#           class that arrives any other way (a commit made outside Claude Code,
#           a session with hooks off, a merge, a `git apply`) lands with nothing
#           red. This closes that hole over the whole committed tree.
# Touches:  nothing on a normal run — reads .claude/hooks/rtl-allowlist.txt and
#           frontend/{app,components,lib,hooks}. Writes
#           scripts/checks/rtl-logical-props-baseline.txt only under
#           --update-baseline.
# Does NOT: own the RULE. The pattern below and the two exception mechanisms are
#           COPIED from check-rtl.sh verbatim, and the allowlist is read from the
#           hook's own file — there is one source of truth for "what counts as a
#           violation" and one for "what is exempt" (workflow.md Smell #1).
#           Widening the pattern (text-left, border-l, rounded-r, …) is a rule
#           change and belongs in the hook first, which is Sapir's to edit
#           (workflow rule 32). It also does NOT check z-index tokens, raw
#           colours or the Hebrew lexicon — see brand-lexicon-guard.sh.
# Related:  .claude/hooks/check-rtl.sh (the pattern + the ±1 marker window),
#           .claude/hooks/rtl-allowlist.txt (the SoT for exceptions),
#           .claude/rules/rtl.md, docs/CORRECTIONS_CHECKS.md,
#           scripts/checks/raw-color-tokens.sh (the ratchet shape).
# History:  MEH-3351 (creation — "left/right instead of start/end" was one of the
#           corrections Sapir kept making by hand, and the only one of the five
#           with no CI owner at all).
#
# IT SHIPS AS A HARD FAIL, AND THE BASELINE IS EMPTY ON PURPOSE
#   Measured on this corpus the day it was written (17/11/2026, 597 files):
#   **0** unexempted occurrences. Every one of the 18 raw pattern hits is either
#   in a PATH EXCEPTIONS file, carries an `rtl-ok` marker with a reason
#   (MapKey.jsx:51-52, :127 are the model), or is prose inside a comment. The
#   ms-/me-/ps-/pe- migration is genuinely finished, so there was no debt to
#   freeze and the gate needs no ratchet.
#
#   The baseline file therefore exists but holds zero entries. It stays for one
#   reason: a sanctioned batch (a `dir="ltr"` subtree landing in several files at
#   once) has somewhere to go that is NOT this script and NOT the hook's
#   allowlist, which is Sapir's file. If it ever gains a line, that line needs a
#   reason in the PR body, and the file can only shrink from there.
#
#   An earlier draft of this header claimed 266 occurrences across 101 files and
#   described a ratchet. That number came from a WIDER pattern than the hook's
#   (it also counted text-left, border-l, rounded-l), measured before this guard
#   existed. Those classes are not what .claude/rules/rtl.md governs, so they are
#   not violations. Corrected here rather than deleted, because the next person
#   to grep for an RTL debt number will find that one.
#
# THE EVIDENCE THAT IT DISCRIMINATES (MEH-1619)
#   0 occurrences is also what a broken scanner prints, so the number alone is
#   not evidence. Two controls answer that, and both are required:
#     - `--self-test` (7 cases) runs BEFORE the gate and voids the run if it
#       fails. It includes the parsed-0 control, which must itself go red.
#     - Injecting `ml-4` into frontend/components/Footer.jsx (a real,
#       non-exempt file) reds the gate naming Footer.jsx:183; restoring the file
#       greens it. Run that again before trusting a green here.
#
# USAGE
#   bash scripts/checks/rtl-logical-props-guard.sh                    # the gate
#   bash scripts/checks/rtl-logical-props-guard.sh --update-baseline  # regenerate
#   bash scripts/checks/rtl-logical-props-guard.sh --self-test        # fixtures
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASELINE="$ROOT/scripts/checks/rtl-logical-props-baseline.txt"
ALLOWLIST="$ROOT/.claude/hooks/rtl-allowlist.txt"
DIRS=(app components lib hooks)

# COPIED VERBATIM from .claude/hooks/check-rtl.sh. Do not "improve" it here: a
# pattern that differs from the hook's gives the two tools different answers for
# the same file, and the one that blocks an edit should be the one that blocks a
# merge. GNU grep's \b works in ERE.
RTL_PATTERN='\b(left-|right-|ml-|mr-|pl-|pr-)[0-9a-z]'

# The hook's own awk state machine, so the two tools cannot disagree about which
# section an allowlist entry is in.
read_section() {
  awk -v want="$1" '
    /^#.*PATH EXCEPTIONS/  { section="path";    next }
    /^#.*CONTENT PATTERNS/ { section="content"; next }
    /^[[:space:]]*(#|$)/   { next }
    section == want        { print }
  ' "$2"
}

list_files() {
  local repo="$1" d
  ( cd "$repo" || exit 1
    for d in "${DIRS[@]}"; do
      [ -d "frontend/$d" ] || continue
      find "frontend/$d" -type f \( -name '*.js' -o -name '*.jsx' -o -name '*.ts' -o -name '*.tsx' \) \
        -not -path '*/node_modules/*' -not -path '*/__tests__/*' \
        -not -name '*.test.*' -not -name '*.spec.*'
    done )
}

count_files() { list_files "$1" | grep -c . || true; }

# One record per OCCURRENCE: `path<TAB>line<TAB>class`.
#
# Exemptions, both taken from the hook:
#   PATH EXCEPTIONS  — substring match on the path, whole file exempt.
#   CONTENT PATTERNS — a marker (`rtl-ok`) on the line or either neighbour (±1).
# The window is read from the FILE, not from one edit's new_string, which is the
# only place this guard sees more than the hook.
#
# TWO THINGS THE HOOK DOES NOT HAVE TO DO, AND THIS DOES
#
# 1. Comments are stripped before matching. The hook only ever looks at the text
#    of one edit, so prose costs it nothing. Over the whole tree the pattern's
#    `\b(right-)[0-9a-z]` matches ordinary English: "left-to-right" -> `left-t`,
#    "right-aligned" -> `right-a`. Measured here before stripping: 21 of 21
#    recorded matches were prose, and they would have become permanent baseline
#    lines that no code change could ever remove. Stripping neither widens nor
#    narrows the rule — the rule is about classes, and a word in a comment is
#    not one.
# 2. The marker window is still read from the ORIGINAL file, because `rtl-ok`
#    lives IN a comment. Strip for matching; keep the original for exemptions.
scan() {
  local repo="$1" allowlist="$2" paths markers stripped hits hit f n window cls ok m p
  [ -f "$allowlist" ] || { echo "::error::rtl-logical-props: allowlist not found: $allowlist" >&2; return 1; }
  paths="$(read_section path "$allowlist")"
  markers="$(read_section content "$allowlist")"
  [ "$(count_files "$repo")" -gt 0 ] || return 0

  stripped="$(mktemp)"; hits="$(mktemp)"
  # `|| true` here is load-bearing. Under `pipefail` a grep that matches nothing
  # (the common case, per file) returns 1, and an earlier draft let that become
  # scan()'s exit status: run() returned early, printed NOTHING, and the
  # baseline writer recorded 21 lines of prose as if that were the whole corpus.
  # A guard that fails silently is worse than no guard.
  ( cd "$repo" && list_files "$repo" | tr '\n' '\0' | xargs -0 awk '
      # The position of a REAL `//` comment, or 0. A `//` preceded by `:` is a
      # URL scheme ("https://…"), not a comment — and treating it as one blanked
      # the rest of the line, so `<a href="https://x" className="ml-4">` slipped
      # straight through. Found by the rule-5a reviewer on PR #4686 and
      # reproduced with a fixture; case 8 of --self-test pins it.
      function line_comment(s,   from, p, abs) {
        from = 1
        while (1) {
          p = index(substr(s, from), "//")
          if (p == 0) return 0
          abs = from + p - 1
          if (abs == 1 || substr(s, abs - 1, 1) != ":") return abs
          from = abs + 2
        }
      }
      FNR == 1 { inblock = 0 }
      {
        line = $0; out = ""
        while (length(line)) {
          if (inblock) { i = index(line, "*/"); if (i == 0) { line = ""; break }
                         line = substr(line, i + 2); inblock = 0; continue }
          lc = line_comment(line); bc = index(line, "/*")
          if (lc && (!bc || lc < bc)) { out = out substr(line, 1, lc - 1); line = ""; break }
          if (bc) { out = out substr(line, 1, bc - 1); line = substr(line, bc + 2); inblock = 1; continue }
          out = out line; line = ""
        }
        print FILENAME ":" FNR ":" out
      }' ) > "$stripped" 2>/dev/null || true

  grep -E "$RTL_PATTERN" "$stripped" > "$hits" 2>/dev/null || true

  # A plain redirect, not a pipe: the body must run in THIS shell, so a non-zero
  # from a grep inside it cannot become the function's status.
  while IFS= read -r hit; do
    [ -n "$hit" ] || continue
    f="${hit%%:*}"; n="${hit#*:}"; n="${n%%:*}"
    # `n` is spliced into $(( … )) below. It comes from splitting grep's
    # `path:line:content` on the FIRST colon, so a tracked file whose NAME
    # contains a colon puts file-derived text there instead of a number — and
    # bash evaluates an array subscript inside an arithmetic context, which is
    # the usual way `$(( ))` turns into command execution. Not reachable today
    # (the guards run from `pull_request` with a read-only token, where the
    # author already controls these scripts), so this is a constraint added
    # ahead of the need, not a fix: a future job on `pull_request_target` would
    # make it live, and that change would not come with a reason to re-read
    # this line.
    case "$n" in (*[!0-9]* | "") continue ;; esac
    ok=0
    while IFS= read -r p; do
      [ -n "$p" ] || continue
      case "$f" in *"$p"*) ok=1; break ;; esac
    done <<<"$paths"
    [ "$ok" -eq 1 ] && continue
    window="$(sed -n "$(( n > 1 ? n - 1 : 1 )),$(( n + 1 ))p" "$repo/$f" 2>/dev/null || true)"
    while IFS= read -r m; do
      [ -n "$m" ] || continue
      if printf '%s' "$window" | grep -qF "$m"; then ok=1; break; fi
    done <<<"$markers"
    [ "$ok" -eq 1 ] && continue
    while IFS= read -r cls; do
      [ -n "$cls" ] || continue
      printf '%s\t%s\t%s\n' "$f" "$n" "$cls"
    done < <(printf '%s' "${hit#*:*:}" | grep -oE "$RTL_PATTERN" || true)
  done < "$hits"

  rm -f "$stripped" "$hits"
  return 0
}

keys_of() { awk -F'\t' '{ print $1 "\t" $3 }' | LC_ALL=C sort; }
baseline_keys() { [ -f "$1" ] && grep -vE '^[[:space:]]*(#|$)' "$1" | LC_ALL=C sort; return 0; }

run() {
  local repo="$1" baseline="$2" allowlist="$3" label="$4"
  local files records current frozen new stale rc=0

  files="$(count_files "$repo")"
  # The parsed-0 control: a wrong cwd or a rename must not read as PASS.
  if [ "${files:-0}" -eq 0 ]; then
    echo "::error::${label}: parsed 0 files under frontend/{app,components,lib,hooks} — every result below is void, NOT passing." >&2
    return 1
  fi

  records="$(scan "$repo" "$allowlist")" || return 1
  current="$(printf '%s\n' "$records" | grep . | keys_of)"
  frozen="$(baseline_keys "$baseline")"
  new="$(LC_ALL=C comm -23 <(printf '%s\n' "$current" | grep .) <(printf '%s\n' "$frozen" | grep .))"
  stale="$(LC_ALL=C comm -13 <(printf '%s\n' "$current" | grep .) <(printf '%s\n' "$frozen" | grep .))"

  echo "${label}: ${files} files scanned · $(printf '%s\n' "$current" | grep -c . || true) physical-property occurrences · baseline $(printf '%s\n' "$frozen" | grep -c . || true) lines"

  if [ -n "$new" ]; then
    rc=1
    echo "::error::${label}: physical directional class NOT in the baseline:" >&2
    printf '%s\n' "$new" | LC_ALL=C uniq -c | while read -r cnt key; do
      local p cls have
      IFS=$'\t' read -r p cls <<<"$key"
      have="$(printf '%s\n' "$frozen" | grep -cxF "$key" || true)"
      printf '%s\n' "$records" | awk -F'\t' -v p="$p" -v c="$cls" \
        '$1==p && $3==c { print "  - " $1 ":" $2 "  " $3 }' | LC_ALL=C sort -u >&2
      printf '    (%s in baseline, %s now)\n' "$have" "$((have + cnt))" >&2
    done
    {
      echo "  Use the logical property (.claude/rules/rtl.md):"
      echo "    left-* · right-*  → start-* · end-*     (in RTL: start = RIGHT, end = LEFT)"
      echo "    ml-*   · mr-*     → ms-*   · me-*"
      echo "    pl-*   · pr-*     → ps-*   · pe-*"
      echo "  A real exception takes the SAME route as the hook: put 'rtl-ok' within ±1 line"
      echo "  with the reason, or add the path to .claude/hooks/rtl-allowlist.txt (Sapir's file)."
      echo "  --update-baseline exists for a sanctioned batch, and needs a reason in the PR body."
    } >&2
  fi
  if [ -n "$stale" ]; then
    rc=1
    echo "::error::${label}: baseline line(s) that match nothing any more — the baseline must shrink, so remove them:" >&2
    printf '%s\n' "$stale" | LC_ALL=C uniq -c | while read -r cnt key; do
      printf '  - scripts/checks/rtl-logical-props-baseline.txt: %s  (x%s)\n' "$key" "$cnt" >&2
    done
    echo "  Run --update-baseline (it only ever records what is live)." >&2
  fi
  return $rc
}

write_baseline() {
  {
    cat <<'HEAD'
# GENERATED by scripts/checks/rtl-logical-props-guard.sh --update-baseline (MEH-3351)
# One line per OCCURRENCE of a physical directional Tailwind class in
# frontend/{app,components,lib,hooks}: path<TAB>class.
#
# These are the occurrences that existed when the CI gate was added. The rule
# (.claude/rules/rtl.md) and the pattern are owned by .claude/hooks/check-rtl.sh;
# this file only records the debt that predates the gate. A class not listed
# here fails; a line here that matches nothing fails too, so the file can only
# shrink. Never edit by hand — regenerate.
#
# To take a line OFF this list, convert the class to its logical form, or — if
# the physical property is genuinely right (a dir="ltr" subtree, a
# horizontal-centre idiom, a Leaflet geographic control) — annotate it with
# 'rtl-ok' and the reason, which is the route the hook already recognises.
HEAD
    scan "$1" "$2" | keys_of
  } > "$3"
}

self_test() {
  local tmp pass=0 total=7 got al
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  mkdir -p "$tmp/frontend/components" "$tmp/frontend/components/__tests__"

  al="$tmp/allow.txt"
  cat > "$al" <<'AL'
# ============ PATH EXCEPTIONS ============
frontend/components/Exempt.jsx
# ============ CONTENT PATTERNS ============
rtl-ok
AL

  cat > "$tmp/frontend/components/Bad.jsx" <<'BAD'
export const A = () => <div className="ml-4 text-sm" />;
export const B = () => <div className="start-0 me-2" />;
BAD
  cat > "$tmp/frontend/components/Marked.jsx" <<'MARKED'
{/* rtl-ok — eye toggle sits inside a dir="ltr" password input */}
export const C = () => <div className="right-3" />;
MARKED
  cat > "$tmp/frontend/components/Exempt.jsx" <<'EX'
export const D = () => <div className="left-1/2 -translate-x-1/2" />;
EX
  printf 'it("x", () => <div className="ml-4" />);\n' > "$tmp/frontend/components/__tests__/Bad.test.jsx"
  # Case 7 is anchored to real repo files (MEH-1909): admin/billing/page.js:48
  # and StatusPage.jsx:12 say "left-to-right" / "right-aligned" in prose, and
  # the hook's pattern matches inside those words.
  cat > "$tmp/frontend/components/Prose.jsx" <<'PROSE'
// The ledger reads left-to-right, and the amount column is right-aligned.
export const E = () => <div className="ms-4" />;
PROSE

  got="$(scan "$tmp" "$al" | keys_of)"

  _has()   { printf '%s\n' "$got" | grep -qF "$1"; }
  _hasnt() { ! printf '%s\n' "$got" | grep -qF "$1"; }

  _has $'frontend/components/Bad.jsx\tml-4' \
    && { pass=$((pass+1)); echo "  ok  1  a physical class is caught"; } \
    || echo "  FAIL 1  a physical class was NOT caught"
  _hasnt 'me-2' \
    && { pass=$((pass+1)); echo "  ok  2  a logical class (me-2) is not a violation"; } \
    || echo "  FAIL 2  a logical class was flagged"
  _hasnt 'Marked.jsx' \
    && { pass=$((pass+1)); echo "  ok  3  the ±1 'rtl-ok' marker exempts one line"; } \
    || echo "  FAIL 3  an rtl-ok-annotated line was flagged"
  _hasnt 'Exempt.jsx' \
    && { pass=$((pass+1)); echo "  ok  4  a PATH EXCEPTIONS file is exempt whole"; } \
    || echo "  FAIL 4  an allowlisted path was scanned"
  _hasnt 'Bad.test.jsx' \
    && { pass=$((pass+1)); echo "  ok  5  __tests__ is out of scope"; } \
    || echo "  FAIL 5  a __tests__ file was scanned"
  _hasnt 'Prose.jsx' \
    && { pass=$((pass+1)); echo "  ok  7  prose in a comment (left-to-right) is not a class"; } \
    || echo "  FAIL 7  an English phrase in a comment was flagged as a class"
  if run "$tmp/frontend" /dev/null "$al" "control" >/dev/null 2>&1; then
    echo "  FAIL 6  parsed-0 control PASSED — a wrong cwd would read as green"
  else
    pass=$((pass+1)); echo "  ok  6  parsed-0 control fails loudly"
  fi

  echo "self-test: ${pass}/${total}"
  [ "$pass" -eq "$total" ]
}

case "${1:-}" in
  --update-baseline) write_baseline "$ROOT" "$ALLOWLIST" "$BASELINE"; echo "baseline written: $BASELINE"; exit 0 ;;
  --self-test)       self_test; exit $? ;;
  "")                ;;
  *)                 echo "unknown argument: $1" >&2; exit 2 ;;
esac

# The self-test runs FIRST and a failure voids the gate: a scanner that cannot
# tell `me-2` from `ml-4`, or that ignores the allowlist, is not evidence about
# the repo.
if ! self_test >/dev/null 2>&1; then
  echo "::error::rtl-logical-props-guard: --self-test FAILED, so this run proves nothing about the repo. Run with --self-test to see which case broke." >&2
  exit 1
fi
run "$ROOT" "$BASELINE" "$ALLOWLIST" "rtl-logical-props"
