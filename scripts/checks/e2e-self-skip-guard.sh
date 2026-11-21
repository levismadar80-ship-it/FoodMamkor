#!/usr/bin/env bash
#
# Module:   e2e-self-skip-guard.sh
# Purpose:  Hold the two things about the E2E self-skip ratchet that the
#           frontend lint job cannot: (1) the ratchet's own self-test runs on
#           every PR; (2) a PR does not raise a number in its baseline unless
#           it also changes the ratchet or its lint config.
# Touches:  nothing — reads the repo and the base branch's copy of the baseline.
# Does NOT: run ESLint. The Repo guards job has no node_modules; the real lint
#           is e2e-self-skip-ratchet.mjs inside `npm run lint:ratchet`.
# Related:  scripts/checks/e2e-self-skip-ratchet.mjs, e2e-self-skip-baseline.tsv,
#           frontend/e2e/self-skip.eslint.config.mjs, .claude/rules/testing.md.
# History:  MEH-3520 (21/11/2026).
#
# WHY IT EXISTS
#   pr-checks.yml starts the frontend lint job on a `frontend/**` change. A PR
#   that edits only scripts/checks/e2e-self-skip-ratchet.mjs or its baseline
#   starts no lint job, so (a) a broken reason-counter would go unnoticed, and
#   (b) a baseline with higher numbers would land with nothing comparing it,
#   and the next PR that adds a self-skipping test would pass against it.
#   This file needs no workflow edit: run-all.sh runs every executable *.sh
#   here under the required Repo guards job.
#
# WHAT A RISE IS
#   The per-rule TOTAL in the baseline, compared with the base branch's copy.
#   Rows may move between files; a total may fall. A total that rises fails,
#   unless this branch also changes the ratchet script or its ESLint config
#   (a new detector finds old code — same exception as test-honesty-guard.sh).
#   That case prints a WARNING so run-all.sh surfaces it.
#
# Usage:  bash scripts/checks/e2e-self-skip-guard.sh [--self-test]
# Exit:   0 pass · 1 fail

set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

BL=scripts/checks/e2e-self-skip-baseline.tsv
RATCHET=scripts/checks/e2e-self-skip-ratchet.mjs
CONFIG=frontend/e2e/self-skip.eslint.config.mjs

# file<TAB>rule<TAB>count rows -> "rule<TAB>total", sorted. Comment and blank
# lines are skipped; a row whose count is not a number is an error (exit 3),
# never a zero.
totals() {
  awk -F'\t' '
    /^#/ || /^[[:space:]]*$/ { next }
    NF != 3 || $3 !~ /^[0-9]+$/ { printf "bad row %d: %s\n", NR, $0 > "/dev/stderr"; bad = 1; next }
    { t[$2] += $3 }
    END { if (bad) exit 3; for (r in t) printf "%s\t%d\n", r, t[r] }
  ' "$1" | sort
}

# rises BASE HEAD -> one line per rule whose total is higher in HEAD.
rises() {
  awk -F'\t' '
    NR == FNR { base[$1] = $2; next }
    { was = ($1 in base) ? base[$1] : 0; if ($2 + 0 > was + 0) printf "%s\t%d -> %d\n", $1, was, $2 }
  ' "$1" "$2"
}

self_test() {
  local dir ran=0 bad=0 got
  dir="$(mktemp -d)"
  printf '# c\na.spec.ts\tr1\t2\nb.spec.ts\tr1\t3\na.spec.ts\tr2\t1\n' > "$dir/base.tsv"
  check() { # name, head-file-content, expected rise line count
    ran=$((ran + 1))
    printf '%b' "$2" > "$dir/head.tsv"
    totals "$dir/base.tsv" > "$dir/b.tot"; totals "$dir/head.tsv" > "$dir/h.tot"
    got="$(rises "$dir/b.tot" "$dir/h.tot" | wc -l | tr -d ' ')"
    if [ "$got" != "$3" ]; then bad=$((bad + 1)); echo "  self-test FAIL: $1 — expected $3 rise(s), got $got"; fi
  }
  check "same totals, rows moved between files" 'c.spec.ts\tr1\t5\na.spec.ts\tr2\t1\n' 0
  check "a total fell" 'a.spec.ts\tr1\t4\na.spec.ts\tr2\t1\n' 0
  check "one rule rose by one" 'a.spec.ts\tr1\t2\nb.spec.ts\tr1\t4\na.spec.ts\tr2\t1\n' 1
  check "a rule new to the baseline is a rise" 'a.spec.ts\tr1\t5\na.spec.ts\tr2\t1\nz.spec.ts\tr3\t1\n' 1
  check "one rose while another fell is still a rise" 'a.spec.ts\tr1\t9\n' 1
  ran=$((ran + 1))
  printf 'a.spec.ts\tr1\tmany\n' > "$dir/head.tsv"
  if totals "$dir/head.tsv" >/dev/null 2>&1; then bad=$((bad + 1)); echo "  self-test FAIL: a non-numeric count must be an error, not a zero"; fi
  # Anchored: the real baseline parses and is not empty.
  ran=$((ran + 1))
  if ! totals "$BL" > "$dir/real.tot" || [ ! -s "$dir/real.tot" ]; then
    bad=$((bad + 1)); echo "  self-test FAIL: the real $BL did not parse, or has no rows"
  fi
  rm -rf "$dir"
  if [ "$bad" -ne 0 ]; then echo "e2e-self-skip-guard: $bad of $ran self-test case(s) failed."; return 1; fi
  echo "e2e-self-skip-guard self-test PASS — $ran case(s)."
}

for f in "$BL" "$RATCHET" "$CONFIG"; do
  if [ ! -f "$f" ]; then echo "e2e-self-skip-guard: $f is missing — the ratchet cannot run without it."; exit 1; fi
done

self_test || exit 1
[ "${1:-}" = "--self-test" ] && exit 0

# 1 · the ratchet's own pure cases.
if ! command -v node >/dev/null 2>&1; then
  echo "e2e-self-skip-guard: node not found — the ratchet's self-test did not run; failing instead of passing."
  exit 1
fi
if ! node "$RATCHET" --self-test --no-eslint; then
  echo "e2e-self-skip-guard: $RATCHET --self-test failed."
  exit 1
fi

# 2 · the baseline does not rise.
BASE_NAME="${GITHUB_BASE_REF:-staging}"
BASE_REF="origin/$BASE_NAME"
if ! git rev-parse --verify --quiet "$BASE_REF^{commit}" >/dev/null; then
  # Repo guards checks out at depth 2 with no remote-tracking ref for the base.
  if git fetch --no-tags --quiet --depth=1 origin "$BASE_NAME" 2>/dev/null &&
     git rev-parse --verify --quiet "FETCH_HEAD^{commit}" >/dev/null; then
    BASE_REF="$(git rev-parse FETCH_HEAD)"
  fi
fi
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
if ! git show "$BASE_REF:$BL" > "$TMP/base.tsv" 2>/dev/null; then
  echo "e2e-self-skip-guard: no $BL on $BASE_REF — baseline growth not checked."
  exit 0
fi
totals "$TMP/base.tsv" > "$TMP/base.tot" || { echo "e2e-self-skip-guard: the base copy of $BL did not parse."; exit 1; }
totals "$BL" > "$TMP/head.tot" || { echo "e2e-self-skip-guard: $BL did not parse."; exit 1; }
RISES="$(rises "$TMP/base.tot" "$TMP/head.tot")"
if [ -z "$RISES" ]; then
  echo "e2e-self-skip-guard OK — no rule's baseline total is above $BASE_REF."
  exit 0
fi
git diff --quiet "$BASE_REF" -- "$RATCHET" "$CONFIG" 2>/dev/null; DIFF_RC=$?
# 0 = unchanged, 1 = changed; anything else is git failing, which is not "changed".
if [ "$DIFF_RC" -gt 1 ]; then
  echo "e2e-self-skip-guard FAILED — the baseline rose and git could not say whether the ratchet changed (exit $DIFF_RC)."
  printf '%s\n' "$RISES" | sed 's/^/  /'
  exit 1
fi
if [ "$DIFF_RC" -eq 1 ]; then
  echo "e2e-self-skip-guard WARNING: the baseline rose and the ratchet or its config changed in this branch — allowed, read the numbers:"
  printf '%s\n' "$RISES" | sed 's/^/  /'
  exit 0
fi
echo "e2e-self-skip-guard FAILED — $BL has a higher total than $BASE_REF:"
printf '%s\n' "$RISES" | sed "s|^|  $BL: |"
echo "A baseline number rises only together with a change to the ratchet or its lint config."
echo "Otherwise fix the new skip or branch in the spec, or give it a disable with a reason."
exit 1
