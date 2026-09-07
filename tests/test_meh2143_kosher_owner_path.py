"""
Module:   test_meh2143_kosher_owner_path
Purpose:  Lock the owner write path for the free-text `kosher` field closed.
          Since MEH-986 removed unverified kashrut claims from every consumer
          surface (חוק איסור הונאה בכשרות), an owner could fill in a field no
          visitor could ever see — the same "I wrote it and nobody sees it"
          class as the price alias MEH-1855 retired.
Does NOT: test the admin (`admin.py:552`), import (`producer_import.py:323`,
          sheet column M) or seed write paths — those stay open by design.
          Does NOT touch the kashrut BADGE flow, which is the only owner-facing
          kashrut mechanism and must keep working. Does NOT drop the column,
          and does NOT remove `ProducerOwnerOut.kosher` — the owner still READS
          her historical value, which is what makes the MEH-1439 dashboard hint
          render.
Related:  backend/app/routers/producer_me.py (_PRODUCER_WRITABLE_FIELDS) ·
          tests/test_meh1856_closed_write_paths.py (the pattern this mirrors)
History:  MEH-2143 (creation), MEH-1938 batch B4.
"""

from app.models import Producer
from tests.whitelist_source import read_producer_writable_fields
from tests.conftest import auth_header, make_producer, make_user

SEEDED_KOSHER = "בהשגחת הרבנות המקומית"
ATTEMPTED_KOSHER = 'בד"ץ מהדרין — הצהרה חדשה'

# Sanity anchor: a field that IS still owner-writable. Without it, every
# assertion here passes in a world where the endpoint writes nothing at all.
STILL_WRITABLE = ("short_description", "טקסט חדש מהבעלים")


def _owner(db):
    user = make_user(db, role="producer")
    producer = make_producer(db)
    user.producer_id = producer.id
    producer.kosher = SEEDED_KOSHER
    db.commit()
    db.refresh(producer)
    return user, producer


def test_owner_put_does_not_persist_kosher(client, db):
    """200 and unchanged — ignored, not rejected.

    `kosher` is still declared on `ProducerUpdate`, so Pydantic parses it; the
    handler's `if field in _PRODUCER_WRITABLE_FIELDS` loop is what drops it.
    Asserting 200-and-unchanged rather than a 422 is deliberate: it is the
    stronger claim, and it does not break an older client that still submits
    the field.
    """
    user, producer = _owner(db)
    assert producer.kosher != ATTEMPTED_KOSHER

    resp = client.put(
        "/producers/me",
        json={"kosher": ATTEMPTED_KOSHER},
        headers=auth_header(user),
    )

    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.kosher == SEEDED_KOSHER, (
        f"kosher changed to {producer.kosher!r} — the owner write path must be "
        f"closed (MEH-2143). An unverified kashrut claim is a legal exposure."
    )


def test_a_still_writable_field_does_change(client, db):
    """Control. Read this first on a failure: if it is red, the endpoint is not
    writing at all and the assertion above proves nothing."""
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
    """The realistic shape: one form PUT carrying both. One lands, one does not.

    Separately, a 500 on the first test would be indistinguishable from a
    successful block; together they cannot be confused.
    """
    user, producer = _owner(db)
    field, value = STILL_WRITABLE

    resp = client.put(
        "/producers/me",
        json={"kosher": ATTEMPTED_KOSHER, field: value},
        headers=auth_header(user),
    )

    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.kosher == SEEDED_KOSHER
    assert getattr(producer, field) == value


def test_the_owner_can_still_READ_her_historical_value(client, db):
    """`ProducerOwnerOut.kosher` stays, and this is not a nicety.

    `cards.jsx:1363` gates the MEH-1439 hint on `profile?.kosher?.trim()` — the
    line that tells an owner with a legacy value that her free text drives no
    public «כשר» appearance and points her at the certificate. Drop the field
    from the read schema and that explanation silently disappears for exactly
    the owners who need it.
    """
    user, _ = _owner(db)

    resp = client.get("/producers/me", headers=auth_header(user))

    assert resp.status_code == 200, resp.text
    assert resp.json()["kosher"] == SEEDED_KOSHER


def test_whitelist_does_not_contain_kosher():
    """Absence assertion with a positive control on the same parsed object.

    The control is load-bearing: a parse returning an empty set would satisfy
    the absence check vacuously — the "null that is also the reassuring answer"
    shape .claude/rules/testing.md names.
    """
    whitelist = read_producer_writable_fields()

    assert "kosher" not in whitelist, (
        "kosher is owner-writable again — re-adding it requires shipping an "
        "editor in the same PR, and MEH-986 is why there is none (MEH-2143)"
    )
    assert STILL_WRITABLE[0] in whitelist, (
        f"parsed a set of {len(whitelist)} entries that lacks "
        f"{STILL_WRITABLE[0]!r} — wrong set, so the absence check is vacuous"
    )


def test_the_column_still_exists():
    """REMOVE-WRITE, not CONTRACT: admin, the XLSX import and the seeds still
    write it, and the owner still reads it."""
    assert hasattr(Producer, "kosher")
