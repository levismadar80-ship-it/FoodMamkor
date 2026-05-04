#!/bin/bash
# lint-feedback.sh — PostToolUse: Edit|Write|MultiEdit (MEH-445 / MEH-441 Wave 4/4)
# Runs lint on the just-edited code file, returns errors to Claude as feedback.
# 3-strikes-per-file limit guards against infinite retry loops.
#
# Signal model:
#   attempt 1-2 fail → decision:approve + reason  (continue with feedback)
#   attempt 3 fail   → decision:block + reason + exit 2  (stop, human review)
#   pass             → reset state, exit 0
#
# Defensive: missing tools/configs → silent exit 0 (never block on env issues).
# Self-protect: skips .claude/* paths to avoid recursion with MEH-442 hook
# and corruption of state files.

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

INPUT=$(cat)
REPO_ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
STATE_DIR="$REPO_ROOT/.claude/hooks/.lint-attempts"
MAX_ATTEMPTS=3

# Collect candidate paths from Edit/Write (.file_path) + MultiEdit (.edits[].file_path).
PATHS=$(printf '%s' "$INPUT" | jq -r '
  [ .tool_input.file_path // empty,
    (.tool_input.edits // [] | .[]?.file_path // empty)
  ] | .[] | select(length > 0)' 2>/dev/null)

[ -z "$PATHS" ] && exit 0

mkdir -p "$STATE_DIR" 2>/dev/null

while IFS= read -r fp; do
  # Normalize to repo-relative path.
  case "$fp" in
    /*) rel_path="${fp#$REPO_ROOT/}" ;;
    *)  rel_path="$fp" ;;
  esac

  # Self-protect: never lint our own infra.
  case "$rel_path" in
    .claude/*) continue ;;
  esac

  # Route to linter by extension.
  case "$rel_path" in
    *.js|*.jsx|*.ts|*.tsx)
      linter="frontend"
      lint_target="${rel_path#frontend/}"
      ;;
    *.py)
      linter="backend"
      lint_target="${rel_path#backend/}"
      ;;
    *)
      continue
      ;;
  esac

  # Defensive guards — silent skip if tooling absent.
  if [ "$linter" = "frontend" ]; then
    [ -d "$REPO_ROOT/frontend/node_modules" ] || continue
    [ -f "$REPO_ROOT/frontend/eslint.config.mjs" ] || continue
    command -v npx >/dev/null 2>&1 || continue
    LINT_OUTPUT=$(cd "$REPO_ROOT/frontend" && npx --no-install eslint "$lint_target" 2>&1)
    LINT_EXIT=$?
  else
    command -v ruff >/dev/null 2>&1 || continue
    [ -f "$REPO_ROOT/backend/pyproject.toml" ] || continue
    LINT_OUTPUT=$(cd "$REPO_ROOT/backend" && ruff check "$lint_target" 2>&1)
    LINT_EXIT=$?
  fi

  # State file = md5 of repo-relative path → integer counter.
  hash=$(printf '%s' "$rel_path" | md5sum | cut -d' ' -f1)
  state_file="$STATE_DIR/$hash.count"

  case "$LINT_EXIT" in
    0)
      # Clean → reset counter, move on.
      rm -f "$state_file"
      continue
      ;;
    1)
      # Errors found → increment + emit feedback or block.
      attempt=$(cat "$state_file" 2>/dev/null || echo 0)
      attempt=$((attempt + 1))

      if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
        rm -f "$state_file"
        reason="⛔ CRITICAL: $rel_path failed linting 3 times. STOPPING. Human review required — do not retry without manual fix. Attempt counter reset for next session."
        printf '{"decision":"block","reason":%s}\n' "$(printf '%s' "$reason" | jq -Rs .)"
        exit 2
      else
        echo "$attempt" > "$state_file"
        reason=$(printf 'Lint issues in %s (attempt %d/%d):\n%s\n\nFix and retry.' "$rel_path" "$attempt" "$MAX_ATTEMPTS" "$LINT_OUTPUT")
        printf '{"decision":"approve","reason":%s}\n' "$(printf '%s' "$reason" | jq -Rs .)"
        exit 0
      fi
      ;;
    *)
      # Unknown / config error → silent skip (don't block on bad config).
      continue
      ;;
  esac
done <<< "$PATHS"

exit 0
