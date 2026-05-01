#!/usr/bin/env bash
# MEH-422 — preemptive runtime block on subprocess bypass of MEH-397 hooks.
#
# Hooked as PreToolUse(Bash). Closes two finding classes surfaced in
# MEH-401 + MEH-403 (originally MEH-406 + MEH-421, now combined here):
#
#   A. Bash shell-out: `node tools/`, `python tools/`, `bash tools/`,
#      `tools/clis/`, `tools/integrations/` patterns. Mehamakor has no
#      `tools/` directory today; future risk if added.
#   B. Python network at script level: when the Bash command is
#      `python <script.py>` and the script is known to do unhooked
#      network calls (`requests`/`urllib`), block unless allowlisted
#      via skills-allowlist.json.allowed_network_hosts.
#
# What this hook CANNOT detect (documented honestly in SECURITY.md):
#   - `requests.get(...)` calls inside an already-running Python process.
#     Once `python script.py` is past the hook, the process is on its own.
#     Defense for that case is audit-time (audit-skills.sh Pass 5) +
#     allowlist documentation, not the hook layer.
#
# Exit codes:
#   0 — allow (command does not match any bypass pattern)
#   2 — deny (bypass pattern detected, or fail-closed on parse error)
#
# Fail-closed semantics mirror MEH-397's check-webfetch-allowlist.sh +
# check-env-read.sh after the MEH-402 adversarial review fix.

set -u

# Fail-closed if jq is missing — match the MEH-397 hook pattern
if ! command -v jq >/dev/null 2>&1; then
  echo "Bash denied: jq not available; cannot verify command (MEH-422 fail-closed)." >&2
  exit 2
fi

input=$(cat)

# Empty-input fail-closed (MEH-402 adversarial-review pattern)
if [ -z "$input" ]; then
  echo "Bash denied: empty hook input (MEH-422 fail-closed)." >&2
  exit 2
fi

if ! cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // ""' 2>/dev/null); then
  echo "Bash denied: malformed JSON input (MEH-422 fail-closed)." >&2
  exit 2
fi

# No command in payload (e.g., other Bash sub-tools) — let it through
if [ -z "$cmd" ]; then
  exit 0
fi

# Skip git commands — commit messages, log formats, branch names can
# contain any text including "tools/" substrings. Same precedent as
# check-bash-safety.sh.
if printf '%s' "$cmd" | grep -iqE '^[[:space:]]*git[[:space:]]'; then
  exit 0
fi

# ---- Class A: bash shell-out bypass patterns ----
# Two alternatives:
#   1. Any path containing tools/clis/, tools/integrations/, or tools/REGISTRY
#      — catches all reference styles (relative, absolute, ./, ../../, etc.)
#   2. Direct executor invocation: (node|python|bash|sh) <anything>tools/
#      — catches `python tools/foo.py`, `node tools/x.js`, etc.
#
# Mehamakor has no `tools/` directory today, so no legitimate command
# should match. If a future legitimate use of `tools/` is added, this
# hook needs explicit refinement (allowlist exact paths) — don't soften
# the pattern.

BYPASS_PATTERNS='tools/(clis|integrations|REGISTRY)|(^|[[:space:]])(node|python[23]?|bash|sh)[[:space:]]+[^[:space:]]*tools/'

if printf '%s' "$cmd" | grep -qE "$BYPASS_PATTERNS"; then
  echo "Bash denied: command matches MEH-422 subprocess-bypass pattern." >&2
  echo "Detected reference to tools/ subprocess invocation. Skills supply chain (MEH-397+MEH-422)" >&2
  echo "blocks this class — see docs/SECURITY.md and .claude/rules/skills.md." >&2
  echo "Command: $cmd" >&2
  exit 2
fi

# ---- Class B: direct invocation of known-network Python scripts ----
# A skill script that imports requests/urllib bypasses MEH-397's
# WebFetch hook entirely (the hook only intercepts Claude's WebFetch
# tool, not subprocess Python network calls). When the Bash command
# directly invokes such a script, this is a precondition to the
# bypass — block unless the skill is allowlisted.
#
# Hardcoded list mirrors skills-allowlist.json entries with non-null
# allowed_network_hosts. Update both when adding/removing entries.

KNOWN_NETWORK_SCRIPTS='audit_a11y\.py|check_shabbat\.py'

if printf '%s' "$cmd" | grep -qE "(^|[[:space:]/])(python[23]?|/)?[^[:space:]]*($KNOWN_NETWORK_SCRIPTS)"; then
  # Check the corresponding allowlist entry. Wildcard ["*"] permits;
  # specific hosts permit (defense is at audit-time, not here);
  # null/[] block.
  ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  ALLOWLIST="$ROOT/.claude/skills-allowlist.json"

  # Identify which script matched
  matched_script=$(printf '%s' "$cmd" | grep -oE "$KNOWN_NETWORK_SCRIPTS" | head -1)

  case "$matched_script" in
    audit_a11y.py)        skill="israeli-accessibility-compliance" ;;
    check_shabbat.py)     skill="shabbat-aware-scheduler" ;;
    *)                    skill="" ;;
  esac

  if [ -n "$skill" ] && [ -f "$ALLOWLIST" ]; then
    hosts=$(jq -r --arg s "$skill" '.skills[$s].allowed_network_hosts // "null" | tojson' "$ALLOWLIST" 2>/dev/null)
    case "$hosts" in
      'null'|'[]')
        echo "Bash denied: $matched_script invocation, but $skill has no allowed_network_hosts (MEH-422)." >&2
        exit 2
        ;;
      *)
        # ["*"] or specific hosts — allowed. Pass-through with note to stderr (visible but doesn't block).
        echo "MEH-422 note: invoking $matched_script ($skill); allowed_network_hosts=$hosts. Hook cannot verify destination — relies on script audit." >&2
        exit 0
        ;;
    esac
  fi

  # Script matched the regex but wasn't in our skill mapping — fail-closed
  echo "Bash denied: $matched_script invocation matched MEH-422 known-network pattern but no skill mapping. Fail-closed." >&2
  exit 2
fi

# Default: command did not match any bypass pattern — allow
exit 0
