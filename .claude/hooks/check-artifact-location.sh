#!/bin/bash
# check-artifact-location.sh — PreToolUse: Edit|Write|MultiEdit (MEH-449 Layer 4)
#
# Blocks Claude Code from writing AI development artifacts into deployable
# directories. An artifact that never lands in frontend/public/ (or any other
# served directory) can never be shipped by Vercel/Railway, whatever the
# ignore files say — this is the earliest of the four MEH-449 defense layers.
#
# CANONICAL FORBIDDEN-PATTERN LIST (MEH-449) — single source of truth.
# Layers 1-3 (.dockerignore / frontend/.dockerignore / frontend/.vercelignore,
# the ai-artifact-scan CI job, e2e/flows/23-ai-artifact-probe.spec.ts) copy
# this list verbatim; update it HERE first, then mirror.
#
# Exit 2 = block. Exit 0 = allow.
# Fail-closed (exit 2) if jq is missing or the input is malformed — per the
# MEH-449 spec (stricter than check-bash-safety.sh's fail-open; matches the
# check-env-read.sh discipline). Structure mirrors check-bash-safety.sh.

# ---- Canonical forbidden patterns ----
# Spec list: CLAUDE.md - CLAUDE.local.md - HANDOFF.md - ROADMAP.md -
# CHANGELOG.md - .claude/ - .cursor/ - AGENTS.md - .aider.conf.yml -
# docs/SECURITY.md - docs/MIGRATIONS.md - docs/DEPLOYMENT.md -
# docs/MANUAL_TESTING.md
# The four docs/* entries are enforced by basename here: inside a deployable
# dir, a file named SECURITY.md is the artifact wherever its docs/ prefix went.
FORBIDDEN_BASENAMES=(
  ".aider.conf.yml"
  "agents.md"
  "changelog.md"
  "claude.local.md"
  "claude.md"
  "deployment.md"
  "handoff.md"
  "manual_testing.md"
  "migrations.md"
  "roadmap.md"
  "security.md"
)
FORBIDDEN_DIR_SEGMENTS=(
  ".claude"
  ".cursor"
)

# ---- Deployable directories (deny-list) ----
DENY_DIRS=(
  "frontend/public/"
  "frontend/app/api/"
  "backend/static/"
  "backend/app/static/"
)

# ---- Fail-closed jq requirement ----
if ! command -v jq >/dev/null 2>&1; then
  echo "check-artifact-location.sh: jq not found — failing closed (MEH-449). Install jq to edit files." >&2
  exit 2
fi

INPUT=$(cat)
if [ -z "$INPUT" ]; then
  echo "check-artifact-location.sh: empty hook input — failing closed (MEH-449)." >&2
  exit 2
fi

# Edit/Write use top-level file_path; the edits[].file_path branch is
# defensive coverage for the documented MultiEdit shape (see
# protect-lint-config.sh — empirical MultiEdit uses a single top-level path).
PATHS=$(printf '%s' "$INPUT" | jq -r '
  [ .tool_input.file_path // empty,
    (.tool_input.edits // [] | .[]?.file_path // empty)
  ] | .[] | select(length > 0)' 2>/dev/null)

if [ $? -ne 0 ] || [ -z "$PATHS" ]; then
  echo "check-artifact-location.sh: malformed hook input (no file_path) — failing closed (MEH-449)." >&2
  exit 2
fi

in_deny_dir() {
  local p="$1" d
  for d in "${DENY_DIRS[@]}"; do
    case "$p" in
      *"$d"*) return 0 ;;
    esac
  done
  return 1
}

while IFS= read -r fp; do
  in_deny_dir "$fp" || continue

  base=$(basename "$fp" | tr '[:upper:]' '[:lower:]')
  for forbidden in "${FORBIDDEN_BASENAMES[@]}"; do
    if [ "$base" = "$forbidden" ]; then
      echo "Blocked: '$fp' is an AI development artifact inside a deployable directory (MEH-449)." >&2
      echo "AI artifacts (CLAUDE.md, HANDOFF.md, docs/SECURITY.md, ...) must never be written under frontend/public/, frontend/app/api/, backend/static/, or backend/app/static/." >&2
      exit 2
    fi
  done

  lower_fp=$(printf '%s' "$fp" | tr '[:upper:]' '[:lower:]')
  for seg in "${FORBIDDEN_DIR_SEGMENTS[@]}"; do
    case "$lower_fp" in
      *"/$seg/"*)
        echo "Blocked: '$fp' writes under a '$seg/' tree inside a deployable directory (MEH-449)." >&2
        echo "AI tooling directories (.claude/, .cursor/) must never exist under frontend/public/, frontend/app/api/, backend/static/, or backend/app/static/." >&2
        exit 2
        ;;
    esac
  done
done <<< "$PATHS"

exit 0
