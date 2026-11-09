#!/usr/bin/env bash
#
# link-check-budget-guard.sh — runs `node scripts/link-check.mjs --self-test`
# so the crawler's page budget (MEH-2864) is checked on every PR.
#
# WHY THIS EXISTS
#   The post-deploy workflow crawls the site after every push to staging and
#   main. Until MEH-2864 that crawl had one 2000-page cap for every target, and
#   on staging — ~30 self-merges a day — it is the main suspect for the Vercel
#   Hobby team crossing its Fluid Active CPU limit and being suspended on 09/11,
#   production included. The fix is a page budget inside link-check.mjs: a
#   staging target gets a 40-page sample. A budget that silently drifts back to
#   the full crawl costs real money and a real outage, and nothing in the
#   post-deploy run itself would fail — so the self-test runs here, where a PR
#   that breaks it goes red before it merges.
#
# WHAT THE SELF-TEST COVERS (the cases live in link-check.mjs)
#   - staging target (IS_PRODUCTION=false, or the staging host) → 40 pages
#   - production and a local `next start` → full crawl
#   - --max-pages=N override, and a malformed flag is an error
#   - anchored to .github/workflows/post-deploy-checks.yml: every host its
#     BASE_URL can crawl resolves to the right mode
#   - the robots.txt resolver cases it already had (MEH-1963/1970)
#
# Not a crawl: no network, no server, < 1 s.
# Related: scripts/link-check.mjs · .github/workflows/post-deploy-checks.yml ·
#          scripts/link-check.sh (the local full-crawl wrapper).
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "FAIL link-check-budget-guard: node is not on PATH, so the self-test could not run (this is not a pass)."
  exit 1
fi

out="$(node scripts/link-check.mjs --self-test 2>&1)"
code=$?
fails="$(printf '%s\n' "$out" | grep -c '^FAIL' || true)"
passes="$(printf '%s\n' "$out" | grep -c '^PASS' || true)"

# A self-test that printed nothing would also exit 0 if the dispatch ever broke;
# require that it actually ran its budget cases.
budget_cases="$(printf '%s\n' "$out" | grep -c '^PASS  self-test: budget:' || true)"

if [ "$code" -ne 0 ] || [ "$fails" -ne 0 ] || [ "$budget_cases" -lt 6 ]; then
  printf '%s\n' "$out" | grep -v '^PASS'
  echo "FAIL link-check-budget-guard: exit=$code, $fails failing case(s), $budget_cases/6 budget case(s) passed — scripts/link-check.mjs"
  exit 1
fi
echo "link-check-budget-guard: $passes self-test case(s) passed, $budget_cases of them on the page budget"
