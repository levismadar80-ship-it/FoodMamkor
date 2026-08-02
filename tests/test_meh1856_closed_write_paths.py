"""
Module:   test_meh1856_closed_write_paths
Purpose:  Lock the four ownerless write paths closed — address, slug,
          lactose_free_facility, pickup_points are no longer writable through
          PUT /producers/me. Each was accepted by the API with no editor
          anywhere in the owner dashboard (MEH-1851 dispositions).
Does NOT: test the admin (`admin.py`) or import (`producer_import.py`) write
          paths — those stay open by design and keep their own coverage.
          Column existence is untouched; this is about the owner endpoint only.
Related:  backend/app/routers/producer_me.py (_PRODUCER_WRITABLE_FIELDS) ·
          tests/test_api.py::TestReservedSlugs (slug's own contract)
History:  MEH-1856 (creation), implementing the REMOVE-WRITE dispositions
          from MEH-1851.
"""

import ast
from pathlib import Path

import pytest

from app.models import Producer
import app.routers.producer_me as producer_me_module
from tests.conftest import auth_header, make_producer, make_user


# The four fields this ticket closed, with a value that is unambiguously
# different from the seeded one, so "unchanged" is a real assertion and not a
# coincidence of both sides being falsy.
CLOSED_FIELDS = {
    "address": "רחוב הבדיקה 42",
    "slug": "some-owner-chosen-slug",
    "lactose_free_facility": "dedicated",
    "pickup_points": True,
}

# Sanity anchor: a field that IS still owner-writable. If the whitelist were
# emptied wholesale (or the handler stopped writing at all), the closed-field
# assertions below would still pass while the endpoint was completely broken —
# a green with two causes. This one fails in that world.
STILL_WRITABLE = ("short_description", "טקסט חדש מהבעלים")


@pytest.fixture
def owner_and_producer(db):
    user = make_user(db, role="producer")
    producer = make_producer(db)
    user.producer_id = producer.id
    # Seed a known starting value for every closed field so drift is visible.
    producer.address = "כתובת מקורית 1"
    producer.slug = "original-slug"
    producer.lactose_free_facility = "unknown"
    producer.pickup_points = False
    db.commit()
    db.refresh(producer)
    return user, producer


@pytest.mark.parametrize("field,value", sorted(CLOSED_FIELDS.items()))
def test_closed_field_is_ignored_not_rejected(
    client, db, owner_and_producer, field, value
):
    """PUT succeeds (200) and the column does NOT change.

    Ignored, not 422: all four are still declared on ProducerUpdate
    (schemas.py), so Pydantic parses them happily; the handler's
    `if field in _PRODUCER_WRITABLE_FIELDS` loop is what drops them. Asserting
    200-and-unchanged rather than a rejection is deliberate — it is the
    stronger claim, and it is what actually protects the column.
    """
    user, producer = owner_and_producer
    before = getattr(producer, field)
    assert before != value, "fixture must seed a value different from the attempt"

    resp = client.put("/producers/me", json={field: value}, headers=auth_header(user))

    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert getattr(producer, field) == before, (
        f"{field} changed to {getattr(producer, field)!r} — the owner write path "
        f"must be closed (MEH-1856)"
    )


def test_all_four_sent_together_are_ignored(client, db, owner_and_producer):
    """The realistic attack shape: one payload carrying all four at once."""
    user, producer = owner_and_producer
    before = {f: getattr(producer, f) for f in CLOSED_FIELDS}

    resp = client.put("/producers/me", json=dict(CLOSED_FIELDS), headers=auth_header(user))

    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    changed = {
        f: (before[f], getattr(producer, f))
        for f in CLOSED_FIELDS
        if getattr(producer, f) != before[f]
    }
    assert not changed, f"these closed fields were written: {changed}"


def test_a_still_writable_field_does_change(client, db, owner_and_producer):
    """Control. Without this, every assertion above passes on a broken endpoint
    that writes nothing at all (MEH-1619 / testing.md 'a green with two causes').
    """
    user, producer = owner_and_producer
    field, value = STILL_WRITABLE
    assert getattr(producer, field) != value

    resp = client.put("/producers/me", json={field: value}, headers=auth_header(user))

    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert getattr(producer, field) == value, (
        "the control field did not persist — the endpoint is not writing at all, "
        "so the closed-field assertions above prove nothing"
    )


def _read_whitelist() -> set[str]:
    """Parse _PRODUCER_WRITABLE_FIELDS out of the real source file.

    `_PRODUCER_WRITABLE_FIELDS` is a local built at call time inside
    update_my_producer, so there is no importable object to assert against and
    no constant to introspect. Parsing the shipped source is the next best
    thing and keeps the single-source property that matters: a hand-copied list
    in this file would be free to drift from the set the handler consults.
    """
    # NOT inspect.getfile(update_my_producer): the handler is wrapped by
    # slowapi's @limiter.limit, so that resolves to slowapi/extension.py.
    source = Path(producer_me_module.__file__).read_text(encoding="utf-8")
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign):
            continue
        targets = [t.id for t in node.targets if isinstance(t, ast.Name)]
        if "_PRODUCER_WRITABLE_FIELDS" not in targets:
            continue
        assert isinstance(node.value, ast.Set), "whitelist is no longer a set literal"
        return {
            e.value for e in node.value.elts
            if isinstance(e, ast.Constant) and isinstance(e.value, str)
        }
    raise AssertionError("could not find _PRODUCER_WRITABLE_FIELDS in the source")


def test_whitelist_does_not_contain_the_four():
    """Absence assertion — 4 before this ticket, 0 after."""
    whitelist = _read_whitelist()

    present = sorted(f for f in CLOSED_FIELDS if f in whitelist)
    assert present == [], f"still writable by the owner: {present}"
    # Positive control on the same parsed object: proves the parse found the
    # real set and not an empty/wrong one, which would make the check vacuous.
    assert STILL_WRITABLE[0] in whitelist, (
        f"parsed a set of {len(whitelist)} entries that lacks "
        f"{STILL_WRITABLE[0]!r} — wrong set, so the absence check is vacuous"
    )


def test_columns_still_exist_on_the_model():
    """REMOVE-WRITE, not CONTRACT: the columns stay for admin/import."""
    for field in CLOSED_FIELDS:
        assert hasattr(Producer, field), f"{field} column was dropped — out of scope"
