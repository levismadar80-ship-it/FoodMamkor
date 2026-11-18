#!/usr/bin/env bash
#
# Module:   pr-evidence-guard.sh
# Purpose:  WARN until BLOCK_FROM, BLOCKING from that date. A PR must carry the
#           evidence that four workflow rules ask for, decided by what its diff
#           touches (Danger-style PR checks):
#             rule 23 — UI change → at least 2 files under qa-artifacts/ in the diff
#             rule 38 — UI change → a `Self-check:` line (or `## Self-check`) in the body
#             rule 22 — Hebrew added to he.json → a `Copy approved:` line in the body
#             rule 40 — frontend/ or backend/app change → the `run-e2e` label
# Touches:  nothing — reads the PR event (body, labels) and the diff; stdout only.
# Does NOT: check that the evidence is true: that the screenshots were read,
#           that the self-check was done, that the approval is real. It makes
#           each question impossible to skip. Rule 40's quoted E2E result is
#           not checked: it can only be written after the run, and this
#           workflow does not re-run on a body edit.
# Related:  big-sites-guard.sh (same UI-path test), hebrew-copy-skills-guard.sh
#           (same he.json reader and BLOCK_FROM switch), workflow.md rules
#           22, 23, 38, 40.
# History:  MEH-3176 follow-up, 18/11/2026 — inventory of memory-only rules;
#           these four were the top risks a mechanical check can reach.
#
# Overrides for the self-test: PR_EVIDENCE_BODY, PR_EVIDENCE_LABELS (one per
# line), PR_EVIDENCE_FILES (one per line), PR_EVIDENCE_HE_ADDED, PR_EVIDENCE_TODAY.

set -uo pipefail

BLOCK_FROM="2026-11-22"
HE_FILE="frontend/messages/he.json"

today_il() { [ -n "${PR_EVIDENCE_TODAY:-}" ] && { echo "$PR_EVIDENCE_TODAY"; return; }; TZ=Asia/Jerusalem date +%F; }

event_field() {  # $1 = body | labels
  local ev="${GITHUB_EVENT_PATH:-}"
  [ -n "$ev" ] && [ -r "$ev" ] || return 1
  python3 -c '
import json, sys
pr = json.load(open(sys.argv[1], encoding="utf-8")).get("pull_request")
if pr is None: sys.exit(1)
if sys.argv[2] == "body": print(pr.get("body") or "")
else: print("\n".join(l.get("name", "") for l in pr.get("labels") or []))
' "$ev" "$1" 2>/dev/null
}

pr_body()   { [ -n "${PR_EVIDENCE_BODY+x}" ] && { printf '%s\n' "$PR_EVIDENCE_BODY"; return 0; }; event_field body; }
pr_labels() { [ -n "${PR_EVIDENCE_LABELS+x}" ] && { printf '%s\n' "$PR_EVIDENCE_LABELS"; return 0; }; event_field labels; }

base_range() {
  [ -n "${GITHUB_BASE_REF:-}" ] || return 1
  git fetch --no-tags --quiet --depth=100 origin "$GITHUB_BASE_REF" 2>/dev/null || true
  git fetch --no-tags --quiet --deepen=100 2>/dev/null || true
  echo "origin/$GITHUB_BASE_REF...HEAD"
}

changed_files() {  # 0 ok, 1 no base, 2 git failed
  [ -n "${PR_EVIDENCE_FILES+x}" ] && { printf '%s\n' "$PR_EVIDENCE_FILES"; return 0; }
  local r; r="$(base_range)" || return 1
  git diff --name-only "$r" 2>/dev/null || return 2
}

he_added() {
  [ -n "${PR_EVIDENCE_HE_ADDED+x}" ] && { printf '%s\n' "$PR_EVIDENCE_HE_ADDED"; return 0; }
  local r d; r="$(base_range)" || return 1
  d="$(git diff --unified=0 "$r" -- "$HE_FILE" 2>/dev/null)" || return 2
  printf '%s\n' "$d" | { grep -E '^\+' || true; } | { grep -vE '^\+\+\+' || true; }
}

has_hebrew() { python3 -c 'import re,sys; sys.exit(0 if re.search("[א-ת]", sys.stdin.read()) else 1)'; }

is_ui_file() {
  case "$1" in frontend/app/*|frontend/components/*) ;; *) return 1 ;; esac
  case "$1" in *__tests__*|*.test.*|*.spec.*) return 1 ;; esac
  return 0
}

# answered LABEL BODY — a line `LABEL: <something>` or a heading `## LABEL`.
answered() {
  grep -qiE "^[[:space:]]*([-*][[:space:]]+)?(\*\*)?$1:(\*\*)?[[:space:]]*(\*\*)?[[:space:]]*[^[:space:]*]|^#{2,3}[[:space:]]+$1[[:space:]]*\$" <<<"$2"
}

check() {
  local body labels files rc he ui="" code="" qa=0 missing=()
  if ! body="$(pr_body)"; then echo "pr-evidence-guard: skipped — not a pull request"; return 0; fi
  labels="$(pr_labels || true)"
  files="$(changed_files)"; rc=$?
  [ "$rc" -eq 1 ] && { echo "pr-evidence-guard: skipped — no base branch to diff against"; return 0; }
  if [ "$rc" -eq 2 ]; then
    missing+=("could not read the diff against the base branch")
  else
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      is_ui_file "$f" && ui="$f"
      case "$f" in frontend/*|backend/app/*) code="$f" ;; esac
      case "$f" in qa-artifacts/*) qa=$((qa + 1)) ;; esac
    done <<<"$files"
    he="$(he_added)"; rc=$?
    [ "$rc" -eq 2 ] && missing+=("could not read the $HE_FILE diff")
    if [ -n "$ui" ]; then
      [ "$qa" -ge 2 ] || missing+=("rule 23: UI change ($ui) but $qa file(s) under qa-artifacts/ — add the 375 + 1440 screenshots")
      answered "Self-check" "$body" || missing+=("rule 38: UI change ($ui) but no 'Self-check:' line in the PR body")
    fi
    if [ "$rc" -eq 0 ] && printf '%s\n' "$he" | has_hebrew; then
      answered "Copy approved" "$body" || missing+=("rule 22: Hebrew added to $HE_FILE but no 'Copy approved:' line (where Sapir approved it)")
    fi
    if [ -n "$code" ]; then
      grep -qxF "run-e2e" <<<"$labels" || missing+=("rule 40: $code changed but the PR has no run-e2e label")
    fi
  fi
  if [ "${#missing[@]}" -eq 0 ]; then echo "pr-evidence-guard: OK"; return 0; fi
  local m
  if [[ "$(today_il)" < "$BLOCK_FROM" ]]; then
    for m in "${missing[@]}"; do echo "::warning::pr-evidence-guard WARNING (blocking from $BLOCK_FROM): $m"; done
    return 0
  fi
  for m in "${missing[@]}"; do echo "pr-evidence-guard: $m"; done
  return 1
}

self_test() {
  local status=0
  run_case() {  # name expect body labels files he_added
    local got rc
    PR_EVIDENCE_TODAY="${CASE_TODAY:-$BLOCK_FROM}" PR_EVIDENCE_BODY="$3" PR_EVIDENCE_LABELS="$4" \
      PR_EVIDENCE_FILES="$5" PR_EVIDENCE_HE_ADDED="$6" check >/dev/null 2>&1; rc=$?
    got=PASS; [ "$rc" -ne 0 ] && got=FAIL
    if [ "$got" = "$2" ]; then echo "  [ok] $1 → $got"; else echo "  [XX] $1 → $got, expected $2"; status=1; fi
  }
  local ui=$'frontend/components/Header.jsx\nqa-artifacts/MEH-1/a-375.webp\nqa-artifacts/MEH-1/a-1440.webp'
  local good=$'Self-check: 1-5 done\nCopy approved: thread 18/11'
  local he='+  "x": "שלום",'
  echo "pr-evidence-guard --self-test"
  run_case "docs-only PR, empty body"           PASS ""      ""        "docs/README.md" ""
  run_case "UI change with everything"          PASS "$good" "run-e2e" "$ui" ""
  run_case "UI change, no screenshots"          FAIL "$good" "run-e2e" "frontend/components/Header.jsx" ""
  run_case "UI change, one screenshot"          FAIL "$good" "run-e2e" $'frontend/components/Header.jsx\nqa-artifacts/MEH-1/a.webp' ""
  run_case "UI change, no Self-check line"      FAIL "Copy approved: x" "run-e2e" "$ui" ""
  run_case "UI change, empty Self-check:"       FAIL $'Self-check:\n' "run-e2e" "$ui" ""
  run_case "Self-check as a heading"            PASS $'## Self-check\n1. green' "run-e2e" "$ui" ""
  run_case "UI change, no run-e2e label"        FAIL "$good" "bug"     "$ui" ""
  run_case "test-only frontend change, label"   PASS ""      "run-e2e" "frontend/__tests__/A.test.js" ""
  run_case "backend change, no label"           FAIL ""      ""        "backend/app/main.py" ""
  run_case "Hebrew added, no Copy approved"     FAIL "Self-check: ok" "run-e2e" "$ui" "$he"
  run_case "Hebrew added, Copy approved"        PASS "$good" "run-e2e" "$ui" "$he"
  run_case "English-only he.json change"        PASS "Self-check: ok" "run-e2e" "$ui" '+  "id": "x",'
  CASE_TODAY="2026-11-21" run_case "before BLOCK_FROM only warns" PASS "" "" "backend/app/main.py" ""
  # Anchored to the real tree: a real component path must count as UI.
  local real; real="$(ls frontend/components/*.jsx 2>/dev/null | head -1)"
  if [ -z "$real" ]; then echo "  [XX] real-file anchor: no frontend/components/*.jsx"; status=1
  else run_case "real component path ($real), no evidence" FAIL "" "run-e2e" "$real" ""; fi
  return "$status"
}

case "${1:-}" in
  --self-test) self_test; exit $? ;;
  *) check; exit $? ;;
esac
