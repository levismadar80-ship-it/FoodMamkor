#!/usr/bin/env bash
#
# Module:   tool-copy-sync-guard.sh
# Purpose:  A PR that adds a file to an existing tool's `codeRef` in
#           frontend/lib/business-features.js must change that tool's copy too
#           (business_features.items.<id> in frontend/messages/he.json) — the
#           /join list and the site assistant both read it — or say why not in
#           the PR body: `Tool copy: <id> unchanged — <reason>`.
# Touches:  nothing — reads the PR body and the merge-base copies of two files.
#           In CI it may deepen the base branch with `git fetch` (writes .git only).
# Does NOT: judge the wording, or check a brand-new tool (the registry test
#           already demands its copy). Logic and self-test:
#           scripts/checks/lib/tool_copy_sync.py.
# Related:  workflow.md «Launch tier» ב׳, scripts/checks/big-sites-guard.sh (the
#           PR-body reading this mirrors).
# History:  MEH-3643 (creation, 21/11 — on MEH-3611 the logo joined gallery_story's codeRef
#           and its copy never mentioned it; Sapir asked how to prevent it).
#
#   bash scripts/checks/tool-copy-sync-guard.sh --self-test
#   TOOL_COPY_BASE=origin/staging TOOL_COPY_PR_BODY='…' bash scripts/checks/tool-copy-sync-guard.sh
set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1
PY="scripts/checks/lib/tool_copy_sync.py"

if [ "${1:-}" = "--self-test" ]; then exec python3 "$PY" --self-test; fi

pr_body() {
  if [ -n "${TOOL_COPY_PR_BODY+x}" ]; then printf '%s\n' "$TOOL_COPY_PR_BODY"; return 0; fi
  local ev="${GITHUB_EVENT_PATH:-}"
  [ -n "$ev" ] && [ -r "$ev" ] || return 1
  python3 -c '
import json, sys
pr = json.load(open(sys.argv[1], encoding="utf-8")).get("pull_request")
if pr is None: sys.exit(1)
print(pr.get("body") or "")
' "$ev" 2>/dev/null
}

base="${TOOL_COPY_BASE:-}"
if [ -z "$base" ]; then
  if [ -z "${GITHUB_BASE_REF:-}" ]; then
    python3 "$PY" --self-test >/dev/null || { python3 "$PY" --self-test; exit 1; }
    echo "tool-copy-sync-guard: skipped — not a pull request (no base branch)"; exit 0
  fi
  git fetch --no-tags --quiet --depth=200 origin "$GITHUB_BASE_REF" 2>/dev/null || true
  git fetch --no-tags --quiet --deepen=200 2>/dev/null || true
  base="$(git merge-base "origin/$GITHUB_BASE_REF" HEAD 2>/dev/null || echo "origin/$GITHUB_BASE_REF")"
fi
if ! body="$(pr_body)"; then body=""; fi
printf '%s' "$body" | python3 "$PY" "$base"
