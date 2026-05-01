#!/usr/bin/env bash
# MEH-420 — deterministic SHA256 over a skill directory's tracked content.
#
# Hash algorithm (per-file digest, then digest-of-digests):
#   1. find all regular files under <skill_dir>, excluding noise
#      (.git/, __pycache__/, .DS_Store, *.pyc)
#   2. sort filenames byte-order (LC_ALL=C sort -z, NUL-delimited)
#   3. for each file: sha256( <relpath>\0 + content + \0 )
#   4. final hash: sha256 of the concatenated per-file digests
#
# Symlinks inside the skill dir are anomalous and fail-loud — symlinks
# bypass content hashing (find -type f excludes them) so allowing them
# silently would create a tampering blind spot. Upstream skills that
# legitimately need symlinks must be allowlisted explicitly.
#
# Usage:
#   bash compute-skill-hash.sh <skill_dir>
# Output: 64-char hex SHA256 to stdout
# Exit codes:
#   0 — success (hash on stdout)
#   1 — symlinks detected inside skill dir (security: fail-loud)
#   2 — invocation error (bad args, missing dir, missing tools)

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <skill_dir>" >&2
  exit 2
fi

SKILL_DIR="$1"

if [ ! -d "$SKILL_DIR" ]; then
  echo "ERROR: not a directory: $SKILL_DIR" >&2
  exit 2
fi

if ! command -v sha256sum >/dev/null 2>&1; then
  echo "ERROR: sha256sum not available" >&2
  exit 2
fi

# Symlink hardening: any symlink inside the skill dir blocks hashing.
# find -type f does not follow symlinks (so they wouldn't be hashed),
# which means an attacker could swap a real file for a symlink to
# /etc/passwd and hide it from the hash. Fail-loud closes that gap.
if find "$SKILL_DIR" -type l 2>/dev/null | grep -q .; then
  echo "ERROR: symlinks detected in $SKILL_DIR — allowlist or remove before locking." >&2
  find "$SKILL_DIR" -type l >&2
  exit 1
fi

cd "$SKILL_DIR"

find . -type f \
  -not -path './.git/*' \
  -not -path '*/__pycache__/*' \
  -not -name '.DS_Store' \
  -not -name '*.pyc' \
  -print0 \
| LC_ALL=C sort -z \
| while IFS= read -r -d '' f; do
    { printf '%s\0' "$f"; cat "$f"; printf '\0'; } | sha256sum | awk '{print $1}'
  done \
| sha256sum | awk '{print $1}'
