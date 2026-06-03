#!/bin/bash
# SubagentStop trace hook (MEH-621 — derived from MEH-502 audit REC 3)
set -e
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
LOG_DIR="$ROOT/docs/audits"
LOG_FILE="$LOG_DIR/subagent-trace.log"
mkdir -p "$LOG_DIR"
if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi
INPUT=$(cat)
[ -z "$INPUT" ] && exit 0
AGENT_TYPE=$(echo "$INPUT" | jq -r '.agent_type // "unknown"')
AGENT_ID=$(echo "$INPUT" | jq -r '.agent_id // "unknown"')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')
TRANSCRIPT=$(echo "$INPUT" | jq -r '.agent_transcript_path // empty')
TOOLS="?"
DURATION_MS="null"
if [ -n "$TRANSCRIPT" ] && [ -r "$TRANSCRIPT" ]; then
  TOOLS_RAW=$(jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | .name' "$TRANSCRIPT" 2>/dev/null \
    | sort -u | tr '\n' ',' | sed 's/,$//')
  [ -n "$TOOLS_RAW" ] && TOOLS="$TOOLS_RAW"
  FIRST=$(jq -r '.timestamp // empty' "$TRANSCRIPT" 2>/dev/null | head -1)
  LAST=$(jq -r '.timestamp // empty' "$TRANSCRIPT" 2>/dev/null | tail -1)
  if [ -n "$FIRST" ] && [ -n "$LAST" ]; then
    F_NS=$(date -d "$FIRST" +%s%N 2>/dev/null || echo "")
    L_NS=$(date -d "$LAST" +%s%N 2>/dev/null || echo "")
    if [ -n "$F_NS" ] && [ -n "$L_NS" ] && [ "$L_NS" -ge "$F_NS" ]; then
      DURATION_MS=$(( (L_NS - F_NS) / 1000000 ))
    fi
  fi
fi
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
jq -nc \
  --arg ts "$NOW" \
  --arg at "$AGENT_TYPE" \
  --arg ai "$AGENT_ID" \
  --arg sid "$SESSION_ID" \
  --argjson sha "$STOP_HOOK_ACTIVE" \
  --arg tools "$TOOLS" \
  --arg dur "$DURATION_MS" \
  '{ts:$ts, agent_type:$at, agent_id:$ai, session_id:$sid, stop_hook_active:$sha, tools_called:$tools, duration_ms:($dur|tonumber? // null)}' \
  >> "$LOG_FILE"
exit 0
