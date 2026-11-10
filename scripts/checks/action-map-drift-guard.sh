#!/usr/bin/env bash
#
# Module:   action-map-drift-guard.sh
# Purpose:  Fail when docs/release/action-map.md (the generated action map,
#           anchor plan §B) no longer matches the repo — on EVERY PR, not only
#           on the PRs that run pytest.
# Touches:  nothing — runs scripts/release/action_map.py in its read-only
#           check modes and prints its `file:line` findings.
# Does NOT: regenerate the doc (that is `action_map.py --write`, by a human or
#           CC), judge whether the GAP count is acceptable (no ratchet yet), or
#           re-derive the API-route half of the map: that needs the backend's
#           dependencies, which this job does not install (see TIERS).
# Related:  scripts/release/action_map.py (generator + all check logic),
#           tests/test_action_map_complete.py (the full guard, in pytest),
#           scripts/checks/openapi-codegen-drift-guard.sh (the tiered pattern
#           this copies), docs/ci/action-map-pytest-filter.patch.md (widens the
#           pytest path filter so the full tier runs where it should).
# History:  MEH-2894 (creation, review round 1 finding 1).
#
# WHY A SECOND GUARD WHEN tests/test_action_map_complete.py EXISTS
#   pytest runs only for backend/**, tests/** and one script (the `changes`
#   filter of the PR-checks workflow). A PR that adds a business tool, a page,
#   a Playwright spec or an audit section — or hand-edits the doc from GAP to
#   covered — never runs it. `Repo guards` runs on every PR, but with a bare
#   checkout: no uv sync, no FastAPI. So this guard runs what needs nothing
#   but python3's stdlib, and the full tier only where the backend venv exists.
#
# TIERS
#   static  ALWAYS. `action_map.py --check-static`, stdlib only, ~1 s:
#             - the doc's sha256 equals docs/release/action-map.sha256
#               (a hand edit of any cell, API table included, goes red);
#             - every `covered` citation in the committed doc still points at
#               an HTTP call / a 401-403 assertion / a `.goto(`;
#             - the «Pages» section equals a fresh one (pages, CI-run specs,
#               Vitest imports);
#             - the business-tool ids equal the registry's;
#             - the state-machine rows equal the audit's sections/transitions.
#           Preceded by `--self-test-static`, which proves those checks can
#           fail (synthetic cases + real-file anchors) before trusting a pass.
#   full    ONLY IF backend/.venv/bin/python exists (a developer machine; not
#           the CI runner). `action_map.py --check`: regenerates everything,
#           route table included. In CI the same check runs as
#           tests/test_action_map_complete.py inside the pytest job.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1   # SC2164: without this the guard checks the wrong tree and passes

PY="${PYTHON:-python3}"
SCRIPT="scripts/release/action_map.py"

if [ ! -f "$SCRIPT" ]; then
  echo "$SCRIPT:1: missing — the action-map guard has nothing to run" >&2
  exit 1
fi

if ! "$PY" "$SCRIPT" --self-test-static; then
  echo "$SCRIPT:1: static self-test failed — every pass below would be void" >&2
  exit 1
fi

status=0
"$PY" "$SCRIPT" --check-static || status=1

VENV_PY="backend/.venv/bin/python"
if [ -x "$VENV_PY" ]; then
  echo "action-map: backend venv found — running the full tier too"
  out="$(PYTHONPATH="backend:." ENV="${ENV:-test}" \
    SECRET_KEY="${SECRET_KEY:-action-map-guard-not-a-real-secret-0123456789abcdef0123456789}" \
    "$VENV_PY" "$SCRIPT" --check 2>&1)" || status=1
  printf '%s\n' "$out" | grep -v ' \[INFO\] '
else
  echo "action-map: no backend venv — full tier skipped here; CI runs it as tests/test_action_map_complete.py"
fi

exit "$status"
