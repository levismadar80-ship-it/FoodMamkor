#!/bin/bash
# RTL physical-property guard (PreToolUse: Edit|Write|MultiEdit)
# Blocks Tailwind classes that use physical left/right directions instead of logical start/end.
# Exit 2 = block. Exit 0 = allow.
# Single source of truth: .claude/hooks/rtl-allowlist.txt
# Supports inline `rtl-ok` annotation (±1 line adjacency).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALLOWLIST_FILE="$SCRIPT_DIR/rtl-allowlist.txt"

# Fail-open if allowlist missing
if [ ! -f "$ALLOWLIST_FILE" ]; then
  echo "check-rtl.sh: rtl-allowlist.txt not found — RTL check skipped." >&2
  exit 0
fi

# Load PATH_EXCEPTIONS and CONTENT_PATTERNS from allowlist
mapfile -t PATH_EXCEPTIONS < <(awk '
  /^#.*PATH EXCEPTIONS/  { section="path";    next }
  /^#.*CONTENT PATTERNS/ { section="content"; next }
  /^[[:space:]]*(#|$)/   { next }
  section == "path"      { print }
' "$ALLOWLIST_FILE")

mapfile -t CONTENT_PATTERNS < <(awk '
  /^#.*PATH EXCEPTIONS/  { section="path";    next }
  /^#.*CONTENT PATTERNS/ { section="content"; next }
  /^[[:space:]]*(#|$)/   { next }
  section == "content"   { print }
' "$ALLOWLIST_FILE")

RTL_PATTERN='\b(left-|right-|ml-|mr-|pl-|pr-)[0-9a-z]'

# Require jq — fail-open if missing
if ! command -v jq >/dev/null 2>&1; then
  echo "check-rtl.sh: jq not found — RTL check skipped. Install: pacman -S jq (Git Bash) or https://jqlang.github.io/jq/download/" >&2
  exit 0
fi

# Read JSON from stdin
INPUT=$(cat)

FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""')

# Extract content for both Edit/Write (new_string/content) and MultiEdit (edits[].new_string)
CONTENT=$(printf '%s' "$INPUT" | jq -r '
  if .tool_input.edits then
    [.tool_input.edits[]?.new_string // empty] | join("\n")
  else
    .tool_input.new_string // .tool_input.content // ""
  end')

# Empty content → nothing to check
if [ -z "$CONTENT" ]; then
  exit 0
fi

# Markdown documentation files: prose may reference physical class names
# verbatim as examples. RTL enforcement is for runtime CSS, not prose. MEH-355.
if [[ "$FILE_PATH" == *.md ]]; then
  exit 0
fi

# Check path exceptions (substring matching)
for allowed in "${PATH_EXCEPTIONS[@]}"; do
  if [[ "$FILE_PATH" == *"$allowed"* ]]; then
    exit 0
  fi
done

# Check for physical RTL classes
if printf '%s' "$CONTENT" | grep -qE "$RTL_PATTERN"; then
  # Per-violation ±1 window check: every violation must have an annotation
  # marker on the same line or either adjacent line.
  ALL_ANNOTATED=true
  while IFS=: read -r linenum _; do
    start=$(( linenum > 1 ? linenum - 1 : 1 ))
    window=$(printf '%s' "$CONTENT" | sed -n "${start},$((linenum + 1))p")
    annotated=false
    for cpat in "${CONTENT_PATTERNS[@]}"; do
      if [ -n "$cpat" ] && printf '%s' "$window" | grep -qF "$cpat"; then
        annotated=true
        break
      fi
    done
    if ! $annotated; then
      ALL_ANNOTATED=false
      break
    fi
  done < <(printf '%s' "$CONTENT" | grep -nE "$RTL_PATTERN")
  $ALL_ANNOTATED && exit 0

  MATCHED=$(printf '%s' "$CONTENT" | grep -oE "$RTL_PATTERN" | head -3 | tr '\n' ' ')
  echo "RTL violation in ${FILE_PATH:-<unknown file>}: physical class(es) detected: ${MATCHED}" >&2
  echo "Use logical properties: start-*/end-* instead of left-*/right-*; ms-*/me-* instead of ml-*/mr-*; ps-*/pe-* instead of pl-*/pr-*." >&2
  echo "Real exception? Add 'rtl-ok' within ±1 lines of each violation, or add the file path to .claude/hooks/rtl-allowlist.txt." >&2
  exit 2
fi

exit 0
