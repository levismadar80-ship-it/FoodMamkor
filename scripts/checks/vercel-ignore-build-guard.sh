#!/usr/bin/env bash
# Module:   vercel-ignore-build-guard.sh
# Purpose:  MEH-3094 — keep the staging build-skip honest. Two checks:
#           1. frontend/vercel.json's ignoreCommand still builds `main`
#              unconditionally and hands `staging` to
#              scripts/vercel-ignore-build.sh (a removed hand-off silently
#              brings back a paid build per docs push; a removed `main` case
#              could skip a production build).
#           2. scripts/vercel-ignore-build.sh --self-test: every case ran and
#              passed. A self-test that printed nothing is a FAIL.
# History:  MEH-3094 (creation). No network.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

EXPECTED_CASES=4
cmd="$(python3 -c "import json;print(json.load(open('frontend/vercel.json'))['ignoreCommand'])" 2>&1)" || {
  echo "FAIL vercel-ignore-build-guard: cannot read ignoreCommand from frontend/vercel.json: $cmd"; exit 1; }

bad=0
case "$cmd" in
  *'in main) exit 1 ;;'*) ;;
  *) echo "FAIL vercel-ignore-build-guard: ignoreCommand no longer builds main unconditionally"; bad=1 ;;
esac
case "$cmd" in
  *'staging) bash ../scripts/vercel-ignore-build.sh; exit $? ;;'*) ;;
  *) echo "FAIL vercel-ignore-build-guard: ignoreCommand no longer hands staging to scripts/vercel-ignore-build.sh"; bad=1 ;;
esac

# Vercel rejects the whole vercel.json above 256 chars — every deploy, main
# included, fails with a schema error (measured on PR #4446's first push).
MAX_LEN=256
if [ "${#cmd}" -gt "$MAX_LEN" ]; then
  echo "FAIL vercel-ignore-build-guard: ignoreCommand is ${#cmd} chars; Vercel's limit is $MAX_LEN"; bad=1
fi

# Run the REAL string the way Vercel does (sh -c, cwd = frontend/), so a wrong
# relative path or a swallowed exit code goes red here, not silently on Vercel.
head_sha="$(git rev-parse HEAD)"
run() { # name want ref message prev
  local got
  (cd frontend && env VERCEL_GIT_COMMIT_REF="$3" VERCEL_GIT_COMMIT_MESSAGE="$4" \
    VERCEL_GIT_PREVIOUS_SHA="$5" VERCEL_GIT_COMMIT_SHA="$head_sha" sh -c "$cmd" >/dev/null 2>&1)
  got=$?
  if [ "$got" != "$2" ]; then echo "FAIL vercel-ignore-build-guard: $1 → exit $got, want $2"; bad=1; fi
}
run "main → build" 1 main "x" ""
run "staging, no previous sha → build" 1 staging "x" ""
run "staging, nothing changed since previous build → skip" 0 staging "x" "$head_sha"
run "feature with [preview] → build" 1 feature/x "x [preview]" ""
run "feature without [preview] → skip" 0 feature/x "x" ""

out="$(bash scripts/vercel-ignore-build.sh --self-test 2>&1)"; code=$?
pass="$(printf '%s\n' "$out" | grep -c '^PASS' || true)"
if [ "$code" -ne 0 ] || [ "$pass" -lt "$EXPECTED_CASES" ]; then
  printf '%s\n' "$out" | grep -v '^PASS'
  echo "FAIL vercel-ignore-build-guard: self-test exit=$code ($pass/$EXPECTED_CASES passed)"
  bad=1
fi
[ "$bad" -eq 0 ] && echo "vercel-ignore-build-guard: ignoreCommand wiring OK, self-test $pass/$EXPECTED_CASES passed"
exit "$bad"
