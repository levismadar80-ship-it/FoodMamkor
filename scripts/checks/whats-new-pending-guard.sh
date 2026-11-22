#!/usr/bin/env bash
#
# Module:   whats-new-pending-guard.sh
# Purpose:  Changesets for «מה חדש». Into staging: a PR that makes a tool live
#           in frontend/lib/business-features.js adds `- <id>: <draft>` to
#           docs/release/whats-new-pending.md, or its body says
#           `Whats-new: <id> none — <reason>`. Into main (a release): that file
#           has no items left — the release moved them into frontend/lib/whats-new.js.
# Touches:  nothing — reads the PR body, the merge-base registry and the pending
#           file. In CI it may deepen the base branch with `git fetch`.
# Does NOT: check wording (Sapir approves it at release time, rule 22). Logic
#           and self-test: scripts/checks/lib/whats_new_pending.py.
# Related:  scripts/checks/whats-new-release-guard.sh, docs/release/whats-new.md.
# History:  MEH-3643 (creation, 21/11 — Sapir: «איך נוכל למנוע מזה»).
#
#   bash scripts/checks/whats-new-pending-guard.sh --self-test
#   WHATS_NEW_PENDING_BASE=origin/staging WHATS_NEW_PENDING_PR_BODY='…' bash scripts/checks/whats-new-pending-guard.sh
set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1
PY="scripts/checks/lib/whats_new_pending.py"

if [ "${1:-}" = "--self-test" ]; then exec python3 "$PY" --self-test; fi

pr_body() {
  if [ -n "${WHATS_NEW_PENDING_PR_BODY+x}" ]; then printf '%s\n' "$WHATS_NEW_PENDING_PR_BODY"; return 0; fi
  local ev="${GITHUB_EVENT_PATH:-}"
  [ -n "$ev" ] && [ -r "$ev" ] || return 1
  python3 -c '
import json, sys
pr = json.load(open(sys.argv[1], encoding="utf-8")).get("pull_request")
if pr is None: sys.exit(1)
print(pr.get("body") or "")
' "$ev" 2>/dev/null
}

mode="staging"; [ "${GITHUB_BASE_REF:-}" = "main" ] && mode="release"
base="${WHATS_NEW_PENDING_BASE:-}"
if [ -z "$base" ]; then
  if [ -z "${GITHUB_BASE_REF:-}" ]; then
    python3 "$PY" --self-test >/dev/null || { python3 "$PY" --self-test; exit 1; }
    echo "whats-new-pending-guard: skipped — not a pull request (no base branch)"; exit 0
  fi
  git fetch --no-tags --quiet --depth=200 origin "$GITHUB_BASE_REF" 2>/dev/null || true
  git fetch --no-tags --quiet --deepen=200 2>/dev/null || true
  base="$(git merge-base "origin/$GITHUB_BASE_REF" HEAD 2>/dev/null || echo "origin/$GITHUB_BASE_REF")"
fi
if ! body="$(pr_body)"; then body=""; fi
printf '%s' "$body" | python3 "$PY" "$mode" "$base"
