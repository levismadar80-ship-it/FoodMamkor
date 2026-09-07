#!/usr/bin/env bash
# shown-failing-guard.sh — MEH-1930 (promotes the MEH-1619 rule to a mechanical check)
#
# WHAT THIS CHECKS, STATED PLAINLY
#   That a commit which ADDS a new test file carries two declarations in its
#   message:
#
#       Shown-failing: <run link, or the construction that turned it red>
#       Discriminates: <why the PREVIOUS assertion would have passed that same construction>
#
#   It checks that the declaration EXISTS and is non-empty. It does NOT — and
#   cannot — verify that the test was truly observed failing, or that the
#   construction discriminates. Same weaker-than-it-looks guarantee as
#   builder-model-guard.sh (MEH-1668): a self-declaration made mechanical, so
#   a MISSING one is caught loudly and writing one forces the author to stop
#   and name the construction. Do not describe this guard as verification.
#
# WHY `Discriminates:` IS THE ONE THAT MATTERS
#   testing.md § "Every new guard test must be shown failing": showing "I broke
#   it and the suite went red" proves nothing about the new assertion if the
#   previous assertion also went red on that construction. The second field is
#   the one that forces that question to be answered before the PR opens.
#
# MODE: WARN-ONLY, PERMANENTLY UNTIL A DECISION SAYS OTHERWISE
#   The card (MEH-1930) chose option (b): count and warn, never block, until the
#   pattern is established. Phase 0 measured 25 recent merged PRs that added a
#   test file: 0 carried a machine-readable declaration, 15 carried red→green
#   language in prose. A blocking gate would have redded 25 of 25. So this
#   prints WARNING (the token run-all.sh surfaces, MEH-1715) and exits 0.
#   Flipping to blocking is a one-line change (`enforcing=1`) that needs its
#   own ticket and a measured false-positive rate under the warn window.
#
# WHICH COMMIT IT READS
#   Mirrors builder-model-guard.sh: on a pull_request run, the SECOND parent of
#   refs/pull/N/merge (the PR head); otherwise HEAD. Then walks first parents
#   past sync-merge commits, since a `git merge origin/staging` tip is not
#   authored work. Only that one commit is inspected.
#
# WHAT COUNTS AS A NEW TEST FILE (see TEST_PATH_RE)
#   tests/test_*.py · frontend/__tests__/*.test.{js,jsx,ts,tsx} ·
#   frontend/e2e/{flows,visual}/*.spec.ts — the three families this repo's
#   CI actually runs. Added (`--diff-filter=A`) only: a modified test file is
#   a strengthened assertion and is out of this guard's reach by design.
#
# SELF-TEST (`--self-test`): drives the REAL predicates — is_test_path on
#   paths lifted from this repo's own tree (MEH-1909 anchor) plus synthetic
#   edges, and check_commit on a throwaway repo with four commits: declared,
#   undeclared, half-declared, and no-test-file. Exits 1 if any case sorts
#   wrong. CI-style invocation with no arguments never runs it.
#
# Usage:  bash scripts/checks/shown-failing-guard.sh [--self-test]
# Exit:   0 always in guard mode (warn-only); --self-test: 0 = all cases sort
#         correctly, 1 = a case sorted wrong.
set -euo pipefail

TEST_PATH_RE='(^|/)(tests/test_[^/]+\.py|__tests__/[^/]+\.test\.(js|jsx|ts|tsx)|e2e/(flows|visual)/[^/]+\.spec\.ts)$'
KEY_SHOWN="Shown-failing"
KEY_DISC="Discriminates"

# ---------------------------------------------------------------------------
# The predicates. Pure, so --self-test drives the real ones.
# ---------------------------------------------------------------------------
is_test_path() { printf '%s' "$1" | grep -qE "$TEST_PATH_RE"; }

# has_trailer <message> <key>  -> 0 when a line `Key: <non-blank>` exists
has_trailer() {
  printf '%s\n' "$1" | grep -qE "^${2}:[[:space:]]*[^[:space:]]"
}

# new_test_paths <rev>  -> prints the test files ADDED by <rev> vs its first
# parent; returns 1 when the diff cannot be read (root commit, or a shallow
# clone that lacks the parent) — the caller treats that as "not checked",
# never as "nothing added".
new_test_paths() {
  local rev="$1" parent
  parent="$(git cat-file commit "$rev" 2>/dev/null | awk '/^parent/{print $2; exit}')"
  [ -n "$parent" ] || return 1
  if ! git cat-file -e "${parent}^{commit}" 2>/dev/null; then
    git fetch --no-tags --quiet --depth=2 origin "$rev" 2>/dev/null || true
    git cat-file -e "${parent}^{commit}" 2>/dev/null || return 1
  fi
  git diff-tree --no-commit-id -r --diff-filter=A --name-only "$parent" "$rev" 2>/dev/null \
    | while IFS= read -r p; do is_test_path "$p" && printf '%s\n' "$p"; done
  return 0
}

# check_commit <rev>  -> prints the verdict; returns 0 = fine / nothing to
# declare, 1 = declaration missing (the caller decides whether that blocks).
check_commit() {
  local rev="$1" short paths message missing=()
  short="$(git rev-parse --short "$rev" 2>/dev/null || echo "$rev")"
  if ! paths="$(new_test_paths "$rev")"; then
    echo "  NOTICE $short: cannot read this commit's diff (root commit or shallow clone) — not checked."
    return 0
  fi
  if [ -z "$paths" ]; then
    echo "  OK $short: adds no new test file — nothing to declare."
    return 0
  fi
  message="$(git log -1 --format=%B "$rev")"
  has_trailer "$message" "$KEY_SHOWN" || missing+=("$KEY_SHOWN")
  has_trailer "$message" "$KEY_DISC"  || missing+=("$KEY_DISC")
  if [ "${#missing[@]}" -eq 0 ]; then
    echo "  OK $short: adds $(printf '%s\n' "$paths" | grep -c .) new test file(s) and declares ${KEY_SHOWN}: + ${KEY_DISC}:."
    echo "      (a declaration, not a verification — the guard cannot see the red run)"
    return 0
  fi
  echo "  WARNING $short adds new test file(s) without a shown-failing declaration:"
  printf '%s\n' "$paths" | sed 's/^/      + /'
  echo "      missing: ${missing[*]}"
  echo "      Add to the commit message (last block, with the other trailers):"
  echo "        ${KEY_SHOWN}: <run link, or the construction that turned it red>"
  echo "        ${KEY_DISC}: <why the previous assertion would have passed that same construction>"
  echo "      testing.md § 'Every new guard test must be shown failing' (MEH-1619) — MEH-1930 makes it a declaration."
  return 1
}

# ---------------------------------------------------------------------------
# Self-test
# ---------------------------------------------------------------------------
self_test() {
  echo "shown-failing-guard --self-test"
  local ran=0 failures=0
  expect() {  # expect <label> <want:0|1> <got:0|1>
    ran=$((ran + 1))
    if [ "$2" = "$3" ]; then echo "  ok   $1"; else echo "  FAIL $1 (want $2, got $3)"; failures=$((failures + 1)); fi
  }
  t() { if is_test_path "$1"; then echo 0; else echo 1; fi; }

  echo " path classifier — anchored to files this repo actually commits (MEH-1909):"
  local anchors=(frontend/__tests__/CopyGate.test.js tests/test_meh2242_delivery_day_offers_delivery.py frontend/e2e/visual/parity.spec.ts)
  local p
  for p in "${anchors[@]}"; do
    if git ls-files --error-unmatch "$p" >/dev/null 2>&1; then
      expect "real: $p is a test path" 0 "$(t "$p")"
    else
      echo "  FAIL anchor $p is not in the tree — re-anchor before trusting this suite"; ran=$((ran + 1)); failures=$((failures + 1))
    fi
  done
  expect "real: frontend/lib/seo.js is not"                 1 "$(t frontend/lib/seo.js)"
  expect "real: scripts/checks/run-all.sh is not"           1 "$(t scripts/checks/run-all.sh)"
  echo " path classifier — synthetic edges:"
  expect "tests/conftest.py is not (fixture, not a test)"   1 "$(t tests/conftest.py)"
  expect "frontend/__tests__/x.test.tsx is"                 0 "$(t frontend/__tests__/x.test.tsx)"
  expect "frontend/e2e/screenshots.spec.ts is not (root-level, CI never runs it)" 1 "$(t frontend/e2e/screenshots.spec.ts)"
  expect "backend/app/tests_helper.py is not"               1 "$(t backend/app/tests_helper.py)"

  echo " trailer parser:"
  local m
  m=$'feat: x\n\nShown-failing: run 123\nDiscriminates: old assertion took any string'
  expect "both present"                    0 "$(has_trailer "$m" "$KEY_SHOWN" && has_trailer "$m" "$KEY_DISC" && echo 0 || echo 1)"
  m=$'feat: x\n\nShown-failing:\nDiscriminates: y'
  expect "empty value is not a declaration" 1 "$(has_trailer "$m" "$KEY_SHOWN" && echo 0 || echo 1)"
  m=$'feat: x\n\nshown failing in run 123 — went red then green'
  expect "prose mention is not a trailer"  1 "$(has_trailer "$m" "$KEY_SHOWN" && echo 0 || echo 1)"

  echo " check_commit on a throwaway repo:"
  local tmp
  tmp="$(mktemp -d)"
  (
    cd "$tmp" || exit 1
    git init -q
    git config user.email guard@example.invalid; git config user.name guard
    git config commit.gpgsign false
    mkdir -p tests frontend/__tests__ src
    echo 'x=1' > src/a.py; git add -A; git commit -q -m 'chore: seed'
    echo 'def test_a(): pass' > tests/test_a.py; git add -A
    git commit -q -m $'test: declared\n\nShown-failing: run 1 red on the old code\nDiscriminates: the old assertion accepted any value'
    git tag declared
    echo 'def test_b(): pass' > tests/test_b.py; git add -A; git commit -q -m 'test: undeclared'; git tag undeclared
    echo 'def test_c(): pass' > tests/test_c.py; git add -A; git commit -q -m $'test: half\n\nShown-failing: run 2'; git tag half
    echo 'x=2' > src/a.py; git add -A; git commit -q -m 'fix: no test file'; git tag notest
    echo 'def test_a(): assert 1' > tests/test_a.py; git add -A; git commit -q -m 'test: modified only'; git tag modified
  ) >/dev/null
  local got
  for case in "declared:0" "undeclared:1" "half:1" "notest:0" "modified:0"; do
    local tag="${case%%:*}" want="${case##*:}"
    if (cd "$tmp" && check_commit "$tag" >/dev/null); then got=0; else got=1; fi
    expect "commit '$tag'" "$want" "$got"
  done
  rm -rf "$tmp"

  echo
  if [ "$failures" -eq 0 ]; then
    echo "shown-failing-guard --self-test OK — ${ran} case(s), 0 failures."
    return 0
  fi
  echo "shown-failing-guard --self-test FAILED — ${ran} case(s), ${failures} failure(s)."
  return 1
}

case "${1:-}" in
  --self-test) self_test; exit $? ;;
  "") ;;
  *) echo "shown-failing-guard: unknown argument '$1'" >&2
     echo "  usage: bash scripts/checks/shown-failing-guard.sh [--self-test]" >&2
     exit 2 ;;
esac

# ---------------------------------------------------------------------------
# Guard mode
# ---------------------------------------------------------------------------
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

echo "shown-failing-guard (MEH-1930) — mode: WARN-ONLY; checks that a declaration EXISTS, not that a red run happened"

pr_head_sha() {
  case "${GITHUB_REF:-}" in refs/pull/*/merge) ;; *) return 1 ;; esac
  local parents
  parents="$(git cat-file commit HEAD 2>/dev/null | sed -n '/^$/q; s/^parent //p')"
  [ "$(printf '%s\n' "$parents" | grep -c .)" -ge 2 ] || return 1
  printf '%s\n' "$parents" | sed -n '2p'
}

skip_sync_merges() {
  local rev="$1" hops=0 parents
  while [ "$hops" -lt 20 ]; do
    parents="$(git cat-file commit "$rev" 2>/dev/null | sed -n '/^$/q; s/^parent //p')"
    [ "$(printf '%s\n' "$parents" | grep -c .)" -ge 2 ] || { printf '%s\n' "$rev"; return 0; }
    rev="$(printf '%s\n' "$parents" | head -n 1)"
    hops=$((hops + 1))
  done
  printf '%s\n' "$rev"
}

if target="$(pr_head_sha)"; then how="refs/pull/N/merge second parent (PR head)"; else target="$(git rev-parse HEAD)"; how="HEAD"; fi
target="$(skip_sync_merges "$target")"
echo "  inspecting: $(git rev-parse --short "$target") via $how"

if check_commit "$target"; then
  exit 0
fi
# warn-only: the WARNING lines above are the deliverable; never red the job.
exit 0
