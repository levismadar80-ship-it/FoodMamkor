#!/bin/bash
# check-branch-name.sh — PreToolUse: Bash (MEH-1141)
#
# Purpose:  Mechanically enforce the branch-naming convention (workflow rule 3).
#           Blocks a `git push` of a non-conforming current/target branch and
#           the creation of a non-conforming branch (checkout -b/-B, switch -c,
#           branch {name}). Reminders in the prompt weren't enough — CC shipped
#           `claude/meh-1132-implementation-xrlw17` (PR #1639) against rule 3;
#           this is the mechanism (MEH-271: mechanism > memory).
# Does NOT: touch commit messages, tags, or branch names on read paths (fetch,
#           pull, log, status, checkout of an existing branch) — zero friction
#           there. Branch BASE verification lives in check-branch-base.sh.
# Related:  .claude/hooks/check-bash-safety.sh (Bash-matcher precedent),
#           .claude/rules/workflow.md (rule 3 + the locked pattern).
# History:  MEH-1141 (creation — trigger: MEH-1132 rule-3 violation).
#
# Exit 2 = block. Exit 0 = allow. Fail-open if jq missing (branch naming is a
# convention guard, not a security boundary — mirrors check-bash-safety.sh:8-11).

# Single source of truth for the allowed pattern (locked MEH-1141, 2026-07-12).
# feature/meh-{N}-{slug}  |  levismadar80/meh-{N}-{slug}  |  dependabot/*
ALLOWED_BRANCH_RE='^(feature|levismadar80)/meh-[0-9]+(-[a-z0-9]+)*$|^dependabot/.*'

if ! command -v jq >/dev/null 2>&1; then
  echo "check-branch-name.sh: jq not found — branch-name check skipped." >&2
  exit 0
fi

COMMAND=$(cat | jq -r '.tool_input.command // ""')
[ -z "$COMMAND" ] && exit 0

# Only git can create or push a branch — everything else is out of scope.
echo "$COMMAND" | grep -qE '(^|[[:space:];&|])git([[:space:]]|$)' || exit 0

conforms() { echo "$1" | grep -Eq "$ALLOWED_BRANCH_RE"; }

emit_block() {
  local name="$1" action="$2"
  echo "Blocked: ${action} branch '${name}' — violates the locked naming convention (workflow rule 3, MEH-1141)." >&2
  echo "Allowed branch names:" >&2
  echo "  feature/meh-{N}-{slug}        e.g. feature/meh-1141-branch-name-guard" >&2
  echo "  levismadar80/meh-{N}-{slug}   (Linear 'copy git branch name')" >&2
  echo "  dependabot/*" >&2
  echo "Rename before proceeding: git branch -m {conforming-name} (or git checkout -B {conforming-name})." >&2
  exit 2
}

# --- Branch creation ------------------------------------------------------
# checkout -b/-B {name}  (greedy .* pins the last -b/-B, capture the next token)
if echo "$COMMAND" | grep -qE 'git[[:space:]]+checkout[[:space:]].*-[bB][[:space:]]'; then
  name=$(echo "$COMMAND" | sed -nE 's/.*checkout[[:space:]].*-[bB][[:space:]]+([^[:space:];&|]+).*/\1/p')
  [ -n "$name" ] && ! conforms "$name" && emit_block "$name" "create"
fi

# switch -c/-C {name}
if echo "$COMMAND" | grep -qE 'git[[:space:]]+switch[[:space:]].*-[cC][[:space:]]'; then
  name=$(echo "$COMMAND" | sed -nE 's/.*switch[[:space:]].*-[cC][[:space:]]+([^[:space:];&|]+).*/\1/p')
  [ -n "$name" ] && ! conforms "$name" && emit_block "$name" "create"
fi

# git branch {name}  (plain creation only — first arg is not a flag; -d/-m/-a/
# --show-current and the bare list form all start with '-' or have no arg).
if echo "$COMMAND" | grep -qE 'git[[:space:]]+branch[[:space:]]+[^-[:space:]]'; then
  name=$(echo "$COMMAND" | sed -nE 's/.*git[[:space:]]+branch[[:space:]]+([^-][^[:space:];&|]*).*/\1/p')
  [ -n "$name" ] && ! conforms "$name" && emit_block "$name" "create"
fi

# --- Push -----------------------------------------------------------------
# The branch that lands on the remote: explicit token after `origin`, else the
# current branch (bare `git push` / `git push -u origin HEAD`).
if echo "$COMMAND" | grep -qE 'git[[:space:]]+push'; then
  pushed=$(echo "$COMMAND" | sed -nE 's/.*origin[[:space:]]+([^[:space:];&|]+).*/\1/p')
  # src:dst refspec → the remote branch is the dst side.
  case "$pushed" in *:*) pushed="${pushed##*:}";; esac
  if [ -z "$pushed" ] || [ "$pushed" = "HEAD" ]; then
    pushed=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
  fi
  [ -n "$pushed" ] && ! conforms "$pushed" && emit_block "$pushed" "push"
fi

exit 0