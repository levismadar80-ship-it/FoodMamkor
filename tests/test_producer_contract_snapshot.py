"""
Module:   test_producer_contract_snapshot
Purpose:  Keep a committed record of the producer response contract's field
          names, so the frontend parity guard has something to check against
          without importing Python or reaching the network.
Touches:  writes backend/app/schemas/producer_contract_snapshot.json when
          UPDATE_CONTRACT_SNAPSHOT=1 is set; read-only otherwise.
Does NOT: assert anything about the frontend — that half lives in
          frontend/__tests__/backend-contract-parity.test.js, which reads the
          same file. This side owns only "the snapshot matches the classes".
Related:  backend/app/schemas/schemas.py:1891 (ProducerListOut), :2112
          (ProducerDetailOut); frontend/__tests__/backend-contract-parity.test.js
History:  MEH-1891 (creation)

Why a committed snapshot rather than a direct comparison: pytest and vitest run
in different processes, different languages, and — on a docs-only or
frontend-only diff — different CI jobs. A file both can read is the only shared
channel that needs no new dependency, no codegen pipeline (that is MEH-1748),
and no network at test time.

The Pydantic classes stay the single owner of the fact. This file cannot drift
from them silently: it fails the moment they disagree.

NOTE ON LOCATION: the ticket named backend/tests/. There is no such directory —
this repo's pytest suite lives at the repo root in tests/ (conftest.py there,
`pytest tests/test_api.py` in the Definition of Done, and the "Backend tests
(pytest)" CI job runs it). Putting it under backend/tests/ would have created a
second suite root that nothing runs, which is the opposite of riding the
existing CI legs.
"""

import json
import os
from pathlib import Path

from app.schemas.schemas import ProducerDetailOut, ProducerListOut

SNAPSHOT_PATH = (
    Path(__file__).resolve().parents[1]
    / "backend"
    / "app"
    / "schemas"
    / "producer_contract_snapshot.json"
)

REGEN_COMMAND = (
    "UPDATE_CONTRACT_SNAPSHOT=1 pytest tests/test_producer_contract_snapshot.py"
)

_HEADER = [
    "GENERATED FILE — do not hand-edit.",
    f"Regenerate with: {REGEN_COMMAND}",
    "Owner of this fact: the Pydantic classes in backend/app/schemas/schemas.py",
    "(ProducerListOut:1891, ProducerDetailOut:2112). This file is a committed",
    "copy of their field names so frontend vitest can check Zod against them",
    "without importing Python.",
    "Hand-editing it defeats the guard: the frontend parity test would then be",
    "checking the frontend against itself.",
]


def _current_contract() -> dict:
    return {
        "_README": _HEADER,
        "ProducerListOut": sorted(ProducerListOut.model_fields),
        "ProducerDetailOut": sorted(ProducerDetailOut.model_fields),
    }


def _write(contract: dict) -> None:
    SNAPSHOT_PATH.write_text(
        json.dumps(contract, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )


def test_producer_contract_snapshot_is_current():
    """The committed snapshot equals the live Pydantic field sets.

    Fails on ANY drift — added field, removed field, renamed field — because a
    stale snapshot silently disarms the frontend parity guard: it would keep
    asserting Zod covers yesterday's contract while today's grew a field.
    """
    current = _current_contract()

    if os.environ.get("UPDATE_CONTRACT_SNAPSHOT"):
        _write(current)
        return

    assert SNAPSHOT_PATH.exists(), (
        f"{SNAPSHOT_PATH} is missing. Regenerate it: {REGEN_COMMAND}"
    )

    committed = json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))

    for cls_name in ("ProducerListOut", "ProducerDetailOut"):
        live = set(current[cls_name])
        stored = set(committed.get(cls_name, []))
        added = sorted(live - stored)
        removed = sorted(stored - live)
        assert not added and not removed, (
            f"{cls_name} drifted from the committed snapshot.\n"
            f"  in the class but not the snapshot: {added}\n"
            f"  in the snapshot but not the class: {removed}\n"
            f"Regenerate: {REGEN_COMMAND}\n"
            "Then check frontend/__tests__/backend-contract-parity.test.js — a "
            "new backend field with no Zod counterpart is what this pair exists "
            "to catch."
        )


def test_detail_is_a_superset_of_list():
    """The inheritance the whole design rests on, asserted rather than assumed.

    ProducerDetailOut(ProducerListOut) means there can be no list-only field.
    If that ever stops holding, `ProducerDetailSchema = ProducerListSchema
    .extend(...)` on the frontend stops being the right shape, and the parity
    test's per-class comparison would start passing for the wrong reason.
    """
    list_fields = set(ProducerListOut.model_fields)
    detail_fields = set(ProducerDetailOut.model_fields)
    assert list_fields - detail_fields == set(), (
        "ProducerListOut has fields ProducerDetailOut does not — the subset "
        "relation frontend/lib/schemas.js mirrors with .extend() is broken."
    )
    assert detail_fields - list_fields, "ProducerDetailOut added no fields at all"
