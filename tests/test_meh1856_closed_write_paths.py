"""
Module:   test_meh1856_closed_write_paths
Purpose:  Lock the ownerless write paths closed — address, slug,
          lactose_free_facility, pickup_points, name and is_available_today
          are no longer writable through PUT /producers/me.
          Each was accepted by the API with no editor anywhere in the owner
          dashboard (MEH-1851 dispositions).
Does NOT: test the admin (`admin.py`) or import (`producer_import.py`) write
          paths — those stay open by design and keep their own coverage.
          Column existence is untouched; this is about the owner endpoint only.
          Does NOT cover the OTHER paths that legitimately write
          `is_available_today` (POST /producers/me/availability-state and the
          legacy /availability toggle) — those are `test_availability_*`'s.
Related:  backend/app/routers/producer_me.py (_PRODUCER_WRITABLE_FIELDS) ·
          tests/test_api.py::TestReservedSlugs (slug's own contract)
History:  MEH-1856 (creation), implementing the first four REMOVE-WRITE
          dispositions from MEH-1851; MEH-1851 rows 1/19/39 (extension) added
          name, starting_price_label, is_available_today after Sapir's 03/08
          ruling changed the first two from EXPOSE to REMOVE-WRITE.
          MEH-1855 chunk 2 (revision 9849fab1637a) then DROPPED the
          starting_price_label column outright — it left CLOSED_FIELDS (a
          closed write path presumes a column) and is asserted ABSENT below.
"""

import pytest

from app.models import Producer
from app.schemas.schemas import ProducerDetailOut, ProducerListOut, ProducerUpdate
from tests.whitelist_source import read_producer_writable_fields
from tests.conftest import auth_header, make_producer, make_user


# The four fields this ticket closed, with a value that is unambiguously
# different from the seeded one, so "unchanged" is a real assertion and not a
# coincidence of both sides being falsy.
CLOSED_FIELDS = {
    "address": "רחוב הבדיקה 42",
    "slug": "some-owner-chosen-slug",
    "lactose_free_facility": "dedicated",
    "pickup_points": True,
    # MEH-1851 rows 1 · 19 · 39 (Sapir's ruling, 03/08). Rows 1 and 39 are
    # declared on ProducerUpdate (grep `name` / `is_available_today` in
    # schemas.py), so they parse and are dropped by the handler's whitelist
    # loop — the same ignored-not-rejected shape as the four above. Row 19
    # (the price alias) is gone: MEH-1855 chunk 2 dropped its column, see
    # test_dropped_price_alias_is_absent_everywhere below.
    "name": "שם עסק אחר לגמרי",
    "is_available_today": True,
}

# MEH-1855 chunk 2: the alias column this file used to lock closed. Kept as a
# string, never as an attribute, so the absence test below cannot accidentally
# depend on the thing it asserts is gone.
DROPPED_PRICE_ALIAS = "starting_price_label"

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
    producer.name = "השם המקורי של העסק"
    producer.is_available_today = False
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


def test_all_closed_fields_sent_together_are_ignored(client, db, owner_and_producer):
    """The realistic attack shape: one payload carrying every closed field."""
    user, producer = owner_and_producer
    before = {f: getattr(producer, f) for f in CLOSED_FIELDS}

    resp = client.put(
        "/producers/me", json=dict(CLOSED_FIELDS), headers=auth_header(user)
    )

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


def test_whitelist_does_not_contain_any_closed_field():
    """Absence assertion — every closed field appears 0 times in the whitelist.

    Numeric form (removal spec, per_ticket_protocol.2): 6 fields checked,
    expected exactly 0 present, not 1. MEH-1856 closed 4; MEH-1851 rows
    1/19/39 closed 3 more, and MEH-1855 chunk 2 then dropped row 19's column
    (so it is no longer a "closed write path" — it is no column at all).
    """
    whitelist = read_producer_writable_fields()

    assert len(CLOSED_FIELDS) == 6, (
        f"expected 6 closed fields, got {len(CLOSED_FIELDS)} — update this count "
        f"deliberately when a disposition adds one, so the absence assertion "
        f"cannot silently shrink"
    )
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


def test_dropped_price_alias_is_absent_everywhere():
    """MEH-1855 chunk 2 (contract step): removal is verified by ABSENCE.

    The alias is gone from the ORM model, from the owner-update schema, from
    both public response contracts, and from the owner whitelist — 0 of 5
    surfaces carry it. `price_range` on the same surfaces is the positive
    control: if the model/schema imports resolved to the wrong classes, the
    control fails instead of every absence passing vacuously.
    """
    surfaces = {
        "Producer (ORM)": set(Producer.__table__.columns.keys()),
        "ProducerUpdate": set(ProducerUpdate.model_fields),
        "ProducerListOut": set(ProducerListOut.model_fields),
        "ProducerDetailOut": set(ProducerDetailOut.model_fields),
        "_PRODUCER_WRITABLE_FIELDS": set(read_producer_writable_fields()),
    }
    still_there = sorted(
        n for n, keys in surfaces.items() if DROPPED_PRICE_ALIAS in keys
    )
    assert still_there == [], (
        f"{DROPPED_PRICE_ALIAS} was dropped by MEH-1855 chunk 2 (9849fab1637a) "
        f"but is still declared on: {still_there}"
    )
    # Positive control — the canonical field is present on every surface that
    # serves or edits a price label (the whitelist opens price_range to the
    # owner via PricingCard).
    missing_control = sorted(
        n for n, keys in surfaces.items() if "price_range" not in keys
    )
    assert missing_control == [], (
        f"control failed — price_range missing from {missing_control}; the "
        f"surfaces above were not what this test thinks they are"
    )
