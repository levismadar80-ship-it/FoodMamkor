#!/usr/bin/env bash
#
# Module:   typed-new-modules.sh
# Purpose:  New code is type-checked from its first commit, so an AI agent gets
#           a red on a wrong type instead of a runtime bug.
#           (1) every backend/app/**/*.py not in the frozen legacy list must be
#               listed in [tool.mypy].files (backend/pyproject.toml) — the
#               backend-mypy ratchet then holds it to --strict;
#           (2) every frontend source .js/.jsx not in the frozen legacy list
#               must carry `// @ts-check` in its first 5 lines — the vitest
#               test frontend/__tests__/ts-check-files.test.js then type-checks it.
# Touches:  nothing — reads tracked files, prints file:line, exits 0/1.
# Does NOT: ask anyone to type legacy files, convert JS to TypeScript, or
#           check tests, e2e, generated or config files.
# Related:  scripts/checks/typed-new-modules-baseline.txt,
#           backend/scripts/mypy_baseline.py, .claude/rules/code-execution.md §17.
# History:  13/11/2026 — created (AI-friendliness review).
#
# Escape hatch: `guard-ok: <reason>` in the first 3 lines of the file.
# CONTROL: refuses to pass when it listed fewer than 100 files of either kind.

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

BASELINE="scripts/checks/typed-new-modules-baseline.txt"
PYPROJECT="backend/pyproject.toml"
[ -f "$BASELINE" ] || { echo "$BASELINE:1: baseline missing"; exit 1; }

py_files() { git ls-files 'backend/app/*.py' | grep -v '/__init__\.py$' || true; }
js_files() {
  git ls-files 'frontend/app/*' 'frontend/components/*' 'frontend/lib/*' \
    | grep -E '\.(js|jsx)$' \
    | grep -vE '(^|/)(__tests__|e2e)/|\.test\.|\.spec\.|^frontend/lib/generated/|\.config\.' || true
}

# [tool.mypy] files = [...] — paths relative to backend/
typed="$(awk '/^\[tool\.mypy\]/{m=1;next} /^\[/{m=0} m && /^files *=/{print}' "$PYPROJECT" | grep -oE '"[^"]+"' | tr -d '"' | sed 's#^#backend/#')"

fail=0; npy=0; njs=0
while IFS= read -r f; do
  [ -n "$f" ] || continue; npy=$((npy + 1))
  grep -qxF "$f" "$BASELINE" && continue
  grep -qxF "$f" <<<"$typed" && continue
  sed -n '1,3p' "$f" | grep -q 'guard-ok:' && continue
  echo "$f:1: new backend module is not type-checked — add \"${f#backend/}\" to [tool.mypy].files in $PYPROJECT"
  fail=1
done < <(py_files)

while IFS= read -r f; do
  [ -n "$f" ] || continue; njs=$((njs + 1))
  grep -qxF "$f" "$BASELINE" && continue
  sed -n '1,5p' "$f" | grep -qx '[[:space:]]*// @ts-check[[:space:]]*' && continue
  sed -n '1,3p' "$f" | grep -q 'guard-ok:' && continue
  echo "$f:1: new frontend file has no \`// @ts-check\` — add it as the first line of the file"
  fail=1
done < <(js_files)

if [ "$npy" -lt 100 ] || [ "$njs" -lt 100 ]; then
  echo "typed-new-modules: listed $npy .py and $njs .js/.jsx files — the listing is broken, every pass is void"; exit 1
fi
[ "$fail" -eq 0 ] && echo "typed-new-modules: $npy backend + $njs frontend files, every new one type-checked"
exit "$fail"
