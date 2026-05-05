#!/usr/bin/env bash
# MEH-427: Branch-base verification — block `git commit` when the current
# branch has diverged so far from origin/staging that it almost certainly
# was created off main (CC harness bug, GitHub issue #24516).
#
# Wiring: PreToolUse hook with matcher "Bash" — call before passing the
# command through. Exit 2 = block. Exit 0 = allow.
#
# This file is unwired by default (.claude/settings.json edits are blocked
# by .claude/hooks/protect-lint-config.sh). To enable, add a PreToolUse
# Bash entry pointing here.
set -euo pipefail

# Read tool input from stdin (Claude Code hook contract).
if command -v jq >/dev/null 2>&1; then
  cmd=$(jq -r '.tool_input.command // ""' 2>/dev/null || echo "")
else
  cmd=$(cat 2>/dev/null || echo "")
fi

# Only act on `git commit`. Everything else passes through.
case "$cmd" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

# Skip when not on a branch (detached HEAD) or on staging/main themselves.
branch=$(git branch --show-current 2>/dev/null || echo "")
case "$branch" in
  ""|"main"|"staging") exit 0 ;;
esac

# Need an up-to-date origin/staging ref. If the fetch fails (offline,
# sandbox), fail-open — the rule is documented in workflow.md regardless.
git fetch --quiet origin staging 2>/dev/null || exit 0

divergence=$(git rev-list --count HEAD ^origin/staging 2>/dev/null || echo 0)

# Threshold per workflow.md § Branch-base verification: >50 commits
# diverged ≈ branched off main, not staging.
if [ "$divergence" -gt 50 ]; then
  echo "⛔ Branch-base check FAILED: '$branch' is $divergence commits diverged from origin/staging." >&2
  echo "   Likely created off main (CC harness bug — GitHub issue #24516)." >&2
  echo "   Abort + recreate per .claude/rules/workflow.md § Branch-base verification:" >&2
  echo "     1. git stash" >&2
  echo "     2. git checkout staging && git pull origin staging" >&2
  echo "     3. git checkout -b $branch" >&2
  echo "     4. git stash pop" >&2
  exit 2
fi

exit 0
