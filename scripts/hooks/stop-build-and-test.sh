#!/usr/bin/env bash
#
# Module:   stop-build-and-test
# Purpose:  The repo's four Stop hooks — frontend build, ESLint, vitest, backend
#           pytest — as ONE committed, reviewable, self-tested script, replacing
#           the four inline `bash -c '…'` strings in .claude/settings.json
#           (hooks.Stop). Runs all four, reports every failure (not just the
#           first), and exits 2 with the reasons on stderr when any fails —
#           exit 2 is Claude Code's documented blocking exit for hooks.
# Touches:  runs `npm run build` (writes frontend/.next and regenerates
#           frontend/next-env.d.ts — the drift .claude/rules/testing.md
#           attributes to a Stop hook is THIS), `npx eslint`, `npx vitest run`,
#           and pytest against TEST_DATABASE_URL (default: the local
#           mehamakor_test Postgres, per tests/conftest.py:17-19).
# Does NOT: get wired by itself. .claude/settings.json is CC-deny (MEH-442
#           protect-lint-config + permissions.deny), so the hunk that swaps the
#           four inline entries for this script is staged for Sapir in
#           docs/ci/meh-2117-stop-hook-in-repo.patch.md. It is also NOT the
#           machine-level git-state hook (~/.claude/stop-hook-git-check.sh) —
#           that one's in-repo port is the sibling scripts/hooks/stop-git-check.sh.
# Related:  .claude/settings.json hooks.Stop (the four inline hooks this
#           mirrors) · the CI gate workflow's pytest job (`backend/.venv/bin/
#           python -m pytest tests/` from the REPO ROOT — the invocation this
#           mirrors; the file:line citation sits above set -uo pipefail) · tests/test_api.py (the test
#           file, at the repo root) · scripts/checks/run-all.sh (the
#           run-everything-then-summarise shape this borrows).
# History:  MEH-2117 (creation — a hook that cannot be reviewed, versioned or
#           verified is the defect; the inline JSON strings had the same
#           property). Measured while porting, 03/09: TWO of the four inline
#           hooks are permanent no-ops in this repo — see WHAT THE INLINE
#           HOOKS ACTUALLY DID below.
#
# WHAT THE INLINE HOOKS ACTUALLY DID (measured 03/09 against origin/staging)
#   - ESLint hook: guards on `frontend/.eslintrc.json`. That file does not
#     exist — the config moved to `frontend/eslint.config.mjs` (MEH-443). The
#     hook has therefore printed "Warning: .eslintrc.json not found, skipping
#     ESLint" and exited 0 on every Stop since. Never linted anything.
#   - pytest hook: guards on `$root/backend/tests/test_api.py`. The tests live
#     at `tests/test_api.py` in the REPO ROOT (`git ls-files backend/tests` is
#     empty; CI runs `backend/.venv/bin/python -m pytest tests/`). The hook has
#     printed "Warning: backend/tests/test_api.py not found, skipping backend
#     tests" on every Stop. Never ran a test. And even with the path fixed it
#     would call bare `python -m pytest`, which in this container is
#     `/usr/local/bin/python: No module named pytest` while
#     `backend/.venv/bin/pytest` (9.1.1) exists — a second reason it skipped.
#   Both are the MEH-1742 shape: a device that reports success from the absence
#   of measurement. Neither ever failed, so nobody looked. This script fixes
#   both by resolving the real paths, and its --self-test anchors on the real
#   repo so the fix cannot silently regress to a skip.
#
# GUARDS (all preserved from the inline hooks; each is a SKIP, never a block)
#   frontend/ missing            → skip build + eslint + vitest
#   frontend/node_modules missing → skip build + eslint + vitest (npm install not run)
#   no eslint config             → skip eslint
#   frontend/__tests__ missing   → skip vitest
#   no pytest runner             → skip pytest (warn)
#   tests/test_api.py missing    → skip pytest (warn)
#   ESLint exit 2 (config error) → warn + skip, not block (as before)
#
# ENV
#   STOP_HOOK_ROOT   override the repo root (default: CLAUDE_PROJECT_DIR, else
#                    `git rev-parse --show-toplevel`, else cwd) — used by the
#                    self-test and by a by-hand run from another checkout
#   STOP_HOOK_SKIP   comma list of steps to skip: build,eslint,vitest,pytest
#
# EXIT CODES
#   0  everything that could run passed (skips are reported, not fatal)
#   2  at least one step failed — reasons on stderr (Claude Code blocks on 2)
#
set -uo pipefail

# rtl-ok: a workflow FILENAME (see dnm-matcher-guard.sh for the same false positive), not a padding class
# CI's pytest invocation, the one the pytest step below mirrors:
#   .github/workflows/pr-checks.yml:396-407

if [ "${1:-}" = "--self-test" ]; then SELF_TEST=1; else SELF_TEST=0; fi

# Stop hooks receive JSON on stdin. `stop_hook_active: true` means we are being
# invoked because a previous Stop hook already blocked — exit 0 to avoid an
# infinite block loop (Claude Code docs). The inline hooks never checked this.
if [ "$SELF_TEST" -eq 0 ] && [ ! -t 0 ]; then
  input="$(cat 2>/dev/null || true)"
  if command -v jq >/dev/null 2>&1 && [ -n "$input" ]; then
    if [ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false' 2>/dev/null)" = "true" ]; then
      exit 0
    fi
  fi
fi

resolve_root() {
  if [ -n "${STOP_HOOK_ROOT:-}" ]; then printf '%s' "$STOP_HOOK_ROOT"
  elif [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then printf '%s' "$CLAUDE_PROJECT_DIR"
  else git rev-parse --show-toplevel 2>/dev/null || pwd
  fi
}

skipped_step() { case ",${STOP_HOOK_SKIP:-}," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }

# Is there an ESLint config in <root>/frontend? Flat (eslint.config.*) or
# legacy (.eslintrc.*). NOT `ls glob1 glob2`: ls exits non-zero when EITHER
# glob is unmatched, so with only the flat config present it reported "no
# config" and skipped ESLint — measured on the first real run, 03/09. The
# self-test pins both shapes now.
has_eslint_config() {
  compgen -G "$1/frontend/eslint.config.*" >/dev/null 2>&1 \
    || compgen -G "$1/frontend/.eslintrc.*" >/dev/null 2>&1
}

# Which python runs pytest. CI's shape first (backend/.venv), then anything on
# PATH that actually has pytest. Prints the interpreter path, or nothing.
resolve_pytest_python() {
  local root="$1" cand
  for cand in "$root/backend/.venv/bin/python" python3 python; do
    if command -v "$cand" >/dev/null 2>&1 && "$cand" -m pytest --version >/dev/null 2>&1; then
      command -v "$cand"; return 0
    fi
  done
  return 1
}

# ── the four steps ───────────────────────────────────────────────────────────
# Each appends to $reasons on failure and echoes what it did. None exits.
run_all() {
  local root="$1"
  reasons=()

  if [ ! -d "$root/frontend" ]; then
    echo "Warning: frontend/ not found at $root, skipping build, eslint and vitest"
  elif [ ! -d "$root/frontend/node_modules" ]; then
    echo "Warning: frontend/node_modules not found, skipping build, eslint and vitest (run npm install)"
  else
    # 1 · frontend build ------------------------------------------------------
    if skipped_step build; then echo "build: skipped (STOP_HOOK_SKIP)"
    else
      echo "build: npm run build"
      if ! (cd "$root/frontend" && npm run build 2>&1 | tail -20); then
        reasons+=("Frontend build failed — fix errors before completing this task")
      fi
    fi

    # 2 · ESLint --------------------------------------------------------------
    if skipped_step eslint; then echo "eslint: skipped (STOP_HOOK_SKIP)"
    elif ! has_eslint_config "$root"; then
      echo "Warning: no ESLint config (eslint.config.* / .eslintrc.*) in frontend/, skipping ESLint"
    else
      # `npm run lint` (= `eslint .`) is what the CI lint gate runs
      # (deploy.yml:146): ERRORS fail it, warnings do not. The inline hook
      # declared `--max-warnings 0`; measured 03/09 on the main checkout that
      # is 0 errors / 9,507 warnings → exit 1 → a block on EVERY Stop, forever.
      # It never fired only because the inline guard never found its config.
      # Mirroring CI is the faithful choice; warnings are the lint-ratchet's job.
      echo "eslint: npm run lint  (= eslint ., the CI gate — errors block, warnings do not)"
      local lint_out lint_exit
      lint_out="$(cd "$root/frontend" && npm run --silent lint 2>&1)"; lint_exit=$?
      if [ "$lint_exit" -eq 2 ]; then
        echo "Warning: ESLint config error, skipping lint check:"
        printf '%s\n' "$lint_out" | tail -10
      elif [ "$lint_exit" -ne 0 ]; then
        printf '%s\n' "$lint_out" | tail -30
        reasons+=("ESLint found errors — fix before completing this task")
      fi
    fi

    # 3 · vitest --------------------------------------------------------------
    if skipped_step vitest; then echo "vitest: skipped (STOP_HOOK_SKIP)"
    elif [ ! -d "$root/frontend/__tests__" ]; then
      echo "Warning: frontend/__tests__/ not found, skipping component tests"
    else
      echo "vitest: npx vitest run"
      if ! (cd "$root/frontend" && npx vitest run --reporter=verbose 2>&1 | tail -30); then
        reasons+=("Vitest component tests failed — fix errors before completing this task")
      fi
    fi
  fi

  # 4 · backend pytest --------------------------------------------------------
  if skipped_step pytest; then echo "pytest: skipped (STOP_HOOK_SKIP)"
  elif [ ! -d "$root/backend" ]; then
    echo "Warning: backend/ not found, skipping backend tests"
  elif [ ! -f "$root/tests/test_api.py" ]; then
    echo "Warning: tests/test_api.py not found at the repo root, skipping backend tests"
  else
    local py
    if ! py="$(resolve_pytest_python "$root")"; then
      echo "Warning: no python with pytest found (tried backend/.venv/bin/python, python3, python) — run 'uv sync --frozen' in backend/"
    else
      # ISOLATED DATABASE, always. tests/conftest.py maps PYTEST_XDIST_WORKER=gw<N>
      # to mehamakor_test_gw<N> and provisions it (conftest.py:49-98). Without
      # it the hook runs on the shared `mehamakor_test` — and on 03/09 the
      # first real run of this hook deadlocked for 39 minutes against another
      # agent's pytest on that same database (this session `idle in
      # transaction`, theirs waiting on a table lock) and had to be killed.
      # gw90 is above anything `-n auto` hands out on this box; override with
      # your own gw<N> if two hooks could ever run at once.
      export PYTEST_XDIST_WORKER="${PYTEST_XDIST_WORKER:-gw90}"
      echo "pytest: $py -m pytest tests/test_api.py -q --tb=short  (cwd: repo root, as CI does; PYTEST_XDIST_WORKER=$PYTEST_XDIST_WORKER → isolated db)"
      if ! (cd "$root" && "$py" -m pytest tests/test_api.py -q --tb=short 2>&1 | tail -20); then
        reasons+=("Backend tests failed — fix errors before completing this task")
      fi
    fi
  fi
}

main() {
  local root; root="$(resolve_root)"
  run_all "$root"
  if [ "${#reasons[@]}" -gt 0 ]; then
    printf 'STOP HOOK BLOCK (%d):\n' "${#reasons[@]}" >&2
    printf ' - %s\n' "${reasons[@]}" >&2
    exit 2
  fi
  exit 0
}

# ── self-test ────────────────────────────────────────────────────────────────
# Fail-by-construction in both directions (MEH-1619): fake repo roots whose
# build / tests fail must produce exit 2 with the right reason; roots where the
# guards apply must SKIP with exit 0; and the real repo must resolve the real
# test path so the port cannot regress into the inline hooks' permanent skip.
self_test() {
  local pass=0 total=0 rc out
  # Global on purpose: the EXIT trap fires after this function has returned,
  # so a `local` here would be unbound under `set -u` by the time it runs.
  SELFTEST_TMP="$(mktemp -d)"
  trap 'rm -rf "$SELFTEST_TMP"' EXIT
  local tmp="$SELFTEST_TMP"
  local real_root; real_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  # Absolute path resolved once, as stop-git-check.sh does — `$0` is whatever the
  # caller typed and drifts under a symlink or a cwd change (CI reviewer on #3325).
  local SELF; SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"

  check() { # $1=label $2=expected-exit $3=actual-exit [$4=required substring of combined output]
    total=$((total+1))
    if [ "$3" -eq "$2" ] && { [ -z "${4:-}" ] || printf '%s' "$out" | grep -qF "$4"; }; then
      echo "  ok   $1 (exit $3)"; pass=$((pass+1))
    else
      echo "  FAIL $1 (exit $3, wanted $2${4:+, output must contain: $4})"
      printf '%s\n' "$out" | sed 's/^/       | /' | tail -15
    fi
  }
  run_on() { # $1=root  → sets out + rc
    set +e; out="$(STOP_HOOK_ROOT="$1" bash "$SELF" 2>&1 </dev/null)"; rc=$?; set -e; return 0; }
  fake_frontend() { # $1=root $2=build-command
    mkdir -p "$1/frontend/node_modules"
    printf '{"name":"fake","private":true,"scripts":{"build":"%s"}}\n' "$2" > "$1/frontend/package.json"
  }

  echo "stop-build-and-test --self-test"

  # (a) REAL-REPO ANCHOR: the test file is at the repo root, and the inline
  #     hooks' path is absent. If this ever flips, the pytest step's guard must
  #     be revisited — it is the exact silent-skip this port removes.
  if [ -f "$real_root/tests/test_api.py" ] && [ ! -e "$real_root/backend/tests/test_api.py" ]; then rc=0; else rc=1; fi
  out=""; check "real repo: tests/test_api.py at the root; backend/tests/test_api.py absent" 0 "$rc"

  # (b) INFORMATIONAL, not a case: which pytest runner THIS checkout resolves.
  #     Environment-dependent (a fresh clone or a worktree has no backend/.venv
  #     until `uv sync --frozen`), so it cannot be an anchor — but it is the
  #     fact the inline hook's bare `python -m pytest` got wrong, so it is
  #     printed every run rather than assumed.
  if out="$(resolve_pytest_python "$real_root" 2>/dev/null)"; then
    echo "  note pytest runner in this checkout: $out"
  else
    echo "  note NO pytest runner in this checkout (backend/.venv missing?) — the hook would SKIP pytest here, with a warning"
  fi

  # (b2) the ESLint-config guard, both shapes and the empty case. The flat-only
  #      shape is this repo's (eslint.config.mjs, MEH-443) and is the one the
  #      `ls glob glob` form got wrong.
  mkdir -p "$tmp/flat/frontend" "$tmp/legacy/frontend" "$tmp/none/frontend"
  : > "$tmp/flat/frontend/eslint.config.mjs"; : > "$tmp/legacy/frontend/.eslintrc.json"
  has_eslint_config "$tmp/flat"   && rc=0 || rc=1; out=""; check "eslint guard: flat config only (this repo's shape) → found" 0 "$rc"
  has_eslint_config "$tmp/legacy" && rc=0 || rc=1; check "eslint guard: legacy .eslintrc only → found" 0 "$rc"
  has_eslint_config "$tmp/none"   && rc=0 || rc=1; check "eslint guard: no config → not found" 1 "$rc"
  has_eslint_config "$real_root"  && rc=0 || rc=1; check "real repo: frontend/eslint.config.* present (the inline hook looked for .eslintrc.json only)" 0 "$rc"

  # (c) frontend absent → skip, exit 0
  mkdir -p "$tmp/nofe"; run_on "$tmp/nofe"
  check "frontend/ absent → skipped, not blocked" 0 "$rc" "frontend/ not found"

  # (d) node_modules absent → skip, exit 0
  mkdir -p "$tmp/nonm/frontend"; run_on "$tmp/nonm"
  check "frontend/node_modules absent → skipped, not blocked" 0 "$rc" "node_modules not found"

  # (e) RED: build fails → exit 2 with the build reason
  fake_frontend "$tmp/redbuild" "exit 1"; run_on "$tmp/redbuild"
  check "failing npm run build → exit 2" 2 "$rc" "Frontend build failed"

  # (f) GREEN: build passes, nothing else present → exit 0
  fake_frontend "$tmp/green" "true"; run_on "$tmp/green"
  check "passing build, no eslint/vitest/pytest surfaces → exit 0" 0 "$rc"

  # (g) RED: pytest fails → exit 2 with the backend reason. A fake interpreter
  #     stands in for backend/.venv/bin/python: it answers `-m pytest --version`
  #     and fails any real run.
  mkdir -p "$tmp/redpy/backend/.venv/bin" "$tmp/redpy/tests"
  printf 'def test_x():\n    assert False\n' > "$tmp/redpy/tests/test_api.py"
  cat > "$tmp/redpy/backend/.venv/bin/python" <<'EOF'
#!/bin/sh
case "$*" in *--version*) echo "pytest 0.0 (fake)"; exit 0 ;; *) echo "worker=${PYTEST_XDIST_WORKER:-unset}"; echo "1 failed (fake)"; exit 1 ;; esac
EOF
  chmod +x "$tmp/redpy/backend/.venv/bin/python"
  run_on "$tmp/redpy"
  check "failing pytest → exit 2" 2 "$rc" "Backend tests failed"
  # The isolated-database id must reach pytest's environment — a hook that ran
  # on the shared mehamakor_test is the 03/09 deadlock. Asserted on the fake
  # interpreter's echo of PYTEST_XDIST_WORKER, so it proves the export, not the
  # message.
  printf '%s' "$out" | grep -qF "worker=gw90" && rc=0 || rc=1
  check "...and pytest ran with PYTEST_XDIST_WORKER=gw90 (isolated database)" 0 "$rc"

  # (h) RED + RED: both fail → BOTH reasons reported (run-everything, like
  #     run-all.sh), not just the first.
  fake_frontend "$tmp/redpy" "exit 1"; run_on "$tmp/redpy"
  check "two failures → both reasons listed" 2 "$rc" "STOP HOOK BLOCK (2)"

  # (i) STOP_HOOK_SKIP suppresses a failing step
  set +e; out="$(STOP_HOOK_ROOT="$tmp/redbuild" STOP_HOOK_SKIP=build bash "$SELF" 2>&1 </dev/null)"; rc=$?; set -e
  check "STOP_HOOK_SKIP=build turns the red build into a skip" 0 "$rc" "build: skipped"

  # (j) stop_hook_active → exit 0 immediately, even on a red root
  set +e; out="$(printf '{"stop_hook_active": true}' | STOP_HOOK_ROOT="$tmp/redbuild" bash "$SELF" 2>&1)"; rc=$?; set -e
  check "stop_hook_active=true → exit 0 (no block loop)" 0 "$rc"

  echo "  $pass/$total self-test cases behaved correctly"
  [ "$pass" -eq "$total" ]
}

if [ "$SELF_TEST" -eq 1 ]; then
  set -e
  self_test || exit 1
  exit 0
fi
main
