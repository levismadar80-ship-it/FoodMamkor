#!/bin/bash
# RTL physical-property guard (PreToolUse: Edit|Write|MultiEdit)
# Blocks Tailwind classes that use physical left/right directions instead of logical start/end.
# Exit 2 = block. Exit 0 = allow.

ALLOWLIST=(
  "frontend/app/map/MapClient.jsx"
  "frontend/components/ImageGallery.jsx"
  "frontend/components/Lightbox.jsx"
  "frontend/components/LoginPromptModal.jsx"
  "frontend/app/login/page.js"
  "frontend/app/register/page.js"
  "frontend/app/settings/page.jsx"
  "frontend/app/reset-password/page.js"
  # TODO: refactor right-3 → end-3, chevron should use logical position (out of scope MEH-341)
  "frontend/components/CategorySelector.jsx"
)

RTL_PATTERN='\b(left-|right-|ml-|mr-|pl-|pr-)[0-9a-z]'

# Require jq — fail-open if missing
if ! command -v jq >/dev/null 2>&1; then
  echo "check-rtl.sh: jq not found — RTL check skipped. Install: pacman -S jq (Git Bash) or https://jqlang.github.io/jq/download/" >&2
  exit 0
fi

# Read JSON from stdin
INPUT=$(cat)

FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""')
CONTENT=$(printf '%s' "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // ""')

# Empty content → nothing to check
if [ -z "$CONTENT" ]; then
  exit 0
fi

# Check allowlist
for allowed in "${ALLOWLIST[@]}"; do
  # Strip leading comment lines
  [[ "$allowed" == \#* ]] && continue
  if [[ "$FILE_PATH" == *"$allowed"* ]]; then
    exit 0
  fi
done

# Check for physical RTL classes
MATCHED=$(printf '%s' "$CONTENT" | grep -oE "$RTL_PATTERN" | head -3 | tr '\n' ' ')

if [ -n "$MATCHED" ]; then
  echo "RTL violation in ${FILE_PATH:-<unknown file>}: physical class(es) detected: ${MATCHED}" >&2
  echo "Use logical properties instead: start-*/end-* (left-*/right-*), ms-*/me-* (ml-*/mr-*), ps-*/pe-* (pl-*/pr-*), ms-auto (ml-auto)." >&2
  echo "Real exception? Add file to ALLOWLIST in .claude/hooks/check-rtl.sh (see .claude/hooks/README.md)." >&2
  exit 2
fi

exit 0
