#!/usr/bin/env bash
#
# Module:   hebrew-copy-skills-guard.sh
# Purpose:  BLOCKING. A pull request that adds or changes Hebrew text in
#           frontend/messages/he.json must name both Hebrew-copy skills in its
#           `Skills:` line: hebrew-content-writer and clarify (workflow rule 43).
# Touches:  nothing — reads the PR body and the diff, writes only to stdout.
# Does NOT: prove the skills actually ran, or judge the copy. It makes the
#           question impossible to skip for user-facing Hebrew, which
#           skills-line-guard.sh (warn-only, any PR) does not. Text drafted
#           outside a PR (a doc, a card) is not seen here; the PR is the last
#           gate before users see it.
# Related:  scripts/checks/skills-line-guard.sh (same body reader),
#           scripts/checks/big-sites-guard.sh (same diff reader),
#           .claude/rules/workflow.md rule 43.
# History:  MEH-3176 follow-up, 18/11/2026: Hebrew copy for the tools
#           explanation was drafted without either skill; the skill pass
#           afterwards found 8 fixes. Sapir: «מה יקרה אם אני אשכח».
#
# Overrides for local runs and the self-test:
#   HEBREW_COPY_PR_BODY  — the PR body
#   HEBREW_COPY_ADDED    — the added lines of he.json (as `git diff` prints them)

set -uo pipefail

HE_FILE="frontend/messages/he.json"
REQUIRED_SKILLS="hebrew-content-writer clarify"

pr_body() {
  if [ -n "${HEBREW_COPY_PR_BODY+x}" ]; then printf '%s\n' "$HEBREW_COPY_PR_BODY"; return 0; fi
  local ev="${GITHUB_EVENT_PATH:-}"
  [ -n "$ev" ] && [ -r "$ev" ] || return 1
  python3 -c '
import json, sys
ev = json.load(open(sys.argv[1], encoding="utf-8"))
pr = ev.get("pull_request")
if pr is None: sys.exit(1)
print(pr.get("body") or "")
' "$ev" 2>/dev/null
}

added_he_lines() {
  if [ -n "${HEBREW_COPY_ADDED+x}" ]; then printf '%s\n' "$HEBREW_COPY_ADDED"; return 0; fi
  [ -n "${GITHUB_BASE_REF:-}" ] || return 1
  git fetch --no-tags --quiet --depth=100 origin "$GITHUB_BASE_REF" 2>/dev/null || true
  git fetch --no-tags --quiet --deepen=100 2>/dev/null || true
  git diff --unified=0 "origin/$GITHUB_BASE_REF...HEAD" -- "$HE_FILE" 2>/dev/null \
    | grep -E '^\+' | grep -vE '^\+\+\+'
}

# has_hebrew — stdin has at least one Hebrew letter.
has_hebrew() { python3 -c 'import re,sys; sys.exit(0 if re.search("[\u05d0-\u05ea]", sys.stdin.read()) else 1)'; }

# skills_line — prints the body's Skills: line(s), lower-cased.
skills_line() {
  grep -iE '^[[:space:]]*([-*][[:space:]]+)?(\*\*)?skills:' | tr '[:upper:]' '[:lower:]'
}

# check — 0 clean or not applicable, 1 violation.
check() {
  local body added line missing="" s
  if ! body="$(pr_body)"; then
    echo "hebrew-copy-skills-guard: skipped — not a pull request (no PR body to read)"
    return 0
  fi
  if ! added="$(added_he_lines)"; then
    echo "hebrew-copy-skills-guard: skipped — no base branch to diff against"
    return 0
  fi
  if ! printf '%s\n' "$added" | has_hebrew; then
    echo "hebrew-copy-skills-guard: OK — no Hebrew text added or changed in $HE_FILE"
    return 0
  fi
  line="$(printf '%s\n' "$body" | skills_line)"
  for s in $REQUIRED_SKILLS; do
    grep -qF "$s" <<<"$line" || missing="$missing $s"
  done
  if [ -z "$missing" ]; then
    echo "hebrew-copy-skills-guard: OK — Hebrew copy changed, Skills: line names both skills"
    return 0
  fi
  echo "$HE_FILE: Hebrew text added or changed, but the PR body's Skills: line is missing:$missing"
  echo "  Run the skill(s) on the new copy (workflow rule 43), then write e.g."
  echo "  'Skills: hebrew-content-writer, clarify' in the PR body."
  return 1
}

self_test() {
  local status=0
  run_case() {
    local name="$1" expect="$2" body="$3" added="$4" got rc
    HEBREW_COPY_PR_BODY="$body" HEBREW_COPY_ADDED="$added" check >/dev/null 2>&1; rc=$?
    got=PASS; [ "$rc" -ne 0 ] && got=FAIL
    if [ "$got" = "$expect" ]; then echo "  [ok] $name → $got"
    else echo "  [XX] $name → $got, expected $expect"; status=1; fi
  }
  local he='+      "title": "קבוצות רכישה",'
  local en_only='+      "id": "group_buys",'
  echo "hebrew-copy-skills-guard --self-test"
  run_case "Hebrew added, both skills"          PASS $'Skills: hebrew-content-writer, clarify\n' "$he"
  run_case "Hebrew added, bold bullet line"     PASS $'- **Skills:** Clarify, Hebrew-Content-Writer\n' "$he"
  run_case "Hebrew added, no Skills line"       FAIL $'Summary only\n' "$he"
  run_case "Hebrew added, only one skill"       FAIL $'Skills: hebrew-content-writer\n' "$he"
  run_case "Hebrew added, skills named in prose" FAIL $'We ran hebrew-content-writer and clarify.\n' "$he"
  run_case "Hebrew added, none fit"             FAIL $'Skills: none fit — rename\n' "$he"
  run_case "no Hebrew in added lines"           PASS $'no skills line\n' "$en_only"
  run_case "he.json untouched"                  PASS $'no skills line\n' ""
  # Anchored to the real file: a line taken from the current he.json must count as Hebrew.
  local real
  real="+$(python3 -c 'import re,sys
for l in open(sys.argv[1], encoding="utf-8"):
    if re.search("[\u05d0-\u05ea]", l): print(l.rstrip("\n")); break' "$HE_FILE" 2>/dev/null)"
  if [ "$real" = "+" ]; then echo "  [XX] real-file anchor: no Hebrew line found in $HE_FILE"; status=1
  else run_case "real he.json line, no Skills line" FAIL $'Summary\n' "$real"; fi
  return "$status"
}

case "${1:-}" in
  --self-test) self_test; exit $? ;;
  *) check; exit $? ;;
esac
