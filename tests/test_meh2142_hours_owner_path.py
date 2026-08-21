"""
Module:   test_meh2142_hours_owner_path
Purpose:  Lock the owner write path for `opening_hours` closed. The
          business-level hours editor was removed from the dashboard; store
          hours are a per-location fact the owner edits on her
          `ProducerLocation` rows, and `Producer.opening_hours` survives only
          as a public-page read fallback.
Does NOT: test the admin (`admin.py`) or import (`producer_import.py`) write
          paths — those stay open by design. Does NOT touch
          `ProducerLocation.opening_hours`, which is the field the owner now
          edits and which must keep working (asserted below, because "closed
          the wrong one" is the failure this ticket could actually produce).
          Does NOT drop the column.
Related:  backend/app/routers/producer_me.py (_PRODUCER_WRITABLE_FIELDS) ·
          tests/test_meh1856_closed_write_paths.py (the pattern this mirrors) ·
          frontend/lib/hours.js resolveStoreHours (the reader half)
History:  MEH-2142 (creation), MEH-1938 batch B3.
"""

import ast
from pathlib import Path

from app.models import Producer
import app.routers.producer_me as producer_me_module
from tests.conftest import auth_header, make_producer, make_user

SEEDED_HOURS = "Sun-Thu 09:00-18:00"
ATTEMPTED_HOURS = "Sun-Thu 07:00-23:00, Fri 07:00-14:00"

# Sanity anchor, same role as MEH-1856's: a field that IS still owner-writable.
# Without it, every assertion here passes in a world where the endpoint writes
# nothing at all — a green with two causes.
STILL_WRITABLE = ("short_description", "טקסט חדש מהבעלים")


def _owner(db):
    user = make_user(db, role="producer")
    producer = make_producer(db)
    user.producer_id = producer.id
    producer.opening_hours = SEEDED_HOURS
    db.commit()
    db.refresh(producer)
    return user, producer


def test_owner_put_does_not_persist_opening_hours(client, db):
    """200 and unchanged — ignored, not rejected.

    `opening_hours` is still declared on `ProducerUpdate`, so Pydantic parses
    it happily; the handler's `if field in _PRODUCER_WRITABLE_FIELDS` loop is
    what drops it. Asserting 200-and-unchanged is the stronger claim than
    asserting a 422, and it is what actually protects the column.
    """
    user, producer = _owner(db)
    assert producer.opening_hours != ATTEMPTED_HOURS

    resp = client.put(
        "/producers/me",
        json={"opening_hours": ATTEMPTED_HOURS},
        headers=auth_header(user),
    )

    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.opening_hours == SEEDED_HOURS, (
        f"opening_hours changed to {producer.opening_hours!r} — the owner write "
        f"path must be closed (MEH-2142)"
    )


def test_a_still_writable_field_does_change(client, db):
    """Control. Run this first when reading a failure: if it is red, the
    endpoint is not writing at all and the assertion above proves nothing."""
    user, producer = _owner(db)
    field, value = STILL_WRITABLE
    assert getattr(producer, field) != value

    resp = client.put("/producers/me", json={field: value}, headers=auth_header(user))

    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert getattr(producer, field) == value, (
        "the control field did not persist — the endpoint is not writing at all"
    )


def test_the_two_are_independent_in_one_payload(client, db):
    """The realistic shape: a form PUT carrying both. One must land, one must not.

    Sending them together is what distinguishes "the whitelist dropped
    opening_hours" from "this request failed"; separately, a 500 on the first
    test would look identical to a successful block.
    """
    user, producer = _owner(db)
    field, value = STILL_WRITABLE

    resp = client.put(
        "/producers/me",
        json={"opening_hours": ATTEMPTED_HOURS, field: value},
        headers=auth_header(user),
    )

    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.opening_hours == SEEDED_HOURS
    assert getattr(producer, field) == value


def test_the_owner_can_still_write_hours_on_a_location(client, db):
    """The other half, and the one that makes this ticket a MOVE not a REMOVAL.

    Closing the business-level path is only correct because a per-location path
    exists. If this ever breaks, the owner has NO way to state her hours at
    all — which is strictly worse than the duplication the ticket set out to
    fix. Asserted here rather than assumed from the locations CRUD suite,
    because that suite would stay green in exactly that world.
    """
    user, _ = _owner(db)

    created = client.post(
        "/producers/me/locations",
        json={
            "kind": "branch",
            "city": "חיפה",
            "lat": 32.79,
            "lng": 34.98,
            "opening_hours": ATTEMPTED_HOURS,
        },
        headers=auth_header(user),
    )

    assert created.status_code == 201, created.text
    assert created.json()["opening_hours"] == ATTEMPTED_HOURS
    assert created.json()["is_primary"] is True


def _read_whitelist() -> set[str]:
    """Parse `_PRODUCER_WRITABLE_FIELDS` out of the real source file.

    REUSES: tests/test_meh1856_closed_write_paths.py:_read_whitelist — the set
    is a local built at call time inside `update_my_producer`, so there is no
    importable object; and `inspect.getfile` on the handler resolves to
    slowapi's wrapper, not this module.
    """
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
            e.value
            for e in node.value.elts
            if isinstance(e, ast.Constant) and isinstance(e.value, str)
        }
    raise AssertionError("could not find _PRODUCER_WRITABLE_FIELDS in the source")


def test_whitelist_does_not_contain_opening_hours():
    """Absence assertion, with a positive control on the same parsed object.

    The control is not decoration: a parse that returned an empty set would
    satisfy the absence check vacuously, which is the exact shape
    .claude/rules/testing.md calls a null that is also the reassuring answer.
    """
    whitelist = _read_whitelist()

    assert "opening_hours" not in whitelist, (
        "opening_hours is owner-writable again — re-adding it requires shipping "
        "its editor in the same PR (MEH-2142)"
    )
    assert STILL_WRITABLE[0] in whitelist, (
        f"parsed a set of {len(whitelist)} entries that lacks "
        f"{STILL_WRITABLE[0]!r} — wrong set, so the absence check is vacuous"
    )


def test_the_column_still_exists():
    """REMOVE-WRITE, not CONTRACT. The public page still reads this as a
    fallback, and admin/import still write it."""
    assert hasattr(Producer, "opening_hours")
