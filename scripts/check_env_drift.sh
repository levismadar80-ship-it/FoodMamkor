#!/usr/bin/env bash
# scripts/check_env_drift.sh — env var drift gate (MEH-491)
#
# BLOCKS PRs that read an env var the code uses but no .env.example
# documents. WARNS on the reverse (var documented but not read) so dead
# entries get cleaned up without blocking unrelated work.
#
# Sources scanned:
#   - backend/app/**/*.py + backend/scripts/**/*.py — `os.getenv("X")`,
#     `os.environ["X"]`, `os.environ.get("X")`, plus pydantic-settings
#     fields in backend/app/config.py (lowercase field names → UPPERCASE
#     env names per pydantic-settings convention).
#   - frontend/**/*.{js,jsx,ts,tsx,mjs,cjs} — `process.env.X`.
#
# Documented set = union of:
#   - .env.example (root, docker-compose)
#   - backend/.env.example (Railway service vars)
#   - frontend/.env.example (Vercel env vars)
#
# Skipped:
#   - test files (tests/, test_*.py, *.test.{js,ts,tsx})
#   - dynamically-keyed access (os.getenv(some_var)) — regex requires
#     a literal quoted UPPERCASE name; computed keys silently ignored
#   - SYSTEM_EXCLUDE list — runtime/platform vars (CI, NODE_ENV, etc.)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Platform / runtime vars set by Vercel / Railway / GitHub Actions / Next.js
# itself — not user-provided app config, so excluded from the gate.
SYSTEM_EXCLUDE_RE='^(CI|NODE_ENV|NEXT_RUNTIME|VERCEL_ENV|VERCEL_BYPASS_SECRET|VERCEL_URL|RAILWAY_GIT_COMMIT_SHA|SKIP_ENV_VALIDATION|TEST_URL|PATH|HOME|USER|PYTHONPATH)$'

# ─── 1. Backend code vars ───────────────────────────────────────────────────
# os.getenv("X") / os.environ["X"] / os.environ.get("X")
backend_runtime=$(
  grep -rEho 'os\.(getenv|environ\.get)\(['\''"]([A-Z_][A-Z0-9_]+)' \
    backend/app backend/scripts backend/seed_data.py 2>/dev/null \
    | grep -oE '[A-Z_][A-Z0-9_]+' || true
)
backend_subscript=$(
  grep -rEho 'os\.environ\[['\''"]([A-Z_][A-Z0-9_]+)' \
    backend/app backend/scripts backend/seed_data.py 2>/dev/null \
    | grep -oE '[A-Z_][A-Z0-9_]+' || true
)
# pydantic-settings: 4-space indented lowercase field names in
# backend/app/config.py map to UPPERCASE env vars.
backend_settings=$(
  grep -E '^    [a-z_][a-z0-9_]+:' backend/app/config.py 2>/dev/null \
    | sed -E 's/^    ([a-z_][a-z0-9_]+):.*/\1/' \
    | tr '[:lower:]' '[:upper:]' || true
)

backend_code=$(
  printf '%s\n%s\n%s\n' "$backend_runtime" "$backend_subscript" "$backend_settings" \
    | grep -v '^$' | grep -vE "$SYSTEM_EXCLUDE_RE" | sort -u
)

# ─── 2. Frontend code vars ──────────────────────────────────────────────────
frontend_code=$(
  grep -rEho 'process\.env\.([A-Z_][A-Z0-9_]+)' \
    --include='*.js' --include='*.jsx' --include='*.ts' --include='*.tsx' \
    --include='*.mjs' --include='*.cjs' \
    --exclude-dir='node_modules' --exclude-dir='.next' \
    --exclude='*.test.*' \
    frontend 2>/dev/null \
    | grep -oE '[A-Z_][A-Z0-9_]+' \
    | grep -vE "$SYSTEM_EXCLUDE_RE" \
    | sort -u || true
)

# ─── 3. Documented vars (union of all .env.example) ────────────────────────
documented=$(
  grep -hE '^[A-Z_][A-Z0-9_]+=' \
    .env.example backend/.env.example frontend/.env.example 2>/dev/null \
    | sed 's/=.*//' \
    | sort -u || true
)

# ─── 4. Compute drift ──────────────────────────────────────────────────────
all_code=$(printf '%s\n%s\n' "$backend_code" "$frontend_code" | grep -v '^$' | sort -u)
missing=$(comm -23 <(printf '%s\n' "$all_code") <(printf '%s\n' "$documented") || true)
unused=$(comm -13 <(printf '%s\n' "$all_code") <(printf '%s\n' "$documented") || true)

# ─── 5. Report ─────────────────────────────────────────────────────────────
report=$(
  echo "## env drift report (MEH-491)"
  echo ""
  echo "- vars used in code: $(echo "$all_code" | grep -c .)"
  echo "- vars documented in .env.example files: $(echo "$documented" | grep -c .)"
  echo ""
  if [ -n "$missing" ]; then
    echo "### ❌ BLOCK — used in code but NOT in any .env.example"
    echo ""
    echo "$missing" | sed 's/^/- /'
    echo ""
  else
    echo "### ✅ no missing vars (all code reads are documented)"
    echo ""
  fi
  if [ -n "$unused" ]; then
    echo "### ⚠️  WARN — documented in .env.example but NOT read in code"
    echo ""
    echo "$unused" | sed 's/^/- /'
    echo ""
  fi
)

echo "$report"

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  echo "$report" >> "$GITHUB_STEP_SUMMARY"
fi

[ -z "$missing" ]
