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
#   The per-rule TOTAL in the baseline, compared with its copy at the commit
#   where this branch left staging (the PR merge commit's first parent in CI).
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
  # FILENAME, not NR == FNR: with an empty base file NR == FNR stays true for
  # the head rows too, and every rise from zero would vanish.
  awk -F'\t' '
    FILENAME == ARGV[1] { base[$1] = $2; next }
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
  check_from_empty() {
    ran=$((ran + 1))
    : > "$dir/empty.tot"; printf 'r1\t3\n' > "$dir/h.tot"
    got="$(rises "$dir/empty.tot" "$dir/h.tot" | wc -l | tr -d ' ')"
    if [ "$got" != "1" ]; then bad=$((bad + 1)); echo "  self-test FAIL: a rise from an empty base — expected 1 rise, got $got"; fi
  }
  check_from_empty
  # Anchored: the real baseline parses. An empty one is legal (zero findings
  # is where this is meant to end), so only the parse is required.
  ran=$((ran + 1))
  if ! totals "$BL" > "$dir/real.tot"; then
    bad=$((bad + 1)); echo "  self-test FAIL: the real $BL did not parse"
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
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
# A release PR (staging -> main) compares two branches that each passed this
# guard already; main's older baseline would read as a rise.
if [ -n "${GITHUB_BASE_REF:-}" ] && [ "$GITHUB_BASE_REF" != "staging" ]; then
  echo "e2e-self-skip-guard: baseline comparison skipped — the base is $GITHUB_BASE_REF, not staging."
  exit 0
fi
# The commit to compare with is where this branch left the base, not the base
# tip: against the tip, a ratchet change that staging made later would read as
# "changed in this branch" and open the exception below.
#   - CI checks out the PR merge commit at depth 2: its first parent is the base.
#   - Locally: the merge-base with origin/staging.
BASE=""
if [ "$(git cat-file -p HEAD 2>/dev/null | grep -c '^parent ')" = "2" ] && [ -n "${GITHUB_BASE_REF:-}" ]; then
  BASE="$(git rev-parse --verify --quiet 'HEAD^1^{commit}' || true)"
fi
if [ -z "$BASE" ]; then
  BASE="$(git merge-base HEAD origin/staging 2>/dev/null || true)"
fi
if [ -z "$BASE" ]; then
  echo "e2e-self-skip-guard FAILED — could not find the commit this branch left staging at"
  echo "(no PR merge commit with a readable first parent, no merge-base with origin/staging)."
  echo "The baseline was not compared; failing instead of passing."
  exit 1
fi
BASE_REF="${BASE:0:9}"
if ! git cat-file -e "$BASE:$BL" 2>/dev/null; then
  if git cat-file -e "$BASE^{tree}" 2>/dev/null; then
    echo "e2e-self-skip-guard: $BL does not exist at $BASE_REF — nothing to compare with."
    exit 0
  fi
  echo "e2e-self-skip-guard FAILED — the tree of $BASE_REF is not readable; the baseline was not compared."
  exit 1
fi
git show "$BASE:$BL" > "$TMP/base.tsv" || { echo "e2e-self-skip-guard FAILED — could not read $BL at $BASE_REF."; exit 1; }
totals "$TMP/base.tsv" > "$TMP/base.tot" || { echo "e2e-self-skip-guard: the base copy of $BL did not parse."; exit 1; }
totals "$BL" > "$TMP/head.tot" || { echo "e2e-self-skip-guard: $BL did not parse."; exit 1; }
RISES="$(rises "$TMP/base.tot" "$TMP/head.tot")"
if [ -z "$RISES" ]; then
  echo "e2e-self-skip-guard OK — no rule's baseline total is above $BASE_REF."
  exit 0
fi
git diff --quiet "$BASE" HEAD -- "$RATCHET" "$CONFIG" 2>/dev/null; DIFF_RC=$?
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
