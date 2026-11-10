#!/usr/bin/env bash
# Module:   frontend-touched.sh
# Purpose:  MEH-2864 («ייעול הבדיקות», item 3) — decide whether a push changed
#           anything the post-deploy checks look at, so they skip the live site
#           (Vercel requests) when it cannot have changed. Most pushes to
#           staging are docs (CHANGELOG/HANDOFF).
#           Counted: frontend/ (minus e2e/ and __tests__/), backend/ (the
#           production smoke and the health URL check the backend — fresh
#           review on #4253), and the checks themselves (scripts/checks/,
#           scripts/link-check.mjs, the workflow file), so a change to a check
#           runs it.
# Usage:    scripts/frontend-touched.sh <before-sha> <after-sha>
#           scripts/frontend-touched.sh --self-test
# Output:   prints one line `touched=true|false — <reason>` and, under GitHub
#           Actions, appends `touched=true|false` to $GITHUB_OUTPUT.
# Exit:     always 0 on a decision (the answer is the output, not the code);
#           1 only on a usage error or a failed self-test.
# FAILS SAFE: anything it cannot decide — no before-sha, the all-zero sha of a
#           new branch, a before-sha not in this clone (shallow checkout), a
#           git error — answers touched=true. A missed skip costs a few
#           requests; a wrong skip hides a broken deploy.
# Lives at scripts/, not scripts/checks/: run-all.sh auto-discovers that
#           folder, and this is a tool the workflow calls, not a repo guard.
set -uo pipefail
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
# Pathspecs are relative to the cwd: run from the repo root, wherever called from.
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)" || exit 1

DEPLOYABLE=(frontend/ backend/ scripts/checks/ scripts/link-check.mjs .github/workflows/post-deploy-checks.yml
  ':(exclude)frontend/e2e' ':(exclude)frontend/__tests__')

decide() {
  local before="$1" after="$2" files
  if [ -z "$before" ] || [ -z "$after" ]; then
    echo "true|missing sha — checking anyway"; return
  fi
  if [ "$before" = "0000000000000000000000000000000000000000" ]; then
    echo "true|new branch (no before-sha) — checking anyway"; return
  fi
  if ! git cat-file -e "${before}^{commit}" 2>/dev/null || ! git cat-file -e "${after}^{commit}" 2>/dev/null; then
    echo "true|commit not in this clone (shallow?) — checking anyway"; return
  fi
  # Frontend tests ship nothing to the live site: a push that only changes
  # specs or unit tests cannot have broken it.
  if ! files=$(git diff --name-only "$before" "$after" -- "${DEPLOYABLE[@]}" 2>/dev/null); then
    echo "true|git diff failed — checking anyway"; return
  fi
  if [ -n "$files" ]; then
    echo "true|$(printf '%s\n' "$files" | wc -l | tr -d ' ') checked file(s) changed (frontend/, backend/ or the checks)"
  else
    echo "false|nothing under frontend/, backend/ or the checks changed between ${before:0:9} and ${after:0:9} (frontend tests excluded)"
  fi
}

report() {
  local verdict="${1%%|*}" reason="${1#*|}"
  echo "touched=${verdict} — ${reason}"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "touched=${verdict}" >> "$GITHUB_OUTPUT"; fi
}

self_test() {
  local dir bad=0 base docs tests fe be got
  dir=$(mktemp -d)
  trap 'rm -rf -- "$dir"' RETURN
  (
    cd "$dir" || exit 1
    git init -q . && git config user.email t@t && git config user.name t
    mkdir -p frontend/e2e frontend/__tests__ docs && echo a > frontend/a.js && echo a > docs/a.md
    echo a > frontend/e2e/a.spec.ts && echo a > frontend/__tests__/a.test.js
    git add . && git commit -qm base
  ) || return 1
  base=$(git -C "$dir" rev-parse HEAD)
  echo b > "$dir/docs/a.md"; git -C "$dir" commit -qam docs; docs=$(git -C "$dir" rev-parse HEAD)
  echo b > "$dir/frontend/e2e/a.spec.ts"; echo b > "$dir/frontend/__tests__/a.test.js"
  git -C "$dir" commit -qam tests; tests=$(git -C "$dir" rev-parse HEAD)
  echo b > "$dir/frontend/a.js"; git -C "$dir" commit -qam fe; fe=$(git -C "$dir" rev-parse HEAD)
  check() { # name want before after [sub]
    if [ "${5:-}" = sub ]; then
      got=$(cd "$dir/frontend" && bash "$SELF" "$3" "$4"); got="${got#touched=}"; got="${got%% *}"
    else
      got=$(cd "$dir" && decide "$3" "$4"); got="${got%%|*}"
    fi
    if [ "$got" = "$2" ]; then echo "PASS  self-test: $1"; else echo "FAIL  self-test: $1 (got $got, want $2)"; bad=$((bad + 1)); fi
  }
  check "docs-only push → false" false "$base" "$docs"
  check "tests-only push (e2e + __tests__) → false" false "$docs" "$tests"
  check "frontend push → true (control: the same repo CAN say true)" true "$tests" "$fe"
  mkdir -p "$dir/backend"; echo a > "$dir/backend/x.py"; git -C "$dir" add . && git -C "$dir" commit -qm be; be=$(git -C "$dir" rev-parse HEAD)
  check "backend push → true (the smoke checks the backend too)" true "$fe" "$be"
  check "run from a subfolder → same answer as from the root" true "$tests" "$fe" sub
  check "range spanning both → true" true "$base" "$fe"
  check "new branch (all-zero before) → true" true 0000000000000000000000000000000000000000 "$fe"
  check "before-sha not in the clone → true" true 1234567890123456789012345678901234567890 "$fe"
  check "missing before → true" true "" "$fe"
  return "$bad"
}

if [ "$#" -eq 0 ]; then echo "usage: $0 <before-sha> <after-sha> | --self-test" >&2; exit 1; fi
case "$1" in
  --self-test) self_test; exit $? ;;
  # An empty before-sha (an expression that resolved to nothing) is a decision,
  # not a usage error: decide() answers touched=true — fail safe.
  *) report "$(decide "$1" "${2:-}")"; exit 0 ;;
esac
