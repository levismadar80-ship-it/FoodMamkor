#!/bin/bash
# SessionStart hook — injects branch + HANDOFF context into Claude's session
# Always exits 0. Never blocks. Truncates output at 3000 chars.

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

BRANCH=$(git -C "$ROOT" branch --show-current 2>/dev/null || echo "unknown")

# MEH-784: guardrail drift warning. The 2026-06-07 hooks-strip incident went
# unnoticed for ~1h (two restores) because nothing surfaced that the working copy
# of .claude/settings.json was dirty. Warn loudly at session start when settings.json
# or any hook differs from HEAD. Git-guarded so it never false-warns when git/HEAD
# is unavailable; the prepend keeps the always-exit-0 contract intact.
DRIFT_WARNING=""
if command -v git >/dev/null 2>&1 && git -C "$ROOT" rev-parse HEAD >/dev/null 2>&1; then
  if ! git -C "$ROOT" diff --quiet HEAD -- .claude/settings.json .claude/hooks 2>/dev/null; then
    DRIFT_WARNING="> ⚠️ **GUARDRAILS MODIFIED LOCALLY** — the working copy of \`.claude/settings.json\` or \`.claude/hooks/*\` differs from HEAD. Investigate before proceeding:
> \`git diff HEAD -- .claude/settings.json .claude/hooks\`
> If unintended, restore with \`git checkout -- .claude/settings.json .claude/hooks\`.
> (MEH-784 — see the 2026-06-07 hooks-strip incident.)

"
  fi
fi

# Parse MEH-NN from branch name (feature/meh-123-slug → MEH-123)
ISSUE=$(echo "$BRANCH" | grep -oiE 'meh-[0-9]+' | head -1 | tr '[:lower:]' '[:upper:]')
if [ -z "$ISSUE" ]; then
  ISSUE="none detected"
fi

OUTPUT="${DRIFT_WARNING}## Auto-loaded session context

**Branch:** ${BRANCH}
**Active issue:** ${ISSUE}

### docs/CHANGELOG.md (latest 15 lines)
"

CHANGELOG="$ROOT/docs/CHANGELOG.md"
if [ -f "$CHANGELOG" ]; then
  # Skip 13-line header preamble; show the 17 lines of actual entries after it
  OUTPUT="${OUTPUT}$(head -30 "$CHANGELOG" | tail -17)"
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
