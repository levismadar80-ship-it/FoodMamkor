#!/usr/bin/env bash
# check.sh — Mehamakor Definition-of-Done self-check (MEH-1052).
#
# One executable that encodes the manual DoD (CLAUDE.md → PR approval guide +
# .claude/rules/testing.md) so a /goal loop can self-verify with a single exit
# code before declaring itself done.
#
# Output contract:
#   exit 0  → every check passed (clean staging)
#   exit 1  → one or more checks failed; each failure is named on stderr and
#             re-listed in the FAILED summary
#
# Design locks:
#   - Bash only. No new deps. No network. Each gate REUSES the repo's existing
#     guard rather than reimplementing it (MEH-271: two parallel mechanisms
#     owning one job is forbidden):
#       * RTL physical-props → .claude/scripts/rtl-scan.sh
#       * en.json key parity → frontend/__tests__/en-parity-guard.test.js (MEH-978)
#   - Heavy gates (build / vitest / pytest) assume the standard dev toolchain
#     is already installed (node_modules present, backend venv + test Postgres
#     reachable) — exactly the assumptions the CI/DoD commands themselves make.
#     A missing toolchain is reported as a named FAIL, never auto-installed
#     (that would need network).
#
# History: MEH-1052 (2026-07-09).
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

FAILURES=()
pass() { printf '  PASS  %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1" >&2; FAILURES+=("$1"); }
section() { printf '\n== %s\n' "$1"; }

# Pick the backend python: prefer the project venv (matches CI), fall back to
# whatever `python -m pytest` resolves to.
if [ -x "$ROOT/backend/.venv/bin/python" ]; then
  PY="$ROOT/backend/.venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  PY="python3"
else
  PY="python"
fi

# ── 1. Frontend build ──────────────────────────────────────────────────────
section "1/7 Frontend build (npm run build)"
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  fail "frontend build — node_modules missing (run 'npm ci' in frontend/)"
elif ( cd "$ROOT/frontend" && npm run build ) >/tmp/dod-build.log 2>&1; then
  pass "frontend build"
else
  fail "frontend build (see /tmp/dod-build.log)"
fi

# ── 2. Frontend unit tests (vitest, full suite) ────────────────────────────
section "2/7 Frontend unit tests (vitest)"
if [ ! -x "$ROOT/frontend/node_modules/.bin/vitest" ]; then
  fail "vitest — not installed (run 'npm ci' in frontend/)"
elif ( cd "$ROOT/frontend" && ./node_modules/.bin/vitest run ) >/tmp/dod-vitest.log 2>&1; then
  pass "vitest unit suite"
else
  fail "vitest unit suite (see /tmp/dod-vitest.log)"
fi

# ── 3. Backend tests (pytest) ──────────────────────────────────────────────
section "3/7 Backend tests (pytest tests/test_api.py)"
if ! "$PY" -c "import pytest" >/dev/null 2>&1; then
  fail "pytest — not importable (activate backend venv / uv sync in backend/)"
elif "$PY" -m pytest tests/test_api.py -q >/tmp/dod-pytest.log 2>&1; then
  pass "backend pytest"
else
  fail "backend pytest (see /tmp/dod-pytest.log)"
fi

# ── 4. RTL physical-property scan (reuse rtl-scan.sh) ───────────────────────
section "4/7 RTL physical-props (start/end, not left/right)"
RTL_OUT="$(bash "$ROOT/.claude/scripts/rtl-scan.sh" 2>/dev/null)"; RTL_RC=$?
if [ "$RTL_RC" -eq 2 ]; then
  fail "RTL scan — rtl-allowlist.txt missing"
elif [ "$RTL_RC" -eq 1 ]; then
  fail "RTL scan — frontend/app or frontend/components missing"
else
  RTL_COUNT="$(printf '%s\n' "$RTL_OUT" | head -n1)"
  if [ "$RTL_COUNT" = "0" ]; then
    pass "RTL scan (0 physical-prop violations)"
  else
    fail "RTL scan — $RTL_COUNT physical-prop violation(s):"
    printf '%s\n' "$RTL_OUT" | tail -n +2 | sed 's/^/        /' >&2
  fi
fi

# ── 5. No lucide-react imports (Phosphor is the icon lib) ───────────────────
section "5/7 lucide-react import ban"
LUCIDE=$(grep -rEl "(from|require\()[[:space:]]*['\"]lucide-react" \
  "$ROOT/frontend" --include='*.js' --include='*.jsx' 2>/dev/null \
  | grep -v '/node_modules/' | grep -v '/.next/' || true)
if [ -z "$LUCIDE" ]; then
  pass "no lucide-react imports"
else
  fail "lucide-react imported in:"
  printf '%s\n' "$LUCIDE" | sed 's/^/        /' >&2
fi

# ── 6. No forbidden vendor term in frontend UI strings ─────────────────────
# Brand rule (docs/BRAND.md, ADR-024): the vendor noun is banned in UI copy;
# use the business term instead. The regex targets that noun but excludes the
# Ministry-of-Health producer-LICENSE compound (a distinct regulated term) via
# a negative lookbehind. Full bilingual rationale: SKILL.md check-6 row.
section "6/7 forbidden term in UI strings"
# Fail-closed: the exclusion relies on a PCRE lookbehind. If this grep lacks
# -P (non-GNU grep), the pattern would error to empty and silently PASS — so
# treat missing PCRE as a hard failure, never a green.
if ! printf 'x' | grep -qP 'x' 2>/dev/null; then
  fail "'יצרן' check — grep -P (PCRE) unavailable; cannot run (would false-pass)"
else
  IATZRAN=$(grep -rInoP '(?<!רישיון )יצרן|יצרנית' \
    "$ROOT/frontend/messages" "$ROOT/frontend/app" \
    "$ROOT/frontend/components" "$ROOT/frontend/lib" \
    --include='*.json' --include='*.js' --include='*.jsx' 2>/dev/null \
    | grep -v '/node_modules/' | grep -v '/.next/' \
    | grep -v '/__tests__/' | grep -v '\.test\.' || true)
  if [ -z "$IATZRAN" ]; then
    pass "no forbidden 'יצרן' in UI strings"
  else
    fail "'יצרן'/'יצרנית' in UI strings (use 'בית עסק'):"
    printf '%s\n' "$IATZRAN" | sed 's/^/        /' >&2
  fi
fi

# ── 7. en.json key parity (reuse MEH-978 en-parity-guard) ──────────────────
# Named DoD signal for i18n drift. The full vitest suite (check 2) already runs
# this file; here it is invoked in isolation so a he→en parity break surfaces
# as its own line rather than one failure among hundreds.
section "7/7 en.json parity (MEH-978 en-parity-guard)"
if [ ! -x "$ROOT/frontend/node_modules/.bin/vitest" ]; then
  fail "en-parity guard — vitest not installed (run 'npm ci' in frontend/)"
elif ( cd "$ROOT/frontend" && ./node_modules/.bin/vitest run __tests__/en-parity-guard.test.js ) >/tmp/dod-parity.log 2>&1; then
  pass "en.json key parity"
else
  fail "en.json key parity — he-only key(s) missing from en.json (see /tmp/dod-parity.log)"
fi

# ── Summary ────────────────────────────────────────────────────────────────
printf '\n────────────────────────────────────────\n'
if [ "${#FAILURES[@]}" -eq 0 ]; then
  printf 'DoD: PASS — all 7 checks green.\n'
  exit 0
fi
printf 'DoD: FAIL — %d check(s) failed:\n' "${#FAILURES[@]}"
for f in "${FAILURES[@]}"; do printf '  ✗ %s\n' "$f"; done
exit 1
