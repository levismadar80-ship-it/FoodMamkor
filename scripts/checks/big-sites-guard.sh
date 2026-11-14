#!/usr/bin/env bash
#
# Module:   big-sites-guard.sh
# Purpose:  Warn when a pull request changes user-facing code (frontend/app or
#           frontend/components, tests excluded) and its body has neither a
#           «## Big sites» section nor a «Big sites: n/a — <reason>» line.
#           Workflow rule 37b: every new page, block, behaviour or pattern
#           change carries a big-sites check before code.
# Touches:  nothing — reads the PR body and the changed-file list. In CI it may
#           deepen the base branch with `git fetch` (writes .git only).
# Does NOT: judge whether the research is any good, or block. Warn-only: the
#           rule needs judgment (a pure bug fix is exempt), and a blocking gate
#           would be a block only Sapir can clear (rule 30).
# Related:  .claude/rules/workflow.md rule 37b, scripts/checks/run-all.sh
#           (surfaces WARNING), scripts/checks/docs-ordering-guard.sh (the
#           PR-body reading this mirrors).
# History:  MEH-3110 (creation, Sapir 14/11).
#
# Inputs (for tests): BIG_SITES_PR_BODY, BIG_SITES_CHANGED (newline list).
# Otherwise: GITHUB_EVENT_PATH for the body, origin/$GITHUB_BASE_REF for the diff.
#
#   bash scripts/checks/big-sites-guard.sh --self-test

set -uo pipefail

pr_body() {
  if [ -n "${BIG_SITES_PR_BODY+x}" ]; then printf '%s\n' "$BIG_SITES_PR_BODY"; return 0; fi
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

changed_files() {
  if [ -n "${BIG_SITES_CHANGED+x}" ]; then printf '%s\n' "$BIG_SITES_CHANGED"; return 0; fi
  [ -n "${GITHUB_BASE_REF:-}" ] || return 1
  git fetch --no-tags --quiet --depth=100 origin "$GITHUB_BASE_REF" 2>/dev/null || true
  git fetch --no-tags --quiet --deepen=100 2>/dev/null || true
  git diff --name-only "origin/$GITHUB_BASE_REF...HEAD" 2>/dev/null
}

is_ui_file() {
  case "$1" in
    frontend/app/*|frontend/components/*) ;;
    *) return 1 ;;
  esac
  case "$1" in
    *__tests__*|*.test.*|*.spec.*) return 1 ;;
  esac
  return 0
}

has_section() {
  grep -qiE '^##[[:space:]]+Big sites[[:space:]]*$|^Big sites:[[:space:]]*n/a' <<<"$1"
}

# run → prints one line, returns 0 always (warn-only)
run() {
  local body files ui=""
  if ! body="$(pr_body)"; then
    echo "big-sites-guard: skipped — not a pull request (no PR body to read)"
    return 0
  fi
  if ! files="$(changed_files)"; then
    echo "big-sites-guard: skipped — no base branch to diff against"
    return 0
  fi
  while IFS= read -r f; do
    [ -n "$f" ] && is_ui_file "$f" && { ui="$f"; break; }
  done <<<"$files"
  if [ -z "$ui" ]; then
    echo "big-sites-guard: OK — no user-facing file changed"
  elif has_section "$body"; then
    echo "big-sites-guard: OK — PR body has the Big sites section"
  else
    echo "big-sites-guard: WARNING — $ui changes what users see, and the PR body has no «## Big sites» section or «Big sites: n/a — <reason>» line (workflow rule 37b)"
  fi
  return 0
}

self_test() {
  local fails=0 out
  check() { # name expected-substring body changed
    out="$(BIG_SITES_PR_BODY="$3" BIG_SITES_CHANGED="$4" run)"
    if grep -qF -- "$2" <<<"$out"; then echo "  ok   $1"; else echo "  FAIL $1 → $out"; fails=$((fails+1)); fi
  }
  echo "big-sites-guard self-test:"
  check "ui file, no section → warns"      "WARNING"  "## What"$'\n'"x"  "frontend/components/HubShell.jsx"
  check "ui file, heading → ok"            "OK — PR body"  "## Big sites"$'\n'"Eventbrite…"  "frontend/app/[locale]/events/page.js"
  check "ui file, n/a line → ok"           "OK — PR body"  "Big sites: n/a — restores intended behaviour"  "frontend/components/Footer.jsx"
  check "heading inside text is not one"   "WARNING"  "we skipped ## Big sites here"  "frontend/components/Footer.jsx"
  check "test-only change → ok"            "no user-facing"  ""  "frontend/__tests__/HubShellHeroHeight.test.js"
  check "backend-only change → ok"         "no user-facing"  ""  "backend/app/routers/rescue.py"
  # anchored to a real repo file, as testing.md asks
  if [ -f frontend/components/HubShell.jsx ]; then
    check "real file frontend/components/HubShell.jsx" "WARNING" "" "frontend/components/HubShell.jsx"
  else echo "  FAIL real-file anchor missing"; fails=$((fails+1)); fi
  out="$(unset BIG_SITES_PR_BODY; GITHUB_EVENT_PATH=/nonexistent run)"
  if grep -qF "skipped — not a pull request" <<<"$out"; then echo "  ok   no PR body → skipped, not OK"; else echo "  FAIL no-body → $out"; fails=$((fails+1)); fi
  [ "$fails" -eq 0 ] && echo "self-test passed" || { echo "self-test FAILED ($fails)"; return 1; }
}

cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
if [ "${1:-}" = "--self-test" ]; then self_test; exit $?; fi
run
