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
