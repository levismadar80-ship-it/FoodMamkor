#!/usr/bin/env bash
# MEH-420 — recompute and persist skills-lock.json computedHash for all entries.
#
# Companion to compute-skill-hash.sh. Default mode rewrites the lock file
# atomically (tmp + jq validate + mv). --dry-run prints the diff and exits 1
# if any mismatch — this is what CI invokes to detect uncommitted drift.
#
# A skill listed in the lock but missing on disk is a fatal error in either
# mode (exit 1 with a clear message naming the skill) — never silently skip.
#
# Usage:
#   bash backfill-skill-hashes.sh             # rewrite lock; exit 0 on success
#   bash backfill-skill-hashes.sh --dry-run   # diff only; exit 1 if drift
#   bash backfill-skill-hashes.sh --verify    # alias for --dry-run
#
# Exit codes:
#   0 — all hashes match (dry-run) or successfully written (default)
#   1 — drift detected (dry-run) or missing skill on disk (either mode)
#   2 — invocation error (bad args, missing file, malformed JSON)

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
LOCK="$ROOT/skills-lock.json"
COMPUTE="$ROOT/.claude/scripts/compute-skill-hash.sh"

DRY_RUN=0
case "${1:-}" in
  --dry-run|--verify) DRY_RUN=1 ;;
  "") DRY_RUN=0 ;;
  *) echo "Usage: $0 [--dry-run|--verify]" >&2; exit 2 ;;
esac

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq not available — required for lock manipulation" >&2
  exit 2
fi

if [ ! -f "$LOCK" ]; then
  echo "ERROR: $LOCK not found" >&2
  exit 2
fi

if [ ! -f "$COMPUTE" ]; then
  echo "ERROR: $COMPUTE not found" >&2
  exit 2
fi

if ! jq empty "$LOCK" 2>/dev/null; then
  echo "ERROR: $LOCK is not valid JSON" >&2
  exit 2
fi

mismatches=0
missing=0
TMP=$(mktemp)
trap 'rm -f "$TMP" "$TMP.new"' EXIT

cp "$LOCK" "$TMP"

# Iterate sorted skill names so the resulting diff is deterministic
# regardless of jq output order.
while IFS= read -r skill; do
  [ -z "$skill" ] && continue

  skill_dir="$ROOT/.agents/skills/$skill"

  if [ ! -d "$skill_dir" ]; then
    echo "ERROR: $skill listed in skills-lock.json but directory missing: $skill_dir" >&2
    missing=$((missing+1))
    continue
  fi

  old_hash=$(jq -r --arg s "$skill" '.skills[$s].computedHash // ""' "$TMP")
  new_hash=$(bash "$COMPUTE" "$skill_dir")

  if [ "$old_hash" != "$new_hash" ]; then
    mismatches=$((mismatches+1))
    printf '%s: %s -> %s\n' "$skill" "${old_hash:-<empty>}" "$new_hash"

    if [ "$DRY_RUN" -eq 0 ]; then
      jq --arg s "$skill" --arg h "$new_hash" \
        '.skills[$s].computedHash = $h' "$TMP" > "$TMP.new"
      mv "$TMP.new" "$TMP"
    fi
  fi
done < <(jq -r '.skills | keys_unsorted[]' "$LOCK" | LC_ALL=C sort)

echo ""

# Missing-skill is fatal in both modes per MEH-420 acceptance A8
if [ "$missing" -gt 0 ]; then
  echo "FAIL: $missing skill(s) listed in lock but missing on disk."
  exit 1
fi

if [ "$DRY_RUN" -eq 1 ]; then
  if [ "$mismatches" -gt 0 ]; then
    echo "Drift detected: $mismatches mismatch(es). Run without --dry-run to fix."
    exit 1
  fi
  echo "All $(jq '.skills | length' "$LOCK") hashes match. No changes needed."
  exit 0
fi

# Write mode
if [ "$mismatches" -eq 0 ]; then
  echo "All hashes already match. No changes written."
  exit 0
fi

if ! jq empty "$TMP" 2>/dev/null; then
  echo "ERROR: refusing to write malformed JSON to $LOCK" >&2
  exit 2
fi

mv "$TMP" "$LOCK"
echo "Wrote $mismatches corrected hash(es) to $LOCK"
