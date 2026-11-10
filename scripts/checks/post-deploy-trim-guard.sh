#!/usr/bin/env bash
# Module:   post-deploy-trim-guard.sh
# Purpose:  MEH-2864 («ייעול הבדיקות») — keep the two helpers the post-deploy
#           workflow leans on honest:
#             scripts/frontend-touched.sh   — decides "skip the live checks",
#                                             must fail SAFE (unknown → touched)
#             scripts/checks/vercel_count.py — what «requests to Vercel: N»
#                                             counts
#           Runs both self-tests and requires every case to have run and
#           passed; a self-test that printed nothing is a FAIL, not a pass.
# History:  MEH-2864 (creation). No network.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

out_t="$(bash scripts/frontend-touched.sh --self-test 2>&1)"; code_t=$?
out_v="$(python3 scripts/checks/vercel_count.py 2>&1)"; code_v=$?
pass_t="$(printf '%s\n' "$out_t" | grep -c '^PASS' || true)"
pass_v="$(printf '%s\n' "$out_v" | grep -c '^PASS' || true)"
fail_n="$(printf '%s\n%s\n' "$out_t" "$out_v" | grep -c '^FAIL' || true)"

if [ "$code_t" -ne 0 ] || [ "$code_v" -ne 0 ] || [ "$fail_n" -ne 0 ] || [ "$pass_t" -lt 7 ] || [ "$pass_v" -lt 6 ]; then
  printf '%s\n%s\n' "$out_t" "$out_v" | grep -v '^PASS'
  echo "FAIL post-deploy-trim-guard: frontend-touched exit=$code_t ($pass_t/7 passed), vercel_count exit=$code_v ($pass_v/6 passed)"
  exit 1
fi
echo "post-deploy-trim-guard: frontend-touched $pass_t/7, vercel_count $pass_v/6 self-test cases passed"
