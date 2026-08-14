#!/usr/bin/env bash
#
# Module:   openapi-codegen-drift-guard.sh
# Purpose:  Keep the three links of the codegen chain in sync —
#             backend Pydantic  →  backend/openapi.json  →  frontend/lib/generated/
#           and fail if any committed artifact is stale relative to its source.
# Touches:  reads backend/openapi.json, frontend/lib/generated/**, and the
#           committed manifest. Writes NOTHING unless invoked with --write.
# Does NOT: validate the CONTENT of the generated schemas (that is orval's job),
#           and does NOT check the hand-written lib/schemas.js — MEH-1891's
#           backend-contract-parity.test.js owns that, and MEH-1748 Phase 1 is
#           additive: nothing imports lib/generated/ yet.
# Related:  frontend/orval.config.js (the generator), backend/openapi.json (the
#           reviewable contract), docs/audits/codegen-phase1-comparison.md,
#           scripts/checks/README.md (the guard-authoring contract).
# History:  MEH-1748 Phase 1 (Sapir's 14/08 ruling — adopt codegen, in phases).
#
# ── WHY A HASH MANIFEST AND NOT JUST `git diff --exit-code` ─────────────────
#   The obvious implementation — regenerate both artifacts, then
#   `git diff --exit-code` — is what MEH-1748's spike described, and it is what
#   TIER B and TIER C below actually do. It cannot be the WHOLE guard, because
#   of where this guard runs.
#
#   The `Repo guards` job is `actions/checkout@v7` + `bash run-all.sh`  # rtl-ok: workflow filename, not a CSS class
#   (`.github/workflows/pr-checks.yml`, the `repo-guards` job). No `npm ci`, no
#   `uv sync`, no network — and scripts/checks/README.md states the budget out
#   loud: "~1s … no npm install, no full-history checkout, no network."
#   Regenerating needs FastAPI plus the whole backend dependency tree (link 1)
#   and node_modules plus orval (link 2). Neither is present, and installing
#   them would turn a 1s job into a multi-minute one for every PR in the repo.
#
#   A guard that quietly does nothing in the only environment it runs in is the
#   exact failure `.claude/rules/testing.md` names — "a probe whose null output
#   is also its reassuring output". So the guard is split:
#
#     TIER A  ALWAYS runs. Hermetic: sha256 of the artifacts vs a committed
#             manifest. Catches BOTH directions of link 2 — a spec edited
#             without regenerating, and a generated file hand-edited — with no
#             toolchain at all, in milliseconds. This is the tier that actually
#             fires in CI.
#     TIER B  Regenerates lib/generated/ and diffs it. Runs only where orval is
#             installed (a dev machine, or a job that has run `npm ci`).
#     TIER C  Regenerates openapi.json and diffs it. Runs only where the backend
#             venv is importable. THIS IS THE ONLY CHECK OF LINK 1.
#
#   Tiers B and C announce whether they ran, every time, and a run in which they
#   did not is NOT silently green — it prints WARNING, which run-all.sh surfaces
#   inline (MEH-1715). Tier A's verdict still stands on its own.
#
# ── THE HONEST LIMIT, STATED HERE SO NOBODY INFERS COVERAGE THAT ISN'T THERE ──
#   In CI today, link 1 (Pydantic → openapi.json) is NOT enforced. A backend
#   field added without re-running `--write` produces a stale openapi.json, and
#   Tier A cannot tell: the manifest describes the committed spec, so spec and
#   manifest agree with each other while both disagree with the app.
#
#   That gap is real, it is not closed by this guard, and the fix is a pytest
#   regenerator on the `Backend tests (pytest)` leg where the venv already
#   exists — the exact shape of tests/test_producer_contract_snapshot.py. That
#   is a new backend test file, outside MEH-1748 Phase 1's authorised file list,
#   so it is written up as the Phase 1.5 recommendation in the comparison report
#   rather than smuggled in here.
#
# USAGE
#   bash scripts/checks/openapi-codegen-drift-guard.sh              # check
#   bash scripts/checks/openapi-codegen-drift-guard.sh --write      # regenerate
#   bash scripts/checks/openapi-codegen-drift-guard.sh --self-test  # prove it bites
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1   # SC2164: without this the guard greps the wrong tree and passes

SPEC="backend/openapi.json"
GEN_DIR="frontend/lib/generated"
MANIFEST="$GEN_DIR/codegen-manifest.json"
REGEN_HINT="bash scripts/checks/openapi-codegen-drift-guard.sh --write"

MODE="check"
case "${1:-}" in
  --write)     MODE="write" ;;
  --self-test) MODE="self-test" ;;
  "")          ;;
  *) echo "unknown argument: $1" >&2; exit 2 ;;
esac

# ---------------------------------------------------------------------------
# Primitives.
# ---------------------------------------------------------------------------
sha_of() { sha256sum "$1" | cut -d' ' -f1; }

# Every generated file except the manifest itself, repo-relative, stable order.
gen_files() {
  find "$GEN_DIR" -type f ! -name "$(basename "$MANIFEST")" | LC_ALL=C sort
}

# The manifest is a flat JSON object: { "<path>": "<sha256>", … }. Read with
# python3 (present on every runner) rather than jq, which is not guaranteed on
# a bare runner.
manifest_get() {
  python3 -c '
import json, sys
try:
    print(json.load(open(sys.argv[1])).get(sys.argv[2], ""))
except Exception:
    print("")
' "$MANIFEST" "$1"
}

manifest_paths() {
  python3 -c '
import json, sys
try:
    print("\n".join(sorted(json.load(open(sys.argv[1])))))
except Exception:
    pass
' "$MANIFEST"
}

write_manifest() {
  python3 - "$MANIFEST" "$@" <<'PY'
import json, sys
out, pairs = sys.argv[1], sys.argv[2:]
data = {pairs[i]: pairs[i + 1] for i in range(0, len(pairs), 2)}
with open(out, "w", encoding="utf-8") as fh:
    json.dump(data, fh, indent=2, sort_keys=True)
    fh.write("\n")
PY
}

regen_spec() {
  ( cd backend && uv run --frozen python -c '
import json, pathlib
from app.main import app
pathlib.Path("openapi.json").write_text(
    json.dumps(app.openapi(), indent=2, ensure_ascii=False, sort_keys=True) + "\n",
    encoding="utf-8",
)
' ) >/dev/null 2>&1
}

regen_zod() {
  ( cd frontend && ./node_modules/.bin/orval --config orval.config.js ) >/dev/null 2>&1
}

restamp() {
  local args=("$SPEC" "$(sha_of "$SPEC")")
  local f
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    args+=("$f" "$(sha_of "$f")")
  done < <(gen_files)
  write_manifest "${args[@]}"
}

# ---------------------------------------------------------------------------
# TIER A — hermetic hash check. Always runs. Returns 0 = in sync, 1 = drift.
# ---------------------------------------------------------------------------
tier_a() {
  local bad=0 f live recorded listed

  if [ ! -f "$SPEC" ];     then echo "$SPEC:1: missing — the committed OpenAPI artifact does not exist."; return 1; fi
  if [ ! -f "$MANIFEST" ]; then echo "$MANIFEST:1: missing — run: $REGEN_HINT"; return 1; fi

  live="$(sha_of "$SPEC")"
  recorded="$(manifest_get "$SPEC")"
  if [ "$live" != "$recorded" ]; then
    echo "$SPEC:1: changed since lib/generated/ was last generated from it."
    echo "    manifest: ${recorded:-<absent>}"
    echo "    on disk : $live"
    echo "    The generated Zod schemas no longer describe this spec. Run: $REGEN_HINT"
    bad=1
  fi

  # A generated file that was hand-edited, added, or renamed.
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    live="$(sha_of "$f")"
    recorded="$(manifest_get "$f")"
    if [ -z "$recorded" ]; then
      echo "$f:1: not in the manifest — a new or renamed generated file. Run: $REGEN_HINT"
      bad=1
    elif [ "$live" != "$recorded" ]; then
      echo "$f:1: edited by hand since generation. Generated files are overwritten on"
      echo "    every regeneration, so an edit here is lost the next time anyone runs"
      echo "    the generator. Change the backend contract instead. ($REGEN_HINT)"
      bad=1
    fi
  done < <(gen_files)

  # A manifest entry whose file is gone: the mirror of the case above, and the
  # one a loop over what EXISTS can never see.
  listed="$(manifest_paths)"
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    if [ ! -f "$f" ]; then
      echo "$MANIFEST:1: lists $f, which no longer exists. Run: $REGEN_HINT"
      bad=1
    fi
  done <<<"$listed"

  return "$bad"
}

# ---------------------------------------------------------------------------
# Self-test — proves Tier A discriminates, by breaking each condition it guards
# and requiring a red, then restoring and requiring a green.
#
# Per .claude/rules/testing.md: run the CONTROL first, exercise the REAL
# classifier (tier_a itself, never a copy), and anchor the cases to real files
# from this repo rather than to invented fixtures — a probe validated only on
# synthetic shapes passes against shapes the repo does not use (MEH-1909).
# Every case below mutates a scratch COPY of the actual committed artifacts, so
# the shapes are the repo's own by construction.
# ---------------------------------------------------------------------------
self_test() {
  local tmp rc fails=0 ran=0 one
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN

  mkdir -p "$tmp/backend" "$tmp/$GEN_DIR"
  cp "$SPEC" "$tmp/$SPEC"
  cp -r "$GEN_DIR/." "$tmp/$GEN_DIR/"

  run_case() {
    local name="$1" want="$2"   # want: 0 = expect pass, 1 = expect fail
    ran=$(( ran + 1 ))
    ( cd "$tmp" && tier_a ) >/dev/null 2>&1
    rc=$?
    [ "$rc" -ne 0 ] && rc=1
    if [ "$rc" -eq "$want" ]; then
      echo "  ok    $name (expected $want, got $rc)"
    else
      echo "  FAIL  $name (expected $want, got $rc)"
      fails=$(( fails + 1 ))
    fi
  }

  echo "self-test: exercising the real tier_a against copies of the repo's own artifacts"

  # CONTROL, run first: the committed state must be clean. If this fails, every
  # red below is meaningless — it would prove only that the harness is broken,
  # not that the guard discriminates.
  run_case "control — committed artifacts are in sync" 0
  if [ "$fails" -ne 0 ]; then
    echo
    echo "self-test ABORTED: the control failed, so no result below can be trusted."
    echo "Every 'expected fail' from here would be indistinguishable from a broken harness."
    return 1
  fi

  one="$(cd "$tmp" && gen_files | head -1)"

  # 1 — the spec moves, the generated schemas do not.
  printf '\n' >> "$tmp/$SPEC"
  run_case "spec edited without regenerating lib/generated/" 1
  cp "$SPEC" "$tmp/$SPEC"
  run_case "...spec restored" 0

  # 2 — someone hand-edits a generated file (the PostHog "never edit generated" rule).
  printf '\n// hand edit\n' >> "$tmp/$one"
  run_case "generated file hand-edited" 1
  cp "$one" "$tmp/$one"
  run_case "...generated file restored" 0

  # 3 — a generated file disappears (the rename a config change would produce).
  mv "$tmp/$one" "$tmp/$one.moved"
  run_case "generated file deleted / renamed" 1
  mv "$tmp/$one.moved" "$tmp/$one"
  run_case "...file restored" 0

  # 4 — an unmanifested new file appears in the generated dir.
  echo "// stray" > "$tmp/$GEN_DIR/stray.js"
  run_case "unmanifested file added to lib/generated/" 1
  rm -f "$tmp/$GEN_DIR/stray.js"
  run_case "...stray removed" 0

  # 5 — the manifest itself is missing.
  mv "$tmp/$MANIFEST" "$tmp/manifest.bak"
  run_case "manifest missing" 1
  mv "$tmp/manifest.bak" "$tmp/$MANIFEST"
  run_case "...manifest restored" 0

  echo
  # Derived, never stated: a case added above moves this number on its own.
  echo "self-test: $ran case(s) run, $fails failed"
  [ "$fails" -eq 0 ] || return 1
  return 0
}

# ---------------------------------------------------------------------------
# Dispatch.
# ---------------------------------------------------------------------------
if [ "$MODE" = "self-test" ]; then
  self_test
  exit $?
fi

if [ "$MODE" = "write" ]; then
  echo "regenerating $SPEC from the FastAPI app ..."
  if regen_spec; then echo "  ok"; else
    echo "  FAILED — is the backend venv installed? (cd backend && uv sync)" >&2; exit 1
  fi
  echo "regenerating $GEN_DIR from $SPEC ..."
  if regen_zod; then echo "  ok"; else
    echo "  FAILED — is orval installed? (cd frontend && npm ci)" >&2; exit 1
  fi
  restamp
  echo "manifest restamped: $MANIFEST"
  echo
  echo "Review the diff, then commit spec + generated + manifest together."
  exit 0
fi

# ── check mode ──────────────────────────────────────────────────────────────
status=0
before=""
after=""

tier_a || status=1

# TIER B — regenerate the Zod schemas where orval exists.
if [ -x frontend/node_modules/.bin/orval ]; then
  before="$(gen_files | while IFS= read -r f; do sha_of "$f"; done)"
  if regen_zod; then
    after="$(gen_files | while IFS= read -r f; do sha_of "$f"; done)"
    if [ "$before" != "$after" ]; then
      echo "$GEN_DIR:1: regenerating from $SPEC produced different output than what is"
      echo "    committed. The committed schemas are stale. Run: $REGEN_HINT"
      status=1
    else
      echo "  tier B ran: regeneration reproduced the committed schemas exactly."
    fi
  else
    echo "$GEN_DIR:1: orval exited non-zero — the committed spec no longer generates."
    status=1
  fi
else
  echo "  WARNING: tier B did not run (frontend/node_modules/.bin/orval absent), so"
  echo "  nothing here re-derived lib/generated/ from the spec. Tier A's hash check"
  echo "  still holds: the two committed artifacts are consistent with each other."
fi

# TIER C — regenerate the spec where the backend venv exists. The ONLY check of
# link 1 (Pydantic → openapi.json), and it does not run in CI. See the header.
if ( cd backend && uv run --frozen python -c "import fastapi" ) >/dev/null 2>&1; then
  before="$(sha_of "$SPEC")"
  if regen_spec; then
    after="$(sha_of "$SPEC")"
    if [ "$before" != "$after" ]; then
      echo "$SPEC:1: the backend app no longer serialises to the committed spec —"
      echo "    a Pydantic model or a route changed. Run: $REGEN_HINT"
      status=1
    else
      echo "  tier C ran: the backend app reproduces the committed spec exactly."
    fi
  else
    echo "$SPEC:1: could not import the backend app to regenerate the spec."
    status=1
  fi
else
  echo "  WARNING: tier C did not run (backend venv not importable), so NOTHING in"
  echo "  this run checked backend Pydantic against $SPEC. A model changed without a"
  echo "  regenerate would pass here. This is the known CI gap — see this file's"
  echo "  header and docs/audits/codegen-phase1-comparison.md."
fi

if [ "$status" -ne 0 ]; then
  echo
  echo "openapi-codegen-drift-guard FAILED — a committed artifact is stale."
  exit 1
fi

exit 0
