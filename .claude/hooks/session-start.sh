#!/bin/bash
# SessionStart hook — injects branch + HANDOFF context into Claude's session
# Always exits 0. Never blocks. Truncates output at 3000 chars.

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

BRANCH=$(git -C "$ROOT" branch --show-current 2>/dev/null || echo "unknown")

# Parse MEH-NN from branch name (feature/meh-123-slug → MEH-123)
ISSUE=$(echo "$BRANCH" | grep -oiE 'meh-[0-9]+' | head -1 | tr '[:lower:]' '[:upper:]')
if [ -z "$ISSUE" ]; then
  ISSUE="none detected"
fi

OUTPUT="## Auto-loaded session context

**Branch:** ${BRANCH}
**Active issue:** ${ISSUE}

### docs/CHANGELOG.md (latest 15 lines)
"

CHANGELOG="$ROOT/docs/CHANGELOG.md"
if [ -f "$CHANGELOG" ]; then
  OUTPUT="${OUTPUT}$(head -15 "$CHANGELOG")"
else
  OUTPUT="${OUTPUT}(docs/CHANGELOG.md not found)"
fi

OUTPUT="${OUTPUT}

### HANDOFF.md (last 40 lines)
"

HANDOFF="$ROOT/HANDOFF.md"
if [ -f "$HANDOFF" ]; then
  OUTPUT="${OUTPUT}$(tail -40 "$HANDOFF")"
else
  OUTPUT="${OUTPUT}(HANDOFF.md not found)"
fi

# Truncate to 3000 chars
printf '%s' "$OUTPUT" | head -c 3000

exit 0
