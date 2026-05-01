#!/usr/bin/env bash
# MEH-397 — Skills supply-chain audit script.
#
# Scans .agents/skills/*/SKILL.md (canonical content path; .claude/skills/* are
# symlinks back to here) for security-suspicious patterns. Verifies every skill
# directory under .agents/skills/ AND .claude/skills/ has an allowlist entry in
# .claude/skills-allowlist.json with a non-blocked audit_verdict.
#
# Usage:
#   bash .claude/scripts/audit-skills.sh             # audit real tree
#   bash .claude/scripts/audit-skills.sh --self-test # scan bad-skill fixture
#
# Exit codes:
#   0 — clean (no critical findings, all skills allowlisted with valid verdict)
#   1 — critical findings OR allowlist coverage gap OR blocked skill present
#   2 — script invocation error (missing jq, missing allowlist file, etc.)
#
# Compatible with: GNU bash 4+, GNU grep with -P (PCRE). Tested on Ubuntu CI
# and Git Bash for Windows (MEH-397 verification matrix).

set -u

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
ALLOWLIST="$ROOT/.claude/skills-allowlist.json"
SELF_TEST=0

if [ "${1:-}" = "--self-test" ]; then
  SELF_TEST=1
fi

# ---- Pattern classes ----
# Network: known HTTP libraries + raw URL prefixes.
NETWORK_PATTERNS='\brequests\.|\burllib\b|\bfetch\(|\baxios\b|\bsocket\.|\bhttp\.client\b|\bWebFetch\b|https?://'
# Code execution: shell-out, dynamic eval, dynamic import.
EXEC_PATTERNS='\bsubprocess\b|\bos\.system\b|\bos\.popen\b|\beval\(|\bexec\(|\bcompile\(|child_process|\bspawn\(|\bimportlib\b'
# Credential / secret-name scrape.
SECRET_PATTERNS='\bAPI_KEY\b|\bSECRET\b|\bTOKEN\b|\bAUTH\b|\bBEARER\b|\bCREDENTIAL\b|\bos\.environ\b|\bprocess\.env\b'
# Prompt-injection canaries (deviation from spec — patterns chosen vs spec's
# agent-rule patterns; documented in .claude/rules/skills.md).
INJECT_PATTERNS='ignore previous|system prompt|disregard|override.*instruction|forget.*above'

if ! command -v jq >/dev/null 2>&1; then
  echo "[ERROR] jq not available — required for allowlist validation." >&2
  exit 2
fi

if ! command -v grep >/dev/null 2>&1; then
  echo "[ERROR] grep not available." >&2
  exit 2
fi

# ---- Choose target directory ----
if [ "$SELF_TEST" -eq 1 ]; then
  TARGET="$ROOT/.claude/scripts/test/fixtures"
  echo "================================================"
  echo "MEH-397 audit-skills.sh (SELF-TEST)"
  echo "Target: $TARGET"
  echo "================================================"
else
  TARGET="$ROOT/.agents/skills"
  if [ ! -d "$TARGET" ]; then
    echo "[ERROR] $TARGET not found." >&2
    exit 2
  fi
  echo "================================================"
  echo "MEH-397 audit-skills.sh"
  echo "Target: $TARGET"
  echo "================================================"
fi

CRITICAL=0
WARN=0
REPORT_TMP=$(mktemp)
trap 'rm -f "$REPORT_TMP"' EXIT

# ---- Pass 1: pattern scan ----
shopt -s nullglob
for skill_dir in "$TARGET"/*/; do
  skill=$(basename "$skill_dir")
  md="${skill_dir}SKILL.md"
  [ -f "$md" ] || continue

  net_hits=$(grep -nP "$NETWORK_PATTERNS" "$md" 2>/dev/null || true)
  exec_hits=$(grep -nP "$EXEC_PATTERNS" "$md" 2>/dev/null || true)
  secret_hits=$(grep -nP "$SECRET_PATTERNS" "$md" 2>/dev/null || true)
  inject_hits=$(grep -niP "$INJECT_PATTERNS" "$md" 2>/dev/null || true)

  classes=0
  [ -n "$net_hits" ] && classes=$((classes+1))
  [ -n "$exec_hits" ] && classes=$((classes+1))
  [ -n "$secret_hits" ] && classes=$((classes+1))
  [ -n "$inject_hits" ] && classes=$((classes+1))

  if [ "$classes" -ge 2 ]; then
    CRITICAL=$((CRITICAL+1))
    {
      printf '\n[CRITICAL] %s — %d suspicious-pattern classes hit:\n' "$skill" "$classes"
      [ -n "$net_hits"    ] && printf '  network:\n%s\n' "$net_hits"    | sed 's/^/    /'
      [ -n "$exec_hits"   ] && printf '  exec:\n%s\n' "$exec_hits"      | sed 's/^/    /'
      [ -n "$secret_hits" ] && printf '  secret-name:\n%s\n' "$secret_hits" | sed 's/^/    /'
      [ -n "$inject_hits" ] && printf '  injection:\n%s\n' "$inject_hits" | sed 's/^/    /'
    } >> "$REPORT_TMP"
  elif [ "$classes" -eq 1 ]; then
    WARN=$((WARN+1))
  fi
done

# ---- Pass 2: allowlist coverage (skipped for self-test) ----
if [ "$SELF_TEST" -eq 0 ]; then
  if [ ! -f "$ALLOWLIST" ]; then
    echo "[ERROR] $ALLOWLIST not found — cannot verify coverage." >&2
    exit 2
  fi

  # Union of skill names from both directories.
  skill_names=$( ( ls -1 "$ROOT/.agents/skills" 2>/dev/null; ls -1 "$ROOT/.claude/skills" 2>/dev/null ) | sort -u )

  while IFS= read -r skill; do
    [ -z "$skill" ] && continue
    verdict=$(jq -r --arg s "$skill" '.skills[$s].audit_verdict // "MISSING"' "$ALLOWLIST")
    case "$verdict" in
      approved|review_needed|approved_local_unlocked)
        : # ok
        ;;
      blocked)
        CRITICAL=$((CRITICAL+1))
        printf '\n[BLOCKED] %s — audit_verdict=blocked in allowlist\n' "$skill" >> "$REPORT_TMP"
        ;;
      MISSING)
        CRITICAL=$((CRITICAL+1))
        printf '\n[UNLISTED] %s — not in skills-allowlist.json (drift detected)\n' "$skill" >> "$REPORT_TMP"
        ;;
      *)
        CRITICAL=$((CRITICAL+1))
        printf '\n[INVALID] %s — unknown audit_verdict %s\n' "$skill" "$verdict" >> "$REPORT_TMP"
        ;;
    esac
  done <<< "$skill_names"
fi

# ---- Pass 5: subprocess-bypass coverage (MEH-422; skipped for self-test) ----
# Verifies skills that reference bash shell-out patterns (node tools/, python
# tools/, etc.) or import Python network libs declare their allowance via
# allowlist fields allowed_shell_invocations / allowed_network_hosts.
#
# Uses a state machine to distinguish fenced code blocks from prose:
#   - Match inside ``` fence  → real injection point, governed by allowlist
#   - Match in prose text     → documentation mention, informational only
#
# Field semantics (mirrored from .claude/rules/skills.md):
#   null/missing → no bypass declared. Match in code → CRITICAL.
#   []           → explicit no-bypass policy (e.g., dead pointer documented).
#                  Match in code → INFO (documented, not enforced).
#   ["*"]        → wildcard (user-controlled). Pass-through.
#   non-empty    → specific patterns approved. Pass-through (audit-time
#                  PASS; runtime defense is the hook).
if [ "$SELF_TEST" -eq 0 ]; then
  if [ ! -f "$ALLOWLIST" ]; then
    echo "[ERROR] $ALLOWLIST not found — cannot verify bypass coverage." >&2
    exit 2
  fi

  BYPASS_BASH_RE='tools/(clis|integrations|REGISTRY)|(node|python[23]?|bash|sh)[[:space:]]+[^[:space:]]*tools/'
  BYPASS_PY_RE='^[[:space:]]*(import[[:space:]]+(requests|urllib|socket|http\.client|aiohttp|httpx)|from[[:space:]]+(requests|urllib|http|aiohttp|httpx)[[:space:]]+import)'

  for skill_dir in "$ROOT/.agents/skills"/*/; do
    skill=$(basename "$skill_dir")

    # Scan markdown files (SKILL.md + references/*.md) with code-fence awareness.
    # Uses awk for speed — bash-loop-per-line is O(N) subshell spawns and
    # takes minutes across 200+ files. awk handles state in a single pass.
    md_in_code_hits=""
    while IFS= read -r mdfile; do
      [ -f "$mdfile" ] || continue
      rel="${mdfile#$ROOT/}"
      hits=$(awk -v rel="$rel" -v re="$BYPASS_BASH_RE" '
        /^[[:space:]]*```/ { in_code = 1 - in_code; next }
        in_code && $0 ~ re { printf "%s:%d: %s\n", rel, NR, $0 }
      ' "$mdfile")
      if [ -n "$hits" ]; then
        md_in_code_hits=$(printf '%s\n%s' "$md_in_code_hits" "$hits")
      fi
    done < <(find "$skill_dir" -type f -name '*.md' 2>/dev/null)

    # Scan Python scripts for network imports
    py_hits=""
    while IFS= read -r pyfile; do
      [ -f "$pyfile" ] || continue
      hits=$(grep -nE "$BYPASS_PY_RE" "$pyfile" 2>/dev/null || true)
      if [ -n "$hits" ]; then
        rel="${pyfile#$ROOT/}"
        py_hits=$(printf '%s\n--- %s ---\n%s' "$py_hits" "$rel" "$hits")
      fi
    done < <(find "$skill_dir" -type f -name '*.py' 2>/dev/null)

    # Look up declared fields. Use enum-style classification to avoid
    # tojson string-encoding (which wraps null as "null" — bug found
    # during Pass 5 self-test). NULL = unaudited; EMPTY = explicit
    # no-bypass; WILDCARD = user-controlled (`["*"]`); SPECIFIC = listed.
    classify_field='
      .skills[$s][$field] as $v |
      if $v == null then "NULL"
      elif ($v | type) != "array" then "INVALID"
      elif ($v | length) == 0 then "EMPTY"
      elif ($v | length) == 1 and $v[0] == "*" then "WILDCARD"
      else "SPECIFIC"
      end'
    shell_kind=$(jq -r --arg s "$skill" --arg field "allowed_shell_invocations" "$classify_field" "$ALLOWLIST" 2>/dev/null)
    net_kind=$(jq -r --arg s "$skill" --arg field "allowed_network_hosts" "$classify_field" "$ALLOWLIST" 2>/dev/null)

    # ---- Bash-bypass verdict ----
    if [ -n "$md_in_code_hits" ]; then
      case "$shell_kind" in
        NULL)
          CRITICAL=$((CRITICAL+1))
          {
            printf '\n[BYPASS-UNDECLARED] %s — bash shell-out pattern in code block but allowed_shell_invocations is null:' "$skill"
            printf '%s\n' "$md_in_code_hits"
            printf '  fix: add "allowed_shell_invocations" to skills-allowlist.json (use [] for dead-pointer policy).\n'
          } >> "$REPORT_TMP"
          ;;
        EMPTY)
          # Dead-pointer policy — info only
          {
            printf '\n[BYPASS-DEAD-POINTER] %s — bash shell-out in code block, allowed_shell_invocations=[] (preemptive block via hook):' "$skill"
            printf '%s\n' "$md_in_code_hits" | head -5
          } >> "$REPORT_TMP"
          ;;
        WILDCARD|SPECIFIC)
          : # pass-through (hook enforces at runtime; allowlist documents intent)
          ;;
        INVALID)
          CRITICAL=$((CRITICAL+1))
          printf '\n[BYPASS-INVALID] %s — allowed_shell_invocations is not an array.\n' "$skill" >> "$REPORT_TMP"
          ;;
      esac
    fi

    # ---- Python-network verdict ----
    if [ -n "$py_hits" ]; then
      case "$net_kind" in
        NULL)
          CRITICAL=$((CRITICAL+1))
          {
            printf '\n[NETWORK-UNDECLARED] %s — Python network import in script but allowed_network_hosts is null:' "$skill"
            printf '%s\n' "$py_hits"
            printf '  fix: add "allowed_network_hosts" to skills-allowlist.json.\n'
          } >> "$REPORT_TMP"
          ;;
        EMPTY)
          CRITICAL=$((CRITICAL+1))
          {
            printf '\n[NETWORK-FORBIDDEN] %s — Python network import but allowed_network_hosts=[] (no-network policy):' "$skill"
            printf '%s\n' "$py_hits"
          } >> "$REPORT_TMP"
          ;;
        WILDCARD|SPECIFIC)
          : # audit-time pass (hook + allowlist together)
          ;;
        INVALID)
          CRITICAL=$((CRITICAL+1))
          printf '\n[NETWORK-INVALID] %s — allowed_network_hosts is not an array.\n' "$skill" >> "$REPORT_TMP"
          ;;
      esac
    fi
  done
fi

# ---- Pass 4: hash enforcement (MEH-420; skipped for self-test) ----
# Verifies every skill in skills-lock.json matches the hash that
# compute-skill-hash.sh produces for its on-disk content. Closes the gap
# discovered in MEH-402 adversarial review where computedHash was a
# decorative metadata field that no script actually read.
if [ "$SELF_TEST" -eq 0 ]; then
  LOCK="$ROOT/skills-lock.json"
  COMPUTE="$ROOT/.claude/scripts/compute-skill-hash.sh"

  if [ ! -f "$LOCK" ]; then
    echo "[ERROR] $LOCK not found — cannot verify hash integrity." >&2
    exit 2
  fi

  if [ ! -f "$COMPUTE" ]; then
    echo "[ERROR] $COMPUTE not found — cannot verify hash integrity." >&2
    exit 2
  fi

  while IFS= read -r skill; do
    [ -z "$skill" ] && continue

    skill_dir="$ROOT/.agents/skills/$skill"

    if [ ! -d "$skill_dir" ]; then
      CRITICAL=$((CRITICAL+1))
      printf '\n[LOCK-DRIFT] %s — listed in skills-lock.json but directory missing on disk\n' "$skill" >> "$REPORT_TMP"
      continue
    fi

    expected=$(jq -r --arg s "$skill" '.skills[$s].computedHash // ""' "$LOCK")
    if ! actual=$(bash "$COMPUTE" "$skill_dir" 2>>"$REPORT_TMP"); then
      CRITICAL=$((CRITICAL+1))
      printf '\n[HASH-COMPUTE] %s — compute-skill-hash.sh failed (likely symlinks present in skill dir)\n' "$skill" >> "$REPORT_TMP"
      continue
    fi

    if [ "$expected" != "$actual" ]; then
      CRITICAL=$((CRITICAL+1))
      {
        printf '\n[HASH-DRIFT] %s — content drifted from skills-lock.json\n' "$skill"
        printf '  expected: %s\n' "$expected"
        printf '  actual:   %s\n' "$actual"
        printf '  fix:      bash .claude/scripts/backfill-skill-hashes.sh\n'
      } >> "$REPORT_TMP"
    fi
  done < <(jq -r '.skills | keys_unsorted[]' "$LOCK" | LC_ALL=C sort)
fi

# ---- Output ----
if [ -s "$REPORT_TMP" ]; then
  cat "$REPORT_TMP"
  echo ""
fi

echo "------------------------------------------------"
echo "Critical findings: $CRITICAL"
echo "Single-class warnings: $WARN"
echo "------------------------------------------------"

# ---- Pass 3: hook regression tests (self-test only) ----
# Replays adversarial-review bypass probes against the hooks. Manifest at
# .claude/scripts/test/fixtures/bypass-attempts/manifest.json. Each test has
# expected_exit + required=true|false. Required failures bump CRITICAL.
if [ "$SELF_TEST" -eq 1 ]; then
  BYPASS_DIR="$ROOT/.claude/scripts/test/fixtures/bypass-attempts"
  MANIFEST="$BYPASS_DIR/manifest.json"
  if [ -f "$MANIFEST" ]; then
    echo ""
    echo "------------------------------------------------"
    echo "Hook regression tests (manifest)"
    echo "------------------------------------------------"
    n=$(jq '.tests | length' "$MANIFEST")
    i=0
    while [ "$i" -lt "$n" ]; do
      name=$(jq -r ".tests[$i].name" "$MANIFEST")
      input_file=$(jq -r ".tests[$i].input_file" "$MANIFEST")
      hook=$(jq -r ".tests[$i].hook" "$MANIFEST")
      expected=$(jq -r ".tests[$i].expected_exit" "$MANIFEST")
      required=$(jq -r ".tests[$i].required" "$MANIFEST")
      cat "$BYPASS_DIR/$input_file" | bash "$ROOT/.claude/hooks/$hook" >/dev/null 2>&1
      actual=$?
      if [ "$actual" -eq "$expected" ]; then
        printf '  PASS  [%s] %s → exit %s\n' "$hook" "$name" "$actual"
      elif [ "$required" = "true" ]; then
        CRITICAL=$((CRITICAL+1))
        printf '  FAIL  [%s] %s → exit %s, expected %s (REQUIRED — bumps CRITICAL)\n' "$hook" "$name" "$actual" "$expected"
      else
        printf '  INFO  [%s] %s → exit %s, expected %s (informational, not enforced)\n' "$hook" "$name" "$actual" "$expected"
      fi
      i=$((i+1))
    done
    echo ""
  fi
fi

if [ "$CRITICAL" -gt 0 ]; then
  echo "FAIL: critical findings present — fix before merging."
  exit 1
fi

echo "PASS"
exit 0
