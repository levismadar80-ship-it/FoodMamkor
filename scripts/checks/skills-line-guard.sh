#!/usr/bin/env bash
#
# Module:   skills-line-guard.sh
# Purpose:  WARN-ONLY. A pull-request body with no `Skills:` line — workflow
#           rule 43 (match the task to skills before starting, MEH-3176).
# Touches:  nothing — reads the PR body, writes only to stdout.
# Does NOT: judge whether the named skills were the right ones, or whether
#           they actually ran. It checks that the question was asked and
#           answered in the PR, which is the part a routine task skips.
#           It never exits non-zero for a finding; only a failing self-test
#           exits non-zero.
# Related:  .claude/rules/workflow.md rule 43, docs-ordering-guard.sh (same
#           PR-body reader: GITHUB_EVENT_PATH needs no workflow edit).
# History:  MEH-3176 (creation).
#
# Override for local runs and the self-test: SKILLS_LINE_PR_BODY.
# Accepted forms (case-insensitive, optional markdown bold/bullet):
#   Skills: critique, polish
#   **Skills:** none fit — docs-only rename
# A `Skills:` with nothing after it is a finding (the answer is missing).

set -uo pipefail

pr_body() {
  if [ -n "${SKILLS_LINE_PR_BODY+x}" ]; then
    printf '%s\n' "$SKILLS_LINE_PR_BODY"
    return 0
  fi
  local ev="${GITHUB_EVENT_PATH:-}"
  [ -n "$ev" ] && [ -r "$ev" ] || return 1
  python3 -c '
import json, sys
with open(sys.argv[1], encoding="utf-8") as fh:
    ev = json.load(fh)
pr = ev.get("pull_request")
if pr is None:
    sys.exit(3)
print(pr.get("body") or "")
' "$ev" 2>/dev/null
}

# has_skills_line — reads a body on stdin; 0 when a non-empty Skills: line exists.
has_skills_line() {
  grep -qiE '^[[:space:]]*([-*][[:space:]]+)?(\*\*)?skills:(\*\*)?[[:space:]]*(\*\*)?[[:space:]]*[^[:space:]*]'
}

# check — returns 0 clean, 1 when it warned, 2 when no PR context.
check() {
  local body rc
  body="$(pr_body)"; rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "skills-line-guard: not a pull-request context — nothing to check."
    return 2
  fi
  if printf '%s\n' "$body" | has_skills_line; then
    echo "skills-line-guard: OK — PR body has a Skills: line."
    return 0
  fi
  echo "::warning::skills-line-guard: the PR body has no 'Skills:' line (workflow rule 43). Add 'Skills: <names>' or 'Skills: none fit — <why>'."
  return 1
}

self_test() {
  local status=0 cases=0
  run_case() {
    local name="$1" expect="$2" body="$3" got rc
    cases=$(( cases + 1 ))
    SKILLS_LINE_PR_BODY="$body" check >/dev/null 2>&1; rc=$?
    got=CLEAN; [ "$rc" -eq 1 ] && got=WARN
    if [ "$got" = "$expect" ]; then echo "  [ok] $name → $got"
    else echo "  [XX] $name → $got, expected $expect"; status=1; fi
  }
  echo "skills-line-guard --self-test"
  run_case "plain line"              CLEAN $'Summary\n\nSkills: critique, polish\n'
  run_case "bold + bullet"           CLEAN $'- **Skills:** none fit — docs-only\n'
  run_case "lower case"              CLEAN $'skills: harden\n'
  run_case "no line at all"          WARN  $'Summary\n\nCloses MEH-1\n'
  run_case "empty answer"            WARN  $'Skills:\nCloses MEH-1\n'
  run_case "empty bold answer"       WARN  $'**Skills:**   \n'
  run_case "word inside a sentence"  WARN  $'We used no skills: just code.\n'
  run_case "empty body"              WARN  ''
  # Anchored to a real repo file: the PR template must not satisfy the guard by
  # itself (a template line would make every PR pass without an answer).
  if [ -r .github/pull_request_template.md ]; then
    run_case "repo PR template, unfilled" WARN "$(cat .github/pull_request_template.md)"
  fi
  # Non-PR context must be reported, never read as clean or as a warning.
  cases=$(( cases + 1 ))
  ( unset SKILLS_LINE_PR_BODY; GITHUB_EVENT_PATH=/nonexistent check >/dev/null 2>&1 ); rc=$?
  if [ "$rc" -eq 2 ]; then echo "  [ok] no PR context → 2"
  else echo "  [XX] no PR context → $rc, expected 2"; status=1; fi
  echo "  ran $cases cases"
  return "$status"
}

main() {
  self_test >/tmp/skills-line-guard-selftest.$$ 2>&1 || {
    cat /tmp/skills-line-guard-selftest.$$; rm -f /tmp/skills-line-guard-selftest.$$
    echo "skills-line-guard: SELF-TEST FAILED — the guard itself is broken."
    exit 1
  }
  if [ "${1:-}" = "--self-test" ]; then cat /tmp/skills-line-guard-selftest.$$; fi
  rm -f /tmp/skills-line-guard-selftest.$$
  [ "${1:-}" = "--self-test" ] && exit 0
  check
  exit 0
}

main "$@"
