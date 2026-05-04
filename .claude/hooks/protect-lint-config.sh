#!/bin/bash
# protect-lint-config.sh — PreToolUse: Edit|Write|MultiEdit (MEH-442)
# Blocks edits to lint configs and to this hook + its settings registration.
# Goal: AI cannot bypass MEH-441 lint guardrails by relaxing the rules themselves.
# Exit 2 = block (also emits decision:block JSON to stdout). Exit 0 = allow.
# Fail-open if jq missing (matches sibling hooks: check-rtl.sh, check-bash-safety.sh).

# Protected paths (suffix match against tool_input.file_path).
# pyproject.toml: v1 blocks the entire file.
# TODO v2: scope to [tool.ruff*] sections only (MEH-442 v1)
PROTECTED=(
  "frontend/.eslintrc.json"
  "frontend/.eslintrc.js"
  "frontend/eslint.config.js"
  "frontend/eslint.config.mjs"
  "frontend/eslint.config.cjs"
  "frontend/eslint.config.ts"
  "backend/pyproject.toml"
  ".claude/settings.json"
  ".claude/hooks/protect-lint-config.sh"
)

REASON='Edits to lint configs and lint-protection hook are blocked (MEH-442). If a rule blocks your task, REPORT to user with explanation. Do NOT modify config.'

if ! command -v jq >/dev/null 2>&1; then
  echo "protect-lint-config.sh: jq not found — lint-config protection skipped." >&2
  exit 0
fi

INPUT=$(cat)

# Collect candidate paths from Edit/Write (.file_path) + MultiEdit (.edits[].file_path).
PATHS=$(printf '%s' "$INPUT" | jq -r '
  [ .tool_input.file_path // empty,
    (.tool_input.edits // [] | .[]?.file_path // empty)
  ] | .[] | select(length > 0)')

[ -z "$PATHS" ] && exit 0

while IFS= read -r fp; do
  for protected in "${PROTECTED[@]}"; do
    if [[ "$fp" == *"$protected" ]]; then
      printf '{"decision":"block","reason":"%s"}\n' "$REASON"
      echo "Blocked edit to protected lint config: $fp" >&2
      echo "$REASON" >&2
      exit 2
    fi
  done
done <<< "$PATHS"

exit 0
