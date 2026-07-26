#!/usr/bin/env bash
#
# Module:   changelog-branch-guard.sh
# Purpose:  Fail a CODE pull request that also carries docs/CHANGELOG.md or
#           HANDOFF.md, so the MEH-1372 rule ("append-only logs go in their own
#           docs-only PR") is a gate instead of a suggestion.
# Touches:  nothing — reads the git diff and prints to stdout/stderr. In CI it
#           may run one `git fetch --depth=1` of the base branch (see BASE
#           RESOLUTION); that writes only to .git, never the worktree.
# Does NOT: police CHANGELOG *content*, formatting, or ordering, and does NOT
#           stop a docs-only PR from touching either file — that backfill path
#           is the whole point of MEH-1372 and must stay open. It also does not
#           look at commit messages: the unit is the PR's net diff.
# Related:  scripts/checks/run-all.sh (discovers + runs this),
#           scripts/checks/README.md (the authoring contract),
#           .claude/rules/workflow.md (rule 31 — the rule this enforces).
# History:  MEH-1602 (creation — mechanises MEH-1372).
#
# WHY THIS EXISTS
#   MEH-1372 landed as prose, which makes it advice an agent can skip. The same
#   evening it was written, PR #2207 carried a CHANGELOG entry, absorbed 7
#   staging merges, and ended up with TWO contradictory MEH-1569 entries —
#   caught by a human reading the log, by no gate at all. Append-only logs
#   conflict on every concurrent merge; keeping them out of code branches is
#   what removes the conflict, and only a red check enforces it.
#
# THE RULE (one rule, three cases)
#   Let DOCS = docs/**, HANDOFF.md, .claude/**
#   FAIL  when the diff touches at least one file OUTSIDE DOCS *and* touches
#         docs/CHANGELOG.md or HANDOFF.md.
#   PASS  when the diff is docs-only (even if it is entirely CHANGELOG+HANDOFF).
#   PASS  when the diff is code-only and touches neither log.
#
# BASE RESOLUTION (why this is more than one line)
#   The `repo-guards` job checks out with a plain `actions/checkout@v7` — depth
#   1 — and passes no base-SHA env, so a three-dot diff cannot work there: a
#   shallow clone has no merge base. The neighbouring `qa-artifacts-size` job
#   sets `fetch-depth: 0` precisely because it needs one, and
#   rtl-ok: the workflow filename below is a path, not a pl-/pr- padding class
#   .github/workflows/pr-checks.yml is CC-deny (MEH-671), so this guard cannot
#   ask for the same treatment.
#
#   So it resolves a base itself, in this order, announcing which it used:
#     1. $CHANGELOG_GUARD_BASE            — explicit override (self-test uses it)
#     2. $GITHUB_BASE_REF                 — set automatically on pull_request
#                                           events; fetched at depth 1 if the
#                                           ref is not already present
#     3. origin/<default>                 — local dev, full history
#   On a pull_request checkout HEAD is refs/pull/N/merge (head already merged
#   into base), so a TWO-dot `git diff BASE HEAD` is exactly the PR's net
#   change and needs no common ancestor. When a merge base IS computable
#   (local dev, or CI with full history) it is preferred, because there HEAD is
#   the branch tip rather than a merge commit and two-dot would also report
#   files that moved on the base since the branch point.
#
#   If no base can be resolved the guard EXITS NON-ZERO. It must never report
#   OK for a check it did not actually perform — that is the decorative-guard
#   failure mode MEH-420 closed for skill hashes.
#
# USAGE
#   bash scripts/checks/changelog-branch-guard.sh              # guard the diff
#   bash scripts/checks/changelog-branch-guard.sh --self-test  # prove all 3 cases
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# `|| exit 1` is load-bearing (SC2164) — see scripts/checks/README.md.
cd "$REPO_ROOT" || exit 1

LOGS=("docs/CHANGELOG.md" "HANDOFF.md")

# A path is "docs" if it is under docs/, under .claude/, or is a root-level
# Markdown document.
#
# The root-level `*.md` arm is MEH-1602 follow-up, found by this guard
# false-positiving on its own first real customer: a CLAUDE.md-only correction
# PR was classified as a CODE change (CLAUDE.md is not under docs/), which
# would have blocked it from carrying the CHANGELOG entry that documents it.
# Root docs — CLAUDE.md, AGENTS.md, README.md — are documentation by any
# reading; only the top level is matched, so a nested `frontend/**/*.md` still
# counts as part of a code change.
is_docs_path() {
  case "$1" in
    docs/*|.claude/*|HANDOFF.md) return 0 ;;
    */*) return 1 ;;          # anything nested that isn't docs/ or .claude/
    *.md) return 0 ;;         # root-level Markdown: CLAUDE.md, AGENTS.md, …
    *) return 1 ;;
  esac
}

# ---------------------------------------------------------------------------
# classify — reads the changed-file list on stdin.
#
# The rule itself, isolated from how the diff was obtained so --self-test can
# exercise it directly. Returns 1 on violation.
# ---------------------------------------------------------------------------
classify() {
  local files=() f
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    files+=("$f")
  done

  if [ ${#files[@]} -eq 0 ]; then
    echo "  empty diff — nothing to check."
    return 0
  fi

  local code_files=() offending=() log
  for f in "${files[@]}"; do
    if is_docs_path "$f"; then
      for log in "${LOGS[@]}"; do
        [ "$f" = "$log" ] && offending+=("$f")
      done
    else
      code_files+=("$f")
    fi
  done

  if [ ${#code_files[@]} -eq 0 ]; then
    echo "  docs-only diff (${#files[@]} file(s)) — the MEH-1372 backfill path. OK."
    return 0
  fi

  if [ ${#offending[@]} -eq 0 ]; then
    echo "  code diff (${#code_files[@]} file(s)), no append-only logs touched. OK."
    return 0
  fi

  echo "  VIOLATION — this PR changes code AND an append-only log."
  echo
  for f in "${offending[@]}"; do
    echo "    $f:1  must not be in a code branch (MEH-1372)"
  done
  echo
  echo "  Code files that make this a code PR (showing up to 5 of ${#code_files[@]}):"
  local i=0
  for f in "${code_files[@]}"; do
    echo "    $f"
    i=$(( i + 1 ))
    [ "$i" -ge 5 ] && break
  done
  echo
  echo "  WHY: docs/CHANGELOG.md and HANDOFF.md are append-only. Every concurrent"
  echo "  merge to staging conflicts on them, and resolving those conflicts across"
  echo "  cycles is what produced the duplicated, contradictory MEH-1569 entry on"
  echo "  PR #2207. Keeping the logs out of code branches removes the conflict."
  echo
  echo "  FIX: drop them from this branch, then backfill in a docs-only PR —"
  echo "    git checkout origin/staging -- ${LOGS[*]}"
  echo "  and re-add the entries in a separate PR touching only docs/ + HANDOFF.md."
  return 1
}

# ---------------------------------------------------------------------------
# resolve_base — echoes "<rev>\t<how>" or returns 1. See BASE RESOLUTION above.
# ---------------------------------------------------------------------------
resolve_base() {
  if [ -n "${CHANGELOG_GUARD_BASE:-}" ]; then
    if git rev-parse --verify --quiet "${CHANGELOG_GUARD_BASE}^{commit}" >/dev/null; then
      printf '%s\t%s\n' "$CHANGELOG_GUARD_BASE" "CHANGELOG_GUARD_BASE override"
      return 0
    fi
    echo "  base override CHANGELOG_GUARD_BASE=$CHANGELOG_GUARD_BASE is not a commit." >&2
    return 1
  fi

  if [ -n "${GITHUB_BASE_REF:-}" ]; then
    if git rev-parse --verify --quiet "origin/${GITHUB_BASE_REF}^{commit}" >/dev/null; then
      printf '%s\t%s\n' "origin/${GITHUB_BASE_REF}" "GITHUB_BASE_REF (already fetched)"
      return 0
    fi
    # Shallow CI checkout: the base branch is not in this clone yet.
    if git fetch --no-tags --quiet --depth=1 origin "$GITHUB_BASE_REF" 2>/dev/null &&
       git rev-parse --verify --quiet FETCH_HEAD^{commit} >/dev/null; then
      printf '%s\t%s\n' "$(git rev-parse FETCH_HEAD)" "GITHUB_BASE_REF (fetched --depth=1)"
      return 0
    fi
    echo "  could not fetch base ref $GITHUB_BASE_REF from origin." >&2
    return 1
  fi

  local head_branch candidate
  head_branch="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null)"
  for candidate in "$head_branch" "origin/staging" "origin/main"; do
    [ -n "$candidate" ] || continue
    if git rev-parse --verify --quiet "${candidate}^{commit}" >/dev/null; then
      printf '%s\t%s\n' "$candidate" "local fallback"
      return 0
    fi
  done
  return 1
}

# ---------------------------------------------------------------------------
# changed_files <base> — the PR's net diff, preferring a merge base when one
# exists. Two-dot is correct on a pull_request merge ref; see BASE RESOLUTION.
# ---------------------------------------------------------------------------
changed_files() {
  local base="$1" mb
  mb="$(git merge-base HEAD "$base" 2>/dev/null)"
  if [ -n "$mb" ]; then
    echo "  diff: merge-base ${mb:0:8}..HEAD" >&2
    git diff --name-only "$mb" HEAD
  else
    echo "  diff: two-dot ${base}..HEAD (no merge base — shallow clone)" >&2
    git diff --name-only "$base" HEAD
  fi
}

# ---------------------------------------------------------------------------
# --self-test — build a throwaway repo and drive all three cases end-to-end,
# through the real diff path rather than the classifier alone.
# ---------------------------------------------------------------------------
self_test() {
  local tmp status=0 base_sha
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN

  (
    cd "$tmp" || exit 1
    git init --quiet -b staging .
    git config user.email guard@test.local
    git config user.name  guard-self-test
    mkdir -p docs frontend/components
    echo "# changelog"          > docs/CHANGELOG.md
    echo "# handoff"            > HANDOFF.md
    echo "export const a = 1;"  > frontend/components/Thing.jsx
    git add -A && git commit --quiet -m base
  ) || { echo "self-test: could not build fixture repo"; return 1; }

  base_sha="$(git -C "$tmp" rev-parse HEAD)"

  run_case() {
    local name="$1" expect="$2" mutate="$3" files rc got
    git -C "$tmp" checkout --quiet -B case "$base_sha"
    ( cd "$tmp" && eval "$mutate" )
    git -C "$tmp" add -A
    git -C "$tmp" commit --quiet -m "$name"

    files="$(git -C "$tmp" diff --name-only "$base_sha" HEAD)"
    echo "── case: $name (expect $expect)"
    printf '%s\n' "$files" | sed 's/^/     changed: /'
    printf '%s\n' "$files" | classify
    rc=$?
    got=PASS; [ "$rc" -ne 0 ] && got=FAIL
    if [ "$got" = "$expect" ]; then
      echo "   [ok] got $got"
    else
      echo "   [XX] got $got, expected $expect"
      status=1
    fi
    echo
  }

  echo "changelog-branch-guard --self-test"
  echo

  run_case "code + CHANGELOG" FAIL \
    "echo 'export const a = 2;' > frontend/components/Thing.jsx; echo '- entry' >> docs/CHANGELOG.md"

  run_case "docs-only (CHANGELOG + HANDOFF)" PASS \
    "echo '- entry' >> docs/CHANGELOG.md; echo '- note' >> HANDOFF.md"

  run_case "code-only" PASS \
    "echo 'export const a = 3;' > frontend/components/Thing.jsx"

  if [ "$status" -eq 0 ]; then
    echo "self-test OK — all 3 cases behaved as specified."
  else
    echo "self-test FAILED."
  fi
  return "$status"
}

# ---------------------------------------------------------------------------
main() {
  echo "changelog-branch-guard (MEH-1602) — enforces MEH-1372"
  echo

  local resolved base how files
  if ! resolved="$(resolve_base)"; then
    echo "changelog-branch-guard FAILED — could not determine a base revision."
    echo "  Refusing to report OK for a check that did not run (MEH-420 precedent)."
    echo "  Set CHANGELOG_GUARD_BASE=<rev> to point it at one explicitly."
    exit 1
  fi
  base="${resolved%%$'\t'*}"
  how="${resolved#*$'\t'}"
  echo "  base: $base  [$how]"

  files="$(changed_files "$base")"
  echo
  printf '%s\n' "$files" | classify || {
    echo
    echo "changelog-branch-guard FAILED."
    exit 1
  }

  echo
  echo "changelog-branch-guard OK."
  exit 0
}

case "${1:-}" in
  --self-test) self_test ;;
  "")          main ;;
  *)           echo "usage: $(basename "$0") [--self-test]" >&2; exit 2 ;;
esac
