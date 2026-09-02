"""
Module:   test_meh1938_ch5a_latlng_owner_path
Purpose:  Lock the owner write path for `lat` / `lng` closed. Chunk 4 (MEH-2058)
          deleted the dashboard card that sent them, so `PUT /producers/me`
          accepted coordinates no owner UI could produce — and wrote them to
          the columns ONLY, never to `producer_locations`. After chunk 5a
          removed every fallback read of those columns, a coordinate written
          here would have been invisible to the map, to "near me" and to the
          submit gate: the last owner-side drift path.
Does NOT: test the admin (`admin.py`, which dual-writes the row — MEH-2059),
          import (`producer_import.py`) or seed write paths — those stay open
          by design. `city` is closed on this endpoint too — one sub-step
          later than lat/lng, by ruling A (Sapir, 02/09): it sat in
          SENSITIVE_FIELDS (MEH-2073) and the admin ping fired only from here,
          so the pin below first FORCED that ruling and now RECORDS it. Does
          NOT drop the columns (chunk 5b); `city` is not dropped at all (Q3).
Related:  backend/app/routers/producer_me.py (_PRODUCER_WRITABLE_FIELDS) ·
          tests/test_meh1856_closed_write_paths.py (the pattern this mirrors) ·
          tests/test_meh2143_kosher_owner_path.py (the most recent sibling) ·
          backend/app/services/producer_queries.py (upsert_primary_branch_location,
          the path the ADMIN takes — asserted absent here on purpose).
History:  MEH-1938 chunk 5a.2 (creation).
"""

from app.models import Producer, ProducerLocation
from tests.conftest import auth_header, make_producer, make_user
from tests.whitelist_source import read_producer_writable_fields

# make_producer seeds Tel Aviv; the attempt is Haifa, so "unchanged" and
# "changed" are different numbers rather than a coincidence.
SEEDED = (32.0853, 34.7818)
ATTEMPTED = {"lat": 32.7940, "lng": 34.9896}

# Sanity anchor: a field that IS still owner-writable. Without it, every
# assertion here passes in a world where the endpoint writes nothing at all.
STILL_WRITABLE = ("short_description", "טקסט חדש מהבעלים")


def _owner(db):
    user = make_user(db, role="producer")
    producer = make_producer(db)
    user.producer_id = producer.id
    db.commit()
    db.refresh(producer)
    assert (producer.lat, producer.lng) == SEEDED
    return user, producer


def test_owner_put_does_not_persist_lat_lng(client, db):
    """200 and unchanged — ignored, not rejected.

    `lat`/`lng` are still declared on `ProducerUpdate`, so Pydantic parses
    them; the handler's `if field in _PRODUCER_WRITABLE_FIELDS` loop is what
    drops them. 200-and-unchanged rather than 422 is deliberate: it is the
    stronger claim, and it does not break an older client that still submits
    the fields.
    """
    user, producer = _owner(db)

    resp = client.put("/producers/me", json=ATTEMPTED, headers=auth_header(user))

    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert (producer.lat, producer.lng) == SEEDED, (
        f"coordinates changed to {(producer.lat, producer.lng)} — the owner "
        f"write path must be closed (MEH-1938 chunk 5a)"
    )


def test_owner_put_lat_lng_creates_no_location_row_either(client, db):
    """The closure must not be "ignored on the columns but routed to the row".

    The ADMIN path dual-writes the primary row when it receives coordinates
    (MEH-2059). The owner path must not: her editor is LocationsEditor, and a
    hidden second writer here would be exactly the two-stores drift this epic
    exists to remove. make_producer creates no rows, so 0 is the exact count.
    """
    user, producer = _owner(db)
    assert db.query(ProducerLocation).filter_by(producer_id=producer.id).count() == 0

    resp = client.put("/producers/me", json=ATTEMPTED, headers=auth_header(user))

    assert resp.status_code == 200, resp.text
    assert db.query(ProducerLocation).filter_by(producer_id=producer.id).count() == 0


def test_a_still_writable_field_does_change(client, db):
    """Control. Read this first on a failure: if it is red, the endpoint is not
    writing at all and the assertions above prove nothing."""
    user, producer = _owner(db)
    field, value = STILL_WRITABLE
    assert getattr(producer, field) != value

    resp = client.put("/producers/me", json={field: value}, headers=auth_header(user))

    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert getattr(producer, field) == value, (
        "the control field did not persist — the endpoint is not writing at all"
    )


def test_city_is_closed_by_ruling_a_02_09(client, db):
    """The inverse of the pin this replaced (`..._deliberately_still_writable`).

    That pin held `city` open until the MEH-2073 coupling was ruled — it did
    its job by forcing a ruling instead of a silent closure. Ruling A (Sapir,
    02/09): close `city` here, drop it from SENSITIVE_FIELDS, move the ping
    into `_sync_producer_city_from_primary` as MEH-2073 chunk 2. Why A and not
    "keep it": since B2 (MEH-2141) `Producer.city` follows the primary
    location row, so an owner PUT of `city` was a second writer racing that
    write-through — the two-stores shape this epic removes — kept alive only
    to protect a ping no UI reached anyway.

    Both halves asserted through the endpoint, not only the parsed source:
    200-and-unchanged, and no location row minted as a side channel.
    """
    whitelist = read_producer_writable_fields()
    assert STILL_WRITABLE[0] in whitelist, "parse returned the wrong set"
    assert "city" not in whitelist

    user, producer = _owner(db)
    assert producer.city == "תל אביב"
    resp = client.put("/producers/me", json={"city": "חיפה"}, headers=auth_header(user))

    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.city == "תל אביב", "city must be ignored, not written"
    assert db.query(ProducerLocation).filter_by(producer_id=producer.id).count() == 0


def test_whitelist_does_not_contain_lat_or_lng():
    """Absence assertion on the parsed source, with the positive control on
    the same parsed object so an empty parse cannot pass it."""
    whitelist = read_producer_writable_fields()
    assert STILL_WRITABLE[0] in whitelist, "parse returned the wrong set"
    present = sorted(f for f in ("lat", "lng") if f in whitelist)
    assert present == [], f"still writable by the owner: {present}"


def test_columns_still_exist_on_the_model():
    """REMOVE-WRITE, not CONTRACT — the column drop is chunk 5b, with its own
    revision. Admin, import and the seeds still write these."""
    assert hasattr(Producer, "lat") and hasattr(Producer, "lng")
