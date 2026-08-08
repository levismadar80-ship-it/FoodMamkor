#!/usr/bin/env bash
# Module:   vrt-baseline-sync-guard
# Purpose:  Warn when a PR changes a rendered value in frontend/messages/he.json
#           without refreshing frontend/e2e/visual/parity.spec.ts-snapshots/ in
#           the SAME PR — Bug Protocol 2b in .claude/rules/workflow.md, which
#           until now was prose with nothing enforcing it (MEH-1928).
# Touches:  nothing — reads the git diff and prints to stdout. May run one
#           `git fetch --depth=1` of the base branch in CI.
# Does NOT: regenerate baselines, read PNGs, or judge whether a copy change is
#           actually visible. It cannot: the whole reason the rule exists is
#           that maxDiffPixelRatio 0.02 swallows a full copy change, so "VRT is
#           green" is not evidence either way (.claude/rules/testing.md).
# Related:  scripts/checks/changelog-branch-guard.sh (base resolution, see the
#           DUPLICATION note below), scripts/checks/run-all.sh (discovery),
#           frontend/playwright.config.ts:61 (the 0.02 tolerance).
# History:  MEH-1928 (creation, 2026-08-08).
#
# ---------------------------------------------------------------------------
# WHY WARN-ONLY OVER THE WHOLE FILE, AND NOT A PRECISE NAMESPACE ALLOWLIST
# ---------------------------------------------------------------------------
# The ticket asks for precision: only warn when the changed key actually renders
# on a VRT-covered route (/, /map, /about, /login, /register, producer detail).
# It also says, correctly, not to ship a guard that LOOKS precise and is not.
#
# Phase 0 measured whether that mapping is establishable statically. It is not:
#
#   * 40 files call `useTranslations()` with NO namespace argument and then use
#     full dotted paths, so no namespace string exists to map. Footer.jsx:48 is
#     one of them — and the Footer renders on every single covered route. A
#     closure walk over `useTranslations("ns")` reports `footer` as NOT covered,
#     which is exactly backwards.
#   * 160 call sites build the key with a template literal, and others pass a
#     bare variable (`t(status)`, `t(labelKey)`). Those keys do not exist until
#     runtime. Reproduce:
#       grep -rEc 't\(`[^`]*\$\{' --include=*.js --include=*.jsx \
#         --include=*.ts --include=*.tsx app components lib | awk -F: '{s+=$2} END{print s}'
#     (An earlier draft said 157 and named no method, so nobody could check it;
#     adversarial review measured 101-121 under different scoping and could not
#     reproduce it. The count is scope-dependent, which is the whole reason the
#     command belongs here next to the number.)
#
# An allowlist built from the resolvable subset would be wrong in the UNSAFE
# direction: it would stay silent on a key it could not see, which is the exact
# stale-baseline case this guard exists to catch. A loud guard that is sometimes
# unnecessary is recoverable — `guard-ok:` costs one line. A quiet guard that
# misses is the failure mode.
#
# So: any value change in he.json, no route filtering. If the noise proves
# unbearable in practice, the fix is a *measured* allowlist, not a guessed one.
#
# ---------------------------------------------------------------------------
# DUPLICATION, DECLARED (workflow.md Smell #1)
# ---------------------------------------------------------------------------
# The base-resolution below mirrors changelog-branch-guard.sh's `resolve_base`,
# including the refs/pull/N/merge first-parent path and the frozen/moving tag
# (MEH-1634). There is no shared helper in scripts/checks/ to source, and
# extracting one means editing a guard this ticket does not own.
#
# An earlier draft of this file copied only the ORDERING and skipped the
# frozen/moving distinction, describing the omission here as a minor
# simplification. It was not minor — it was the load-bearing half, and it
# reintroduced MEH-1634 in both directions (see the base-resolution comment).
# Two guards now carry the same ~50 lines of subtle reasoning, and the second
# copy already drifted once before it shipped. **The shared helper is no longer
# a nice-to-have follow-up; it is the fix for a demonstrated failure mode.**
# Reported here rather than done, because it means editing a guard this ticket
# does not own.
set -uo pipefail

# Every path below is repo-relative, and `git diff -- <pathspec>` resolves the
# pathspec against the CWD — so a run from anywhere but the root would match
# nothing and exit 0. The `|| exit 1` is the SC2164 guard the README calls
# load-bearing: without it a failed cd leaves the guard checking the wrong tree
# and reporting PASS.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

MSG_FILE="frontend/messages/he.json"
SNAP_DIR="frontend/e2e/visual/parity.spec.ts-snapshots"

echo "vrt-baseline-sync-guard: mode WARN-ONLY (MEH-1928)"

# --- base resolution -------------------------------------------------------
# FROZEN vs MOVING — the distinction is load-bearing, and it is copied from
# changelog-branch-guard.sh:57-88 rather than reinvented, because that guard
# already paid for getting it wrong (MEH-1634: run 30248101409 reported 47 code
# files on a docs-only PR — all of them staging's churn, in reverse).
#
#   frozen : the base is the exact commit HEAD was built against, so two-dot
#            `git diff BASE HEAD` is exact.
#   moving : the base is a branch TIP that has advanced since this branch
#            forked. Two-dot then reports everything that landed on the base in
#            between, in reverse, as though this branch deleted it. A merge base
#            is required, and three-dot is the only sound comparison.
#
# Both directions of that error are live for THIS guard and both are silent:
#   * another PR's he.json edits get reported against this PR, with correct-
#     looking file:line pointers into lines nobody here touched;
#   * another PR's baseline regen landing on the base makes SNAP_DIR look
#     touched, so a genuine violation reports "the rule is satisfied".
# The second is the dangerous one — it is exactly the quiet miss this guard
# exists to prevent.
#
# ⚠️ The `repo-guards` job checks out at depth 1 (changelog-branch-guard.sh:42),
# and a shallow clone HAS NO MERGE BASE. So "compute a merge base and fall back
# to the tip" is not a fix at all in the one environment that matters: it
# degrades straight back to the unsound two-dot answer, silently. When the base
# is moving and no merge base exists, this guard says so LOUDLY instead.
resolve_base() {
  if [ -n "${VRT_BASELINE_GUARD_BASE:-}" ]; then
    if git rev-parse --verify --quiet "${VRT_BASELINE_GUARD_BASE}^{commit}" >/dev/null; then
      printf '%s\t%s\t%s\n' "$VRT_BASELINE_GUARD_BASE" "VRT_BASELINE_GUARD_BASE override" "frozen"
      return 0
    fi
    echo "  base override VRT_BASELINE_GUARD_BASE is not a commit." >&2
    return 1
  fi
  # A pull_request checkout puts HEAD at refs/pull/N/merge; that ref's FIRST
  # PARENT is the frozen base it was actually built on. Gated on GITHUB_REF so a
  # feature branch whose HEAD is a rule-25 sync merge cannot take this path —
  # there parent 1 is the branch's own previous tip, not a base.
  case "${GITHUB_REF:-}" in
    refs/pull/*/merge)
      if _p="$(git rev-parse --verify --quiet 'HEAD^1' 2>/dev/null)" && [ -n "$_p" ]; then
        printf '%s\t%s\t%s\n' "$_p" "refs/pull/N/merge first parent" "frozen"
        return 0
      fi
      ;;
  esac
  if [ -n "${GITHUB_BASE_REF:-}" ]; then
    if git rev-parse --verify --quiet "origin/${GITHUB_BASE_REF}^{commit}" >/dev/null; then
      printf '%s\t%s\t%s\n' "origin/${GITHUB_BASE_REF}" "GITHUB_BASE_REF tip" "moving"
      return 0
    fi
    if git fetch --no-tags --quiet --depth=1 origin "$GITHUB_BASE_REF" 2>/dev/null &&
       git rev-parse --verify --quiet FETCH_HEAD^{commit} >/dev/null; then
      printf '%s\t%s\t%s\n' "$(git rev-parse FETCH_HEAD)" "GITHUB_BASE_REF tip (fetched)" "moving"
      return 0
    fi
    return 1
  fi
  if git rev-parse --verify --quiet origin/staging^{commit} >/dev/null; then
    printf '%s\t%s\t%s\n' "origin/staging" "origin/staging fallback" "moving"
    return 0
  fi
  return 1
}

# Never report OK for a comparison that did not happen. changelog-branch-guard
# exits non-zero here; this guard is warn-only by ticket mandate, so the
# equivalent is to print the WARNING token — run-all.sh then echoes the output
# and summarises WARN instead of a bare PASS (MEH-1715). A silent exit 0 would
# be indistinguishable from "he.json untouched", which is the decorative-guard
# shape scripts/checks/README.md:165 names outright.
cannot_compare() {
  cat <<EOF

  WARNING — vrt-baseline-sync-guard could not compare anything: $1

  This is NOT a pass. The guard did not read a diff, so it cannot tell you
  whether $MSG_FILE changed without its baselines. Treat it as unknown.
EOF
  exit 0
}

if ! BASE_INFO="$(resolve_base)"; then
  cannot_compare "no base ref resolvable (tried VRT_BASELINE_GUARD_BASE, refs/pull/N/merge, GITHUB_BASE_REF, origin/staging)"
fi
BASE="$(printf '%s' "$BASE_INFO" | cut -f1)"
BASE_HOW="$(printf '%s' "$BASE_INFO" | cut -f2)"
BASE_KIND="$(printf '%s' "$BASE_INFO" | cut -f3)"

if [ "$BASE_KIND" = "frozen" ]; then
  DIFF_BASE="$BASE"
  echo "  base: $BASE ($BASE_HOW) [frozen] — two-dot is exact"
elif MB="$(git merge-base "$BASE" HEAD 2>/dev/null)" && [ -n "$MB" ]; then
  DIFF_BASE="$MB"
  echo "  base: $BASE ($BASE_HOW) [moving] — comparing against merge-base ${MB:0:12}"
else
  cannot_compare "base $BASE ($BASE_HOW) is moving and no merge base exists — a shallow clone cannot produce one, and two-dot against a moving base is unsound (MEH-1634). Re-run with fetch-depth 0, or set VRT_BASELINE_GUARD_BASE to the frozen base."
fi

CHANGED="$(git diff --name-only "$DIFF_BASE" HEAD 2>/dev/null)" || {
  cannot_compare "git diff against $DIFF_BASE failed"
}

echo "$CHANGED" | grep -qx "$MSG_FILE" || {
  echo "  $MSG_FILE untouched — nothing to check."
  exit 0
}

# --- value change vs pure key addition -------------------------------------
# A removed line is a value that changed or went away; a diff with only added
# lines is new keys, which the ticket scopes out. -U0 so context lines cannot
# masquerade as changes.
#
# Output is `file:line<TAB>"key"<TAB>kind` per the scripts/checks/README.md
# contract. A bare key name is not actionable: "cta" occurs dozens of times in
# a 300KB file, so the reader would have to re-derive the diff by hand — the
# work the guard exists to save.
#
# Line numbers come from walking the -U0 hunk headers, NOT from grepping the
# file for the key: grep cannot tell which of the dozen "cta" lines moved.
#
# PAIRING IS POSITIONAL, NOT BY KEY NAME. An earlier draft kept `addline[key]`
# and looked the removed key up in it. That is wrong on this file specifically:
# `"title"` occurs ~150 times, `"heading"` ~81. Two different `"title"` values
# edited on adjacent lines land in ONE -U0 hunk, the map keeps only the last
# write, and the first edit is reported at the wrong line — or, when one edit's
# old value happens to equal another's new value, dropped entirely by the
# comma exemption below. Both were demonstrated in adversarial review.
#
# So within a hunk the k-th removed line pairs with the k-th added line: that is
# what a -U0 hunk means. A removed line with a pair is a VALUE CHANGE reported
# at the new-side line; one without is a REMOVAL reported at the base-side line.
#
# TRAILING-COMMA EXEMPTION — the reason this is not a plain key comparison.
# Inserting a key into a JSON object makes the PREVIOUS sibling gain a comma,
# so the diff of a pure key addition is:
#
#     -      "cta": "גלו את ההבדל"
#     +      "cta": "גלו את ההבדל",
#     +      "new_key": "…"
#
# A removed line is therefore NOT proof that a value changed, and the first
# draft of this guard reported "cta" on every key addition — the exact case the
# ticket scopes out, and the shape every real addition takes. So the k-th
# removed line is dropped when it matches the k-th ADDED line **modulo trailing
# whitespace and one trailing comma**. Comparing positionally rather than by set
# membership is what keeps this narrow: a line that both changed value AND
# gained a comma still differs from its pair, and still fires.
DIFF="$(git diff -U0 "$DIFF_BASE" HEAD -- "$MSG_FILE" 2>/dev/null)"
REMOVED="$(printf '%s\n' "$DIFF" | awk -v f="$MSG_FILE" '
  function keyof(s) {
    if (match(s, /"([^"\\]|\\.)*"[[:space:]]*:/)) return substr(s, RSTART, RLENGTH - 1)
    return ""
  }
  # drop the +/- marker, then trailing spaces and at most one trailing comma
  function norm(s) {
    s = substr(s, 2)
    sub(/[[:space:]]+$/, "", s)
    sub(/,$/, "", s)
    sub(/[[:space:]]+$/, "", s)
    return s
  }
  function flush(   i, k) {
    for (i = 1; i <= nrem; i++) {
      # positional pair: the k-th removed line answers to the k-th added line
      if (i <= nadd && remnorm[i] == addnorm[i]) continue   # comma-only
      k = remk[i]
      # structural lines (braces, brackets) still occupy a slot so the pairing
      # above stays aligned, but they carry no key and are not a finding
      if (k == "") continue
      if (i <= nadd) printf "%s:%d\t%s\tchanged\n", f, addline[i], k
      else           printf "%s:%d\t%s\tremoved (base line)\n", f, remline[i], k
    }
    nrem = 0; nadd = 0
  }
  /^@@/ {
    flush()
    # @@ -oldStart[,oldCount] +newStart[,newCount] @@
    split($2, o, ","); split($3, n, ",")
    oldno = substr(o[1], 2) + 0
    newno = substr(n[1], 2) + 0
    next
  }
  /^\+\+\+/ || /^---/ { next }
  /^\+/ {
    nadd++; addline[nadd] = newno; addnorm[nadd] = norm($0)
    newno++; next
  }
  /^-/ {
    nrem++; remk[nrem] = keyof($0); remline[nrem] = oldno; remnorm[nrem] = norm($0)
    oldno++; next
  }
  END { flush() }
' | sort -u)"

if [ -z "$REMOVED" ]; then
  echo "  $MSG_FILE touched, but the diff adds keys only (no value changed) — no baseline implication."
  exit 0
fi

if echo "$CHANGED" | grep -q "^$SNAP_DIR/"; then
  echo "  value(s) changed in $MSG_FILE AND $SNAP_DIR/ moved in the same PR — the rule is satisfied."
  exit 0
fi

# --- escape hatch ----------------------------------------------------------
# `guard-ok: <reason>` in the TIP commit's message. A bare `guard-ok:` with no
# reason does NOT count.
#
# Scoped to one commit, not to the whole branch range. scripts/checks/README.md
# puts the marker on the offending line ±1; he.json is JSON and cannot carry a
# comment, so the commit message is the nearest available carrier — but reading
# the entire range recreates the problem the ±1 window exists to prevent. An
# unrelated `guard-ok:` written three commits ago for a different guard would
# silence a genuine, later violation, and a contributor could trip that by
# accident rather than by intent. Demonstrated in adversarial review.
#
# Walks first parents past merge commits, exactly as builder-model-guard does:
# rule 25 requires `git merge origin/staging` before every push, so the tip is
# frequently a sync merge that carries no authored message.
hatch_commit() {
  c=HEAD
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    [ "$(git rev-list --count --merges "$c" -1 2>/dev/null)" = "1" ] || { echo "$c"; return 0; }
    c="$c^1"
  done
  echo "$c"
}
HATCH="$(git log -1 --format=%B "$(hatch_commit)" 2>/dev/null | grep -E 'guard-ok:[[:space:]]*[^[:space:]]+' | head -1)"
if [ -n "$HATCH" ]; then
  echo "  escape hatch honoured — $(printf '%s' "$HATCH" | sed 's/^[[:space:]]*//')"
  exit 0
fi

COUNT="$(printf '%s\n' "$REMOVED" | grep -c .)"
cat <<EOF

  WARNING — $COUNT changed value(s) in $MSG_FILE, and no baseline moved.

$(printf '%s\n' "$REMOVED" | awk -F'\t' '{ printf "    %-38s %s  (%s)\n", $1, $2, $3 }')

  Bug Protocol 2b (.claude/rules/workflow.md): when a he.json value rendered on
  a VRT-covered route changes, regenerate $SNAP_DIR/
  in the SAME PR — never a follow-up ticket.

  This guard cannot tell whether these particular keys render on a covered
  route; see the header for why that mapping is not statically resolvable. If
  they do not, say so once:

      guard-ok: <reason>        (in a commit message on this branch)

  Do NOT silence it by regenerating baselines you have not looked at. A
  bot-generated baseline pins whatever was on screen, bug included (MEH-1552),
  and a green VRT is not evidence the frame is unchanged (0.02 tolerance
  swallows a full copy change).
EOF

# Warn-only: never fails the dispatcher. run-all.sh surfaces the WARNING token.
exit 0
