#!/usr/bin/env bash
# MEH-397 Layer 1: blocks Read tool on .env files (credential exfil defense).
# Exit 2 = block. Fail-closed if jq missing (deny by default for safety).

set -u

if ! command -v jq >/dev/null 2>&1; then
  echo "Read denied: jq not available; cannot verify path (MEH-397 fail-closed)." >&2
  exit 2
fi

input=$(cat)
fp=$(echo "$input" | jq -r '.tool_input.file_path // ""')

if [ -z "$fp" ]; then
  exit 0
fi

base=$(basename "$fp")

case "$base" in
  .env|.env.*|*.env|*.env.local|*.env.production|*.env.staging|*.env.development|*.env.test)
    echo "Read denied: '$fp' looks like an env file (MEH-397 — credentials must not be read by skills/agents)." >&2
    exit 2
    ;;
esac

exit 0
