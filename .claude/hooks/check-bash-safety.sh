#!/bin/bash
# Bash safety guard (PreToolUse: Bash)
# Blocks dangerous DB DDL and destructive filesystem commands.
# Exit 2 = block. Exit 0 = allow.
# Last updated: 2026-05-05 (MEH-408 production-safety deny-list extension)

# Require jq — fail-open if missing
if ! command -v jq >/dev/null 2>&1; then
  echo "check-bash-safety.sh: jq not found — safety check skipped. Install: pacman -S jq (Git Bash) or https://jqlang.github.io/jq/download/" >&2
  exit 0
fi

COMMAND=$(cat | jq -r '.tool_input.command // ""')

if [ -z "$COMMAND" ]; then
  exit 0
fi

# Git commands: commit messages, log formats, and branch names can contain any text
# (SQL keywords, paths, rm flags). Skip all pattern checks — git cannot execute
# embedded text as shell. The patterns below are for direct shell execution only.
if echo "$COMMAND" | grep -iqE '^[[:space:]]*git[[:space:]]'; then
  exit 0
fi

# Check blocked patterns (case-insensitive)
check_pattern() {
  local pattern="$1"
  local label="$2"
  local guidance="$3"
  if echo "$COMMAND" | grep -iEq "$pattern"; then
    echo "Blocked: ${label}" >&2
    echo "${guidance}" >&2
    exit 2
  fi
}

DB_GUIDANCE="DB schema changes → use Alembic migrations per docs/MIGRATIONS.md (never ALTER TABLE DROP or DROP COLUMN directly)."
FS_GUIDANCE="Destructive filesystem command → run manually outside Claude Code."

check_pattern 'ALTER[[:space:]]+TABLE.*DROP'  "ALTER TABLE ... DROP (dangerous DDL)" "$DB_GUIDANCE"
check_pattern 'DROP[[:space:]]+TABLE'         "DROP TABLE"                           "$DB_GUIDANCE"
check_pattern 'DROP[[:space:]]+COLUMN'        "DROP COLUMN"                          "$DB_GUIDANCE"
check_pattern 'DROP[[:space:]]+DATABASE'      "DROP DATABASE"                        "$DB_GUIDANCE"
check_pattern 'DROP[[:space:]]+SCHEMA'        "DROP SCHEMA"                          "$DB_GUIDANCE"
check_pattern 'TRUNCATE[[:space:]]+TABLE'     "TRUNCATE TABLE"                       "$DB_GUIDANCE"
# MEH-408 reverses the MEH-341 accept-risk: bare `TRUNCATE tablename` (no TABLE keyword)
# is now blocked. Mass-truncate of a production table by accident has no recovery path.
check_pattern '(^|[[:space:]]|;)TRUNCATE[[:space:]]+[a-zA-Z_"]' "TRUNCATE (bare form)" "$DB_GUIDANCE"

# DELETE FROM without WHERE — two-step heuristic (MEH-408).
# Limit: a multi-statement line where one DELETE has WHERE and another doesn't will pass.
# Acceptable risk — matches the heuristic level of the rest of this hook.
if echo "$COMMAND" | grep -iqE 'DELETE[[:space:]]+FROM[[:space:]]+'; then
  if ! echo "$COMMAND" | grep -iqE 'WHERE'; then
    echo "Blocked: DELETE FROM without WHERE clause" >&2
    echo "$DB_GUIDANCE" >&2
    exit 2
  fi
fi

check_pattern 'rm[[:space:]]+-rf[[:space:]]+/'      "rm -rf /"            "$FS_GUIDANCE"
check_pattern 'rm[[:space:]]+-rf[[:space:]]+~'      "rm -rf ~ (home dir)" "$FS_GUIDANCE"
check_pattern 'rm[[:space:]]+-rf[[:space:]]+\$HOME' "rm -rf \$HOME"       "$FS_GUIDANCE"
check_pattern 'rm[[:space:]]+-rf[[:space:]]+\.[[:space:]]*$' "rm -rf . (cwd)" "$FS_GUIDANCE"

# MEH-408 — production infra commands. Run from your own terminal, never from Claude Code.
check_pattern 'railway[[:space:]]+(down|service[[:space:]]+delete)' "railway destructive command" "$FS_GUIDANCE"
check_pattern 'vercel[[:space:]]+(--prod|rm)'                       "vercel destructive/prod command" "$FS_GUIDANCE"
check_pattern '\$DATABASE_URL_PRODUCTION'                           "command references production DB URL" "$FS_GUIDANCE"

exit 0
