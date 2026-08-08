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
#   * 157 call sites build the key with a template literal (`t(`a.${x}`)`), and
#     others pass a bare variable (`t(status)`, `t(labelKey)`). Those keys do
#     not exist until runtime.
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
# The base-resolution ordering below mirrors changelog-branch-guard.sh's
# `resolve_base`. There is no shared helper in scripts/checks/ to source, and
# extracting one means editing a guard this ticket does not own. It is
# deliberately the SIMPLER version: it omits that guard's refs/pull/N/merge
# first-parent refinement (MEH-1634), which matters for a frozen base on a PR
# whose branch has absorbed later staging merges. Reported rather than silently
# copied; a shared helper is the right follow-up.
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
resolve_base() {
  if [ -n "${VRT_BASELINE_GUARD_BASE:-}" ]; then
    if git rev-parse --verify --quiet "${VRT_BASELINE_GUARD_BASE}^{commit}" >/dev/null; then
      printf '%s\t%s\n' "$VRT_BASELINE_GUARD_BASE" "VRT_BASELINE_GUARD_BASE override"
      return 0
    fi
    echo "  base override VRT_BASELINE_GUARD_BASE is not a commit." >&2
    return 1
  fi
  if [ -n "${GITHUB_BASE_REF:-}" ]; then
    if git rev-parse --verify --quiet "origin/${GITHUB_BASE_REF}^{commit}" >/dev/null; then
      printf '%s\t%s\n' "origin/${GITHUB_BASE_REF}" "GITHUB_BASE_REF"
      return 0
    fi
    if git fetch --no-tags --quiet --depth=1 origin "$GITHUB_BASE_REF" 2>/dev/null &&
       git rev-parse --verify --quiet FETCH_HEAD^{commit} >/dev/null; then
      printf '%s\t%s\n' "$(git rev-parse FETCH_HEAD)" "GITHUB_BASE_REF (fetched)"
      return 0
    fi
    return 1
  fi
  if git rev-parse --verify --quiet origin/staging^{commit} >/dev/null; then
    printf '%s\t%s\n' "origin/staging" "origin/staging fallback"
    return 0
  fi
  return 1
}

if ! BASE_INFO="$(resolve_base)"; then
  # No base = nothing to compare. Silent on purpose: a local run with no origin
  # is not a finding, and printing WARNING here would cry wolf on every laptop.
  echo "  no base ref resolvable — nothing to compare, skipping."
  exit 0
fi
BASE="$(printf '%s' "$BASE_INFO" | cut -f1)"
BASE_HOW="$(printf '%s' "$BASE_INFO" | cut -f2)"
echo "  base: $BASE ($BASE_HOW)"

CHANGED="$(git diff --name-only "$BASE" HEAD 2>/dev/null)" || {
  echo "  git diff against $BASE failed — skipping."
  exit 0
}

echo "$CHANGED" | grep -qx "$MSG_FILE" || {
  echo "  $MSG_FILE untouched — nothing to check."
  exit 0
}

# --- value change vs pure key addition -------------------------------------
# A removed line is a value that changed or went away; a diff with only added
# lines is new keys, which the ticket scopes out. -U0 so context lines cannot
# masquerade as changes.
DIFF="$(git diff -U0 "$BASE" HEAD -- "$MSG_FILE" 2>/dev/null)"
REMOVED="$(printf '%s\n' "$DIFF" | grep -E '^-[^-]' | grep -oE '"[^"]+"[[:space:]]*:' | sed 's/[[:space:]]*:$//' | sort -u)"

if [ -z "$REMOVED" ]; then
  echo "  $MSG_FILE touched, but the diff adds keys only (no value changed) — no baseline implication."
  exit 0
fi

if echo "$CHANGED" | grep -q "^$SNAP_DIR/"; then
  echo "  value(s) changed in $MSG_FILE AND $SNAP_DIR/ moved in the same PR — the rule is satisfied."
  exit 0
fi

# --- escape hatch ----------------------------------------------------------
# `guard-ok: <reason>` in any commit message on the branch. A bare `guard-ok:`
# with no reason does NOT count — same contract as builder-model-guard.
HATCH="$(git log --format=%B "$BASE"..HEAD 2>/dev/null | grep -E 'guard-ok:[[:space:]]*[^[:space:]]+' | head -1)"
if [ -n "$HATCH" ]; then
  echo "  escape hatch honoured — $(printf '%s' "$HATCH" | sed 's/^[[:space:]]*//')"
  exit 0
fi

COUNT="$(printf '%s\n' "$REMOVED" | grep -c .)"
cat <<EOF

  WARNING — $COUNT changed value(s) in $MSG_FILE, and no baseline moved.

  Keys whose value changed or was removed:
$(printf '%s\n' "$REMOVED" | sed 's/^/    /')

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
