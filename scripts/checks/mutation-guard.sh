#!/usr/bin/env bash
#
# Module:   mutation-guard.sh
# Purpose:  A PR that changes a money-or-permissions file (the [tool.mutmut]
#           only_mutate list in backend/pyproject.toml) must show a mutation
#           run in its body: a «## Mutation» section with the lines that
#           scripts/mutation/run.sh printed, or «Mutation: n/a — <reason>».
# Touches:  nothing — reads the PR event and git diff.
# Does NOT: run mutmut (an hour on 4 cores — too slow for a PR job; the PR's
#           thread runs it, and the weekly repo-health scan re-runs the whole
#           set every Thursday and opens a Linear card per new survivor).
# Related:  scripts/mutation/run.sh, scripts/checks/big-sites-guard.sh (same
#           PR-body pattern), .claude/rules/testing.md «Tests that pass for
#           the wrong reason».
# History:  MEH-3295 (creation). WARN-ONLY: a PR body edited after the run
#           does not re-run this job, so blocking would strand a fixed PR.
set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

critical_files() {
  # The paths in [tool.mutmut] only_mutate, prefixed backend/.
  python3 -I - <<'PY'
import tomllib
with open("backend/pyproject.toml", "rb") as f:
    paths = tomllib.load(f)["tool"]["mutmut"]["only_mutate"]
for p in paths:
    print("backend/" + p)
PY
}

pr_body() {
  if [ -n "${MUTATION_PR_BODY+x}" ]; then printf '%s\n' "$MUTATION_PR_BODY"; return 0; fi
  local ev="${GITHUB_EVENT_PATH:-}"
  [ -n "$ev" ] && [ -r "$ev" ] || return 1
  python3 -c '
import json, sys
pr = json.load(open(sys.argv[1], encoding="utf-8")).get("pull_request")
if pr is None: sys.exit(1)
print(pr.get("body") or "")
' "$ev" 2>/dev/null
}

changed_files() {
  if [ -n "${MUTATION_CHANGED+x}" ]; then printf '%s\n' "$MUTATION_CHANGED"; return 0; fi
  [ -n "${GITHUB_BASE_REF:-}" ] || return 1
  git fetch --no-tags --quiet --depth=100 origin "$GITHUB_BASE_REF" 2>/dev/null || true
  git fetch --no-tags --quiet --deepen=100 2>/dev/null || true
  git diff --name-only "origin/$GITHUB_BASE_REF...HEAD" 2>/dev/null
}

if ! crit="$(critical_files)" || [ -z "$crit" ]; then
  echo "mutation-guard: WARNING — could not read [tool.mutmut] only_mutate from backend/pyproject.toml; nothing was checked"
  exit 0
fi
if ! body="$(pr_body)"; then
  echo "mutation-guard: skipped — not a pull request (no PR body to read)"
  exit 0
fi
if ! files="$(changed_files)"; then
  echo "mutation-guard: skipped — no base branch to diff against"
  exit 0
fi
hit=""
while IFS= read -r f; do
  [ -n "$f" ] && grep -qxF "$f" <<<"$crit" && { hit="$f"; break; }
done <<<"$files"
if [ -z "$hit" ]; then
  echo "mutation-guard: OK — no money-or-permissions file changed"
elif grep -qiE '^##[[:space:]]+Mutation[[:space:]]*$|^Mutation:[[:space:]]*n/a' <<<"$body"; then
  echo "mutation-guard: OK — PR body has the Mutation section"
else
  echo "mutation-guard: WARNING — $hit is in the mutation set, and the PR body has no «## Mutation» section (paste what bash scripts/mutation/run.sh printed) or «Mutation: n/a — <reason>» line (testing.md, MEH-3295)"
fi
exit 0
