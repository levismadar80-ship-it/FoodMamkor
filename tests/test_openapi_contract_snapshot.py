"""
Module:   test_openapi_contract_snapshot
Purpose:  Close the CI gap link 1 (Pydantic -> backend/openapi.json) that
          scripts/checks/openapi-codegen-drift-guard.sh cannot close itself —
          its Tier C only runs where the backend venv is importable, and the
          `Repo guards` CI job is a bare `actions/checkout` + one bash call
          with no venv at all. This test rides the `Backend tests (pytest)`
          leg instead, where the venv already exists, so a Pydantic field
          added without regenerating openapi.json now fails a REQUIRED check.
Touches:  writes backend/openapi.json when UPDATE_OPENAPI_SNAPSHOT=1 is set;
          read-only otherwise.
Does NOT: regenerate frontend/lib/generated/ (Tier B) or validate CSP/manifest
          hashes (Tier A) — both stay owned by
          scripts/checks/openapi-codegen-drift-guard.sh. This file closes only
          link 1; run the guard's --write mode to keep all three in sync.
Related:  scripts/checks/openapi-codegen-drift-guard.sh (Tier C + the header
          that names this exact gap), docs/audits/codegen-phase1-comparison.md
          §8 ("Recommended Phase 1.5"), tests/test_producer_contract_snapshot.py
          (the sibling this mirrors — same shape, narrower scope).
History:  MEH-2084 (creation — the `Repo guards` job was reporting green while
          Tier C, the only check of this link, never ran in any CI job).

WHY THIS IS A NEW FILE AND NOT A CHANGE TO run-all.sh:
Making scripts/checks/openapi-codegen-drift-guard.sh exit non-zero whenever
Tier C cannot run would fail the `Repo guards` job on every single PR, forever
— that job never has a backend venv, by design (scripts/checks/README.md's ~1s
hermetic budget). The gap was never that Tier C fails silently: MEH-1715
already makes run-all.sh surface a `WARNING` line inline whenever Tier C (or
Tier B) does not run. The gap is that nothing REQUIRED enforces link 1 at all.
This file is that enforcement, in the CI leg that already has the venv.
"""

import json
import os
from pathlib import Path

from app.main import app

SPEC_PATH = Path(__file__).resolve().parents[1] / "backend" / "openapi.json"

REGEN_COMMAND = (
    "UPDATE_OPENAPI_SNAPSHOT=1 pytest tests/test_openapi_contract_snapshot.py"
)


def _current_spec_text() -> str:
    # Same serialisation as scripts/checks/openapi-codegen-drift-guard.sh's
    # regen_spec() — indent=2, ensure_ascii=False, sort_keys=True, trailing
    # newline — so a manual `--write` and this test never disagree on format.
    return json.dumps(app.openapi(), indent=2, ensure_ascii=False, sort_keys=True) + "\n"


def test_openapi_json_matches_the_live_app():
    """The committed backend/openapi.json equals what the FastAPI app serves.

    Fails on ANY drift — added/removed/changed field, route, or constraint —
    because a stale spec silently disarms Tier A/B downstream: the manifest
    and the generated Zod schemas would keep agreeing with yesterday's
    contract while today's app grew or changed a field. This is the check
    that used to be reported "ran" in output text but, per the guard's own
    header, never actually executed in CI.
    """
    current = _current_spec_text()

    if os.environ.get("UPDATE_OPENAPI_SNAPSHOT"):
        SPEC_PATH.write_text(current, encoding="utf-8")
        return

    assert SPEC_PATH.exists(), f"{SPEC_PATH} is missing. Regenerate it: {REGEN_COMMAND}"

    committed = SPEC_PATH.read_text(encoding="utf-8")
    assert committed == current, (
        f"{SPEC_PATH} is stale relative to the live FastAPI app — a Pydantic "
        "model or route changed without regenerating the committed spec.\n"
        f"Regenerate: {REGEN_COMMAND}\n"
        "Then run: bash scripts/checks/openapi-codegen-drift-guard.sh --write "
        "(keeps frontend/lib/generated/ and the manifest in sync too)."
    )
