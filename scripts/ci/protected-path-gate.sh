#!/usr/bin/env bash
# MEH-784 — protected-path gate: the server-side half of the deny layer.
#
# The local deny layer (.claude/settings.json permissions.deny + the PreToolUse
# hooks) only sees the filesystem tools. A commit created through the GitHub
# Contents API, the GitHub MCP write tools, or the web editor never meets it
# (measured: PR #1968 frontend/vercel.json, PR #2629 claude-review.yml, 06/09
# PR #3453 frontend/eslint.config.mjs). The only layer that catches the API
# route is server-side, so this script decides — from the PR's changed files,
# labels and author — whether a PR that touches a protected path may proceed.
#
# Decision (pure, no network, no git):
#   PASS  no changed file matches a protected glob
#   PASS  a protected file changed AND the PR carries the label
#         `protected-path-approved`
#   PASS  the author is dependabot[bot] (its manifests/lockfiles are reviewed
#         at merge, by Sapir, every time — see rule 35)
#   FAIL  a protected file changed, no label, not dependabot → prints the list
#
# Inputs (env), so the workflow step and the self-test drive the same code:
#   CHANGED_FILES  newline-separated paths (dorny/paths-filter `list-files`)
#   PR_LABELS      comma-separated label names
#   PR_AUTHOR      login of the PR author
#
# The label is a LABEL, not prose (MEH-1523 / rule 30b): adding or removing it
# is a permanent, attributed timeline event. This gate is auditability, not
# prevention — CC can add labels — and it is honest about that.
#
# Usage:
#   scripts/ci/protected-path-gate.sh            # decide from env, exit 0/1
#   scripts/ci/protected-path-gate.sh --self-test
set -euo pipefail

APPROVAL_LABEL="protected-path-approved"
DEPENDABOT_AUTHOR="dependabot[bot]"

# The globs the local deny layer protects (settings.json permissions.deny and
# check-bash-safety.sh), restated here so the server-side gate covers the same
# set. Keep this list and the deny list in step — the audit question is
# "which of these can the API route reach?", and the answer today is all.
PROTECTED_GLOBS=(
  "backend/alembic/versions/*"
  ".github/workflows/*"
  ".github/CODEOWNERS"
  ".claude/settings.json"
  ".claude/hooks/*"
  "frontend/vercel.json"
  "pyproject.toml"
  "uv.lock"
  "frontend/package.json"
  "frontend/package-lock.json"
)

matches_protected() {
  local f="$1" g
  for g in "${PROTECTED_GLOBS[@]}"; do
    # `case` pattern matching is NOT pathname globbing: here `*` matches any
    # string, `/` included, so `.github/workflows/*` already covers a nested
    # `.github/workflows/sub/x.yml`. (The "`*` does not cross `/`" rule is a
    # property of filename expansion only.) Measured 06/09 before removing a
    # second, unreachable prefix-match block that assumed otherwise — the
    # self-test's "workflow under a subdirectory" case is what pins this.
    case "$f" in
      $g) return 0 ;;
    esac
  done
  return 1
}

has_label() {
  local want="$1" IFS=','
  local l
  for l in ${PR_LABELS:-}; do
    l="${l#"${l%%[![:space:]]*}"}"; l="${l%"${l##*[![:space:]]}"}"
    [ "$l" = "$want" ] && return 0
  done
  return 1
}

decide() {
  # Prints the verdict line(s); exit 0 = PASS, 1 = FAIL.
  local hits=() f
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    matches_protected "$f" && hits+=("$f")
  done <<< "${CHANGED_FILES:-}"

  if [ "${#hits[@]}" -eq 0 ]; then
    echo "protected-path gate: PASS — no protected path in the diff"
    return 0
  fi
  if [ "${PR_AUTHOR:-}" = "$DEPENDABOT_AUTHOR" ]; then
    echo "protected-path gate: PASS — dependabot PR (${#hits[@]} protected file(s); reviewed at merge)"
    return 0
  fi
  if has_label "$APPROVAL_LABEL"; then
    echo "protected-path gate: PASS — ${#hits[@]} protected file(s), label '$APPROVAL_LABEL' present"
    printf '  %s\n' "${hits[@]}"
    return 0
  fi
  echo "protected-path gate: FAIL — ${#hits[@]} protected file(s) changed without the '$APPROVAL_LABEL' label:"
  printf '  %s\n' "${hits[@]}"
  echo "  A commit made through the GitHub API never met the local deny layer; this is the server-side check. Sapir adds the label after reading the diff (rule 30: the label is hers to add, never CC's)."
  return 1
}

self_test() {
  # Every case names the input it covers (testing.md: name the case after
  # the input, not the class). Expected exit codes are asserted; the count
  # of cases is derived, never stated.
  local ran=0 failed=0
  run_case() {
    local name="$1" expect="$2"; shift 2
    local rc=0
    ( export CHANGED_FILES="$1" PR_LABELS="$2" PR_AUTHOR="$3"; decide >/dev/null ) || rc=$?
    ran=$((ran+1))
    if [ "$rc" -eq "$expect" ]; then
      echo "  ok   $name (exit $rc)"
    else
      echo "  FAIL $name — expected exit $expect, got $rc"
      failed=$((failed+1))
    fi
  }
  echo "protected-path gate — self-test"
  run_case "alembic revision, no label"                 1 $'backend/alembic/versions/20260906_x.py\nREADME.md' "" "levismadar80-ship-it"
  run_case "alembic revision, label present"            0 $'backend/alembic/versions/20260906_x.py' "cc-queue, $APPROVAL_LABEL" "levismadar80-ship-it"
  run_case "workflow under a subdirectory, no label"    1 $'.github/workflows/sub/x.yml' "" "levismadar80-ship-it"
  run_case ".claude/settings.json, no label"            1 $'.claude/settings.json' "" "levismadar80-ship-it"
  run_case "frontend/vercel.json, no label"             1 $'frontend/vercel.json' "" "levismadar80-ship-it"
  run_case "uv.lock by dependabot, no label"            0 $'uv.lock\npyproject.toml' "dependencies" "$DEPENDABOT_AUTHOR"
  run_case "uv.lock by a human, no label"               1 $'uv.lock' "" "levismadar80-ship-it"
  run_case "docs only, no label"                        0 $'docs/ci/x.patch.md\nHANDOFF.md' "" "levismadar80-ship-it"
  run_case "look-alike path (workflows-docs), no label" 0 $'docs/github/workflows/x.md\n.github/ISSUE_TEMPLATE/x.md' "" "levismadar80-ship-it"
  run_case "empty diff"                                 0 "" "" "levismadar80-ship-it"
  run_case "wrong label name is not approval"           1 $'.claude/hooks/x.sh' "protected-path-approve" "levismadar80-ship-it"
  echo "self-test: $((ran-failed))/$ran cases as expected"
  [ "$failed" -eq 0 ]
}

case "${1:-}" in
  --self-test) self_test ;;
  "") decide ;;
  *) echo "usage: $0 [--self-test]" >&2; exit 2 ;;
esac
