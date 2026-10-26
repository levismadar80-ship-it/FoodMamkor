#!/bin/bash
# SessionStart hook — injects branch + the newest HANDOFF section into Claude's session
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

### HANDOFF.md — newest section (where we are now)
"

HANDOFF="$ROOT/HANDOFF.md"
if [ -f "$HANDOFF" ]; then
  # HANDOFF.md is newest-first (ADR-035): print from the first "## " header up to,
  # not including, the second one. tail would show the OLDEST section.
  OUTPUT="${OUTPUT}$(awk '/^## /{n++} n==1' "$HANDOFF")"
else
  OUTPUT="${OUTPUT}(HANDOFF.md not found)"
fi

# Truncate to 3000 chars
printf '%s' "$OUTPUT" | head -c 3000

exit 0
