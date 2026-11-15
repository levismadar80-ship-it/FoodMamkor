#!/usr/bin/env bash
# Module:   vercel-ignore-build.sh
# Purpose:  MEH-3094 — Vercel's Ignored Build Step for the `staging` branch.
#           On the Pro plan Vercel bills build CPU minutes, and about a third
#           of staging pushes change nothing that ships (docs, CHANGELOG,
#           HANDOFF, tests). This skips those builds.
#           The rule is the SAME one post-deploy-checks.yml uses to decide
#           whether to wait for a new build (scripts/frontend-touched.sh,
#           MEH-2864), so the two never disagree about whether a push ships.
# Called:   from frontend/vercel.json `ignoreCommand`, only for `staging`
#           (main always builds; feature branches build only on `[preview]`).
#           Vercel runs it from the Root Directory (frontend/).
# Exit:     Vercel's contract — 0 = SKIP the build, anything else = BUILD.
#           Exit 0 only on an explicit `touched=false`. Everything else
#           (no previous sha, a sha missing from Vercel's shallow clone, a
#           missing helper, a git error) builds. A wrong build costs cents; a
#           wrong skip leaves staging serving old code.
# Usage:    scripts/vercel-ignore-build.sh                 (reads Vercel env)
#           scripts/vercel-ignore-build.sh --self-test
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
TOUCHED="$HERE/frontend-touched.sh"

decide() { # <before> <after> → exit code per Vercel's contract
  local out
  if [ ! -f "$TOUCHED" ]; then
    echo "build: $TOUCHED not found — building (fail safe)"; return 1
  fi
  out=$(GITHUB_OUTPUT='' bash "$TOUCHED" "${1:-}" "${2:-}" 2>&1)
  echo "$out"
  case "$out" in
    touched=false*) echo "skip: nothing that ships changed since the last staging build (MEH-3094)"; return 0 ;;
    *) echo "build"; return 1 ;;
  esac
}

self_test() {
  local dir bad=0 base docs fe got
  dir=$(mktemp -d)
  trap 'rm -rf -- "$dir"' RETURN
  (
    cd "$dir" && git init -q . && git config user.email t@t && git config user.name t
    mkdir -p frontend docs && echo a > frontend/a.js && echo a > docs/a.md
    git add . && git commit -qm base
  ) || return 1
  base=$(git -C "$dir" rev-parse HEAD)
  echo b > "$dir/docs/a.md"; git -C "$dir" commit -qam docs; docs=$(git -C "$dir" rev-parse HEAD)
  echo b > "$dir/frontend/a.js"; git -C "$dir" commit -qam fe; fe=$(git -C "$dir" rev-parse HEAD)
  check() { # name want-exit before after
    (cd "$dir/frontend" && decide "$3" "$4" >/dev/null); got=$?
    if [ "$got" = "$2" ]; then echo "PASS  self-test: $1"; else echo "FAIL  self-test: $1 (exit $got, want $2)"; bad=$((bad + 1)); fi
  }
  check "docs-only push → skip (0)" 0 "$base" "$docs"
  check "frontend push → build (1) (control: the same repo CAN say build)" 1 "$docs" "$fe"
  check "no previous sha (first build) → build" 1 "" "$fe"
  check "previous sha not in the shallow clone → build" 1 1234567890123456789012345678901234567890 "$fe"
  return "$bad"
}

if [ "${1:-}" = "--self-test" ]; then self_test; exit $?; fi
decide "${VERCEL_GIT_PREVIOUS_SHA:-}" "${VERCEL_GIT_COMMIT_SHA:-}"
