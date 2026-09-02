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
Related:  classes ProducerListOut / ProducerDetailOut in
          backend/app/schemas/schemas.py — grep the names rather than trusting a
          line number; both moved twice on 2026-08-03 alone.
          frontend/__tests__/backend-contract-parity.test.js
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
from typing import get_args

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
    "Owner of this fact: classes ProducerListOut and ProducerDetailOut in",
    "backend/app/schemas/schemas.py. Deliberately no line numbers — they moved",
    "twice on 2026-08-03 alone; grep the class names, or just run the command",
    "above. This file is a committed copy of their field names so frontend",
    "vitest can check Zod against them without importing Python.",
    "Hand-editing it defeats the guard: the frontend parity test would then be",
    "checking the frontend against itself.",
]


def _nested_model(annotation):
    """Return the BaseModel class a field annotation wraps, or None.

    Unwraps `X | None`, `Optional[X]`, `list[X]`, `list[X] | None` — the four
    shapes the two producer classes actually use (categories, delivery_areas,
    locations are `list[Model]`; active_offer is `Model | None`). Anything
    deeper (dict[str, Model], nested lists) returns None on purpose: it does
    not occur today, and a silent guess here would be the parity test
    checking a shape nobody serves.
    """
    from pydantic import BaseModel

    if isinstance(annotation, type) and issubclass(annotation, BaseModel):
        return annotation
    for arg in get_args(annotation):
        if arg is type(None):
            continue
        found = _nested_model(arg)
        if found is not None:
            return found
    return None


def _served_keys(model) -> list[str]:
    """Field names AS SERVED — serialization_alias wins over the attribute.

    ProducerLocationOut.location_precision is served as `precision`
    (schemas.py, `serialization_alias="precision"`); the Zod side declares the
    wire name, so the wire name is what the snapshot must carry.
    """
    return sorted(
        (f.serialization_alias or name) for name, f in model.model_fields.items()
    )


def _nested_contract(cls) -> dict[str, list[str]]:
    """MEH-1896: `{"<Class>.<field>": [served keys of the nested model]}`.

    The top-level lists above are what MEH-1891 compares; they cannot see a
    key stripped INSIDE `categories[]`, because `categories` itself is
    declared. This map is the nested half of the same contract, keyed by the
    parent field so the frontend can find the matching `z.object` literal.
    """
    out = {}
    for name, field in cls.model_fields.items():
        model = _nested_model(field.annotation)
        if model is not None:
            out[f"{cls.__name__}.{name}"] = _served_keys(model)
    return out


def _current_contract() -> dict:
    nested = {}
    nested.update(_nested_contract(ProducerListOut))
    nested.update(_nested_contract(ProducerDetailOut))
    return {
        "_README": _HEADER,
        "ProducerListOut": sorted(ProducerListOut.model_fields),
        "ProducerDetailOut": sorted(ProducerDetailOut.model_fields),
        "nested": dict(sorted(nested.items())),
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

    # MEH-1896: the nested half drifts the same way and is checked the same
    # way. A key added to CategoryOut must show up here, or the frontend
    # nested-parity test keeps asserting against yesterday's inner shape.
    live_nested = current["nested"]
    stored_nested = committed.get("nested")
    assert stored_nested is not None, (
        f"{SNAPSHOT_PATH} has no 'nested' map — regenerate: {REGEN_COMMAND}"
    )
    assert live_nested == stored_nested, (
        "The nested contract drifted from the committed snapshot.\n"
        f"  live:   {live_nested}\n"
        f"  stored: {stored_nested}\n"
        f"Regenerate: {REGEN_COMMAND}"
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
