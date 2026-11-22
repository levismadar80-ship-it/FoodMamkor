#!/usr/bin/env bash
#
# Module:   reuse-line-guard.sh
# Purpose:  WARN when a pull request ADDS a component, hook or helper module
#           and its body has no `Reuse:` line saying what existing code was
#           checked first (MEH-3612, Sapir 21/11: «תמיד עדיף לבדוק לפני אם
#           משהו קיים לפני שעושים חדש»).
# Touches:  nothing — reads the PR body and the added-file list, writes stdout.
# Does NOT: judge whether the search was good, or find re-implementations in
#           different words (no tool can). Near-verbatim copies are
#           clone-ratchet.sh's job. The question it forces is answered by the
#           author and checked by the rule-5a reviewer.
#           Never exits non-zero for a finding; only a failing self-test does.
# Related:  skills-line-guard.sh (same body reader), big-sites-guard.sh (same
#           diff reader), docs/CODE_INDEX.md, frontend/components/CLAUDE.md.
# History:  MEH-3612 (creation).
#
# Overrides for local runs and the self-test: REUSE_LINE_PR_BODY, REUSE_LINE_ADDED.
# Accepted forms (case-insensitive, optional markdown bold/bullet):
#   Reuse: components/ui/OfferCard.jsx extended with a `variant` prop
#   **Reuse:** none fit — searched CODE_INDEX for "allergen", "pickup"

set -uo pipefail

pr_body() {
  if [ -n "${REUSE_LINE_PR_BODY+x}" ]; then
    printf '%s\n' "$REUSE_LINE_PR_BODY"
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

added_files() {
  if [ -n "${REUSE_LINE_ADDED+x}" ]; then printf '%s\n' "$REUSE_LINE_ADDED"; return 0; fi
  [ -n "${GITHUB_BASE_REF:-}" ] || return 1
  git fetch --no-tags --quiet --depth=100 origin "$GITHUB_BASE_REF" 2>/dev/null || true
  git fetch --no-tags --quiet --deepen=100 2>/dev/null || true
  git diff --name-only --diff-filter=A "origin/$GITHUB_BASE_REF...HEAD" 2>/dev/null
}

# is_reusable_module — a file other features could import instead of writing their own.
is_reusable_module() {
  case "$1" in
    frontend/components/*.js|frontend/components/*.jsx|frontend/components/*.ts|frontend/components/*.tsx) ;;
    frontend/lib/*.js|frontend/lib/*.jsx|frontend/lib/*.ts|frontend/lib/*.tsx|frontend/lib/*.mjs) ;;
    frontend/hooks/*.js|frontend/hooks/*.jsx|frontend/hooks/*.ts|frontend/hooks/*.tsx) ;;
    backend/app/services/*.py) ;;
    *) return 1 ;;
  esac
  case "$1" in
    frontend/lib/generated/*|*/__init__.py|*.test.*|*.spec.*) return 1 ;;
  esac
  return 0
}

release_or_bot() {
  case "${GITHUB_HEAD_REF:-}" in
    dependabot/*) return 0 ;;
    staging) [ "${GITHUB_BASE_REF:-}" = "main" ] && return 0 ;;
  esac
  return 1
}

has_reuse_line() {
  grep -qiE '^[[:space:]]*([-*][[:space:]]+)?(\*\*)?reuse:(\*\*)?[[:space:]]*(\*\*)?[[:space:]]*[^[:space:]*]'
}

# check — 0 clean, 1 warned, 2 no PR context.
check() {
  local files new="" f body rc
  if ! files="$(added_files)"; then
    if [ -n "${GITHUB_BASE_REF:-}" ]; then
      echo "::warning::reuse-line-guard: could not diff against origin/$GITHUB_BASE_REF — added files unknown, nothing checked."
    else
      echo "reuse-line-guard: not a pull-request context — nothing to check."
    fi
    return 2
  fi
  while IFS= read -r f; do
    [ -n "$f" ] && is_reusable_module "$f" && new+="$f "
  done <<< "$files"
  if [ -z "$new" ]; then
    echo "reuse-line-guard: OK — no new component, hook or helper module."
    return 0
  fi
  body="$(pr_body)"; rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "reuse-line-guard: no PR body to read — nothing to check."
    return 2
  fi
  if printf '%s\n' "$body" | has_reuse_line; then
    echo "reuse-line-guard: OK — new module(s) ${new}and the PR body has a Reuse: line."
    return 0
  fi
  echo "::warning::reuse-line-guard: this PR adds ${new}but its body has no 'Reuse:' line. Search docs/CODE_INDEX.md and the catalog in frontend/components/CLAUDE.md first, then write 'Reuse: <what you reused or extended>' or 'Reuse: none fit — <what you searched>' (MEH-3612)."
  return 1
}

self_test() {
  local status=0 cases=0
  run_case() {
    local name="$1" expect="$2" added="$3" body="$4" got rc
    cases=$(( cases + 1 ))
    REUSE_LINE_ADDED="$added" REUSE_LINE_PR_BODY="$body" check >/dev/null 2>&1; rc=$?
    got=CLEAN; [ "$rc" -eq 1 ] && got=WARN
    if [ "$got" = "$expect" ]; then echo "  [ok] $name → $got"
    else echo "  [XX] $name → $got, expected $expect"; status=1; fi
  }
  echo "reuse-line-guard --self-test"
  run_case "new component, line present"   CLEAN "frontend/components/ui/OfferCard.jsx" $'Reuse: extended RescueCard\n'
  run_case "new helper, bold none-fit"     CLEAN "frontend/lib/pickup.js" $'- **Reuse:** none fit — searched CODE_INDEX\n'
  run_case "new service, no line"          WARN  "backend/app/services/digest.py" $'Skills: none fit\n'
  run_case "new hook, empty answer"        WARN  "frontend/hooks/useThing.js" $'Reuse:\n'
  run_case "word inside a sentence"        WARN  "frontend/lib/a.js" $'We did not reuse: anything.\n'
  run_case "only a test added"             CLEAN "frontend/__tests__/a.test.js" ''
  run_case "only a page added"             CLEAN "frontend/app/[locale]/x/page.jsx" ''
  run_case "generated lib file"            CLEAN "frontend/lib/generated/routes.js" ''
  run_case "package __init__"              CLEAN "backend/app/services/__init__.py" ''
  run_case "nothing added"                 CLEAN "" ''
  # Anchored to a real repo file: highlightMatch.js is the kind of module this
  # exists for (MEH-3608 deleted its unused twin). A missing anchor fails loudly.
  if [ -r frontend/lib/highlightMatch.js ]; then
    run_case "real helper, empty Reuse:" WARN  "frontend/lib/highlightMatch.js" $'Skills: none fit\n**Reuse:**\n'
    run_case "real helper, answered"     CLEAN "frontend/lib/highlightMatch.js" $'Reuse: none fit — searched CODE_INDEX\n'
  else
    cases=$(( cases + 1 )); echo "  [XX] anchor frontend/lib/highlightMatch.js is gone — pick another real helper"; status=1
  fi
  # The real diff reader, on a throw-away repo: an ADDED module counts, a
  # MODIFIED one does not (a wrong --diff-filter would flip one of these).
  local tmp; tmp="$(mktemp -d)"
  (
    cd "$tmp" && git init -q && git config user.email t@example.com && git config user.name t &&
    mkdir -p frontend/lib && echo a > frontend/lib/old.js && git add . && git commit -qm base &&
    git update-ref refs/remotes/origin/base HEAD &&
    echo b >> frontend/lib/old.js && echo c > frontend/lib/new.js && git add . && git commit -qm head
  ) >/dev/null 2>&1
  cases=$(( cases + 1 ))
  local got_added
  got_added="$(cd "$tmp" && unset REUSE_LINE_ADDED; GITHUB_BASE_REF=base added_files 2>/dev/null)"
  if [ "$got_added" = "frontend/lib/new.js" ]; then echo "  [ok] git diff reader → only the added file"
  else echo "  [XX] git diff reader → '$got_added', expected 'frontend/lib/new.js'"; status=1; fi
  rm -rf "$tmp"
  cases=$(( cases + 1 ))
  ( unset REUSE_LINE_ADDED REUSE_LINE_PR_BODY GITHUB_BASE_REF; check >/dev/null 2>&1 ); rc=$?
  if [ "$rc" -eq 2 ]; then echo "  [ok] no PR context → 2"
  else echo "  [XX] no PR context → $rc, expected 2"; status=1; fi
  echo "  ran $cases cases"
  return "$status"
}

main() {
  local log; log="$(mktemp)"
  self_test >"$log" 2>&1 || {
    cat "$log"; rm -f "$log"
    echo "reuse-line-guard: SELF-TEST FAILED — the guard itself is broken."
    exit 1
  }
  if [ "${1:-}" = "--self-test" ]; then cat "$log"; rm -f "$log"; exit 0; fi
  rm -f "$log"
  release_or_bot && { echo "reuse-line-guard: skipped — release or dependabot PR"; exit 0; }
  check
  exit 0
}

main "$@"
