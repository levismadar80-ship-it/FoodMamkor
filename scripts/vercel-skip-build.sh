#!/usr/bin/env bash
# MEH-494: Vercel ignoreCommand — skip preview builds when no frontend
# files changed.
#
# Exit 0 → skip build (Vercel convention). Exit 1 → proceed with build.
# Vercel injects VERCEL_GIT_PREVIOUS_SHA + VERCEL_GIT_COMMIT_SHA per
# https://vercel.com/docs/projects/project-configuration#ignorecommand
#
# Skip-eligible paths (don't affect the Next.js build):
#   docs/  HANDOFF.md  CHANGELOG.md (top-level + docs/)  README.md
#   .github/  backend/
#
# Anything else (frontend/, package.json at root, vercel.json itself,
# config files at root) → build.
set -euo pipefail

prev="${VERCEL_GIT_PREVIOUS_SHA:-}"
curr="${VERCEL_GIT_COMMIT_SHA:-HEAD}"

if [ -z "$prev" ]; then
  echo "vercel-skip-build: no previous SHA — building (first deploy or unknown base)."
  exit 1
fi

changed="$(git diff --name-only "$prev" "$curr" 2>/dev/null || true)"
if [ -z "$changed" ]; then
  echo "vercel-skip-build: empty diff between $prev and $curr — skipping."
  exit 0
fi

skip_re='^(docs/|HANDOFF\.md$|CHANGELOG\.md$|README\.md$|\.github/|backend/)'
non_skip="$(printf '%s\n' "$changed" | grep -Ev "$skip_re" || true)"

if [ -z "$non_skip" ]; then
  echo "vercel-skip-build: docs/backend-only commit — skipping preview build."
  printf '%s\n' "$changed" | sed 's/^/  /'
  exit 0
fi

echo "vercel-skip-build: frontend/shared changes detected — building."
printf '%s\n' "$non_skip" | sed 's/^/  /'
exit 1
