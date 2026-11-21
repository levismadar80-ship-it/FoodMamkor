"""MEH-3610 — a group buy says what a rescue bag says: the allergens the
business declares, the branch people pick up from, and a reminder before
pickup (Sapir 21/11: «מאשרת», «כן, שתיהן»)."""

from datetime import datetime, timedelta
from unittest import mock

from conftest import auth_header, make_user
from test_group_buys_api import _make_group_buy, _producer_user, _valid_create_payload
from app.models.models import GroupBuy, GroupBuyCommit, ProducerLocation
from app.services import group_buy_pickup_reminder as reminder
from app.utils.clock import utc_now


def _branch(db, producer, *, precision="exact", label="הסניף בכרמל"):
    loc = ProducerLocation(
        producer_id=producer.id,
        kind="branch",
        label=label,
        city="חיפה",
        address="הרצל 5",
        lat=32.81,
        lng=34.99,
        location_precision=precision,
    )
    db.add(loc)
    db.commit()
    return loc


def _create(client, user, **over):
    return client.post(
        "/group-buys", json=_valid_create_payload(**over), headers=auth_header(user)
    )


# --- create + read ---------------------------------------------------------


def test_create_with_allergens_and_own_branch_shows_both(client, db):
    producer, user = _producer_user(db, email="p3610a@example.com")
    loc = _branch(db, producer)
    r = _create(
        client,
        user,
        allergens=["milk", "gluten", "milk"],
        pickup_location_id=str(loc.id),
    )
    assert r.status_code == 201, r.text
    gb = client.get(f"/group-buys/{r.json()['id']}").json()
    # Canonical order, de-duplicated — the bag's rule (normalize_allergens).
    assert gb["allergens"] == ["gluten", "milk"]
    assert gb["pickup_location"] == {
        "id": str(loc.id),
        "label": "הסניף בכרמל",
        "city": "חיפה",
        "address": "הרצל 5",
        "lat": 32.81,
        "lng": 34.99,
    }


def test_nothing_declared_reads_null_not_an_empty_list(client, db):
    producer, user = _producer_user(db, email="p3610b@example.com")
    r = _create(client, user, allergens=[])
    gb = client.get(f"/group-buys/{r.json()['id']}").json()
    # [] would read as «contains none» — a claim nobody made (MEH-2752).
    assert gb["allergens"] is None
    assert gb["pickup_location"] is None


def test_an_unknown_allergen_is_422(client, db):
    _, user = _producer_user(db, email="p3610c@example.com")
    assert _create(client, user, allergens=["gluten", "glutten"]).status_code == 422


def test_another_business_branch_is_404_and_creates_nothing(client, db):
    producer, user = _producer_user(db, email="p3610d@example.com")
    other, _ = _producer_user(db, email="p3610e@example.com")
    theirs = _branch(db, other)
    r = _create(client, user, pickup_location_id=str(theirs.id))
    assert r.status_code == 404
    assert db.query(GroupBuy).filter(GroupBuy.producer_id == producer.id).count() == 0


def test_an_approximate_branch_keeps_its_street_and_pin_off_the_page(client, db):
    producer, user = _producer_user(db, email="p3610f@example.com")
    loc = _branch(db, producer, precision="approximate")
    r = _create(client, user, pickup_location_id=str(loc.id))
    place = client.get(f"/group-buys/{r.json()['id']}").json()["pickup_location"]
    assert place["city"] == "חיפה" and place["label"] == "הסניף בכרמל"
    assert place["address"] is None and place["lat"] is None and place["lng"] is None


def test_a_deleted_branch_leaves_the_group_without_a_place(client, db):
    producer, user = _producer_user(db, email="p3610g@example.com")
    loc = _branch(db, producer)
    r = _create(client, user, pickup_location_id=str(loc.id))
    db.delete(loc)
    db.commit()
    db.expire_all()
    assert client.get(f"/group-buys/{r.json()['id']}").json()["pickup_location"] is None


# --- settings --------------------------------------------------------------


def _settings(client, user, gb, body):
    return client.patch(
        f"/group-buys/{gb.id}/settings", json=body, headers=auth_header(user)
    )


def test_owner_sets_and_clears_allergens_and_branch_after_joining_closed(client, db):
    producer, user = _producer_user(db, email="p3610h@example.com")
    loc = _branch(db, producer)
    # Funded and past its deadline: caps are frozen, safety facts are not.
    gb = _make_group_buy(
        db, producer, status="funded", deadline=utc_now() - timedelta(hours=1)
    )
    r = _settings(
        client, user, gb, {"allergens": ["sesame"], "pickup_location_id": str(loc.id)}
    )
    assert r.status_code == 200, r.text
    db.refresh(gb)
    assert gb.allergens == ["sesame"] and gb.pickup_location_id == loc.id
    r = _settings(client, user, gb, {"allergens": None, "pickup_location_id": None})
    assert r.status_code == 200
    db.refresh(gb)
    assert gb.allergens is None and gb.pickup_location_id is None


def test_a_field_left_out_is_unchanged(client, db):
    producer, user = _producer_user(db, email="p3610i@example.com")
    loc = _branch(db, producer)
    gb = _make_group_buy(db, producer)
    _settings(client, user, gb, {"allergens": ["eggs"], "pickup_location_id": str(loc.id)})
    _settings(client, user, gb, {"max_units": 50})
    db.refresh(gb)
    assert gb.allergens == ["eggs"] and gb.pickup_location_id == loc.id


def test_settings_refuse_another_business_branch(client, db):
    producer, user = _producer_user(db, email="p3610j@example.com")
    other, _ = _producer_user(db, email="p3610k@example.com")
    theirs = _branch(db, other)
    gb = _make_group_buy(db, producer)
    r = _settings(client, user, gb, {"pickup_location_id": str(theirs.id)})
    assert r.status_code == 404
    db.refresh(gb)
    assert gb.pickup_location_id is None


def test_a_stranger_cannot_change_them(client, db):
    producer, _ = _producer_user(db, email="p3610l@example.com")
    gb = _make_group_buy(db, producer)
    stranger = make_user(db, email="p3610m@example.com")
    r = _settings(client, stranger, gb, {"allergens": ["milk"]})
    assert r.status_code in (403, 404)
    db.refresh(gb)
    assert gb.allergens is None


# --- the reminder before pickup ---------------------------------------------

# 15:00 UTC = 17:00 Israel in winter, the job's hour.
NOW = datetime(2026, 12, 3, 15, 0)


def _funded_with_pickup(db, producer, starts, **fields):
    gb = _make_group_buy(db, producer, status="funded", deadline=NOW - timedelta(days=1))
    gb.pickup_starts_at = starts
    gb.pickup_ends_at = starts + timedelta(hours=3)
    for key, value in fields.items():
        setattr(gb, key, value)
    db.commit()
    return gb


def _join(db, gb, email):
    user = make_user(db, email=email)
    db.add(GroupBuyCommit(group_buy_id=gb.id, user_id=user.id, quantity=1))
    db.commit()
    return user


def _run(db):
    with mock.patch(
        "app.services.group_buy_notifications._send_email"
    ) as send:
        count = reminder.send_pickup_reminders(db, now=NOW)
    return count, send


def test_each_participant_is_reminded_once_with_time_and_place(db):
    producer, _ = _producer_user(db, email="p3610n@example.com")
    loc = _branch(db, producer)
    # Tomorrow 09:00 Israel.
    gb = _funded_with_pickup(
        db,
        producer,
        datetime(2026, 12, 4, 7, 0),
        pickup_location_id=loc.id,
        pickup_note="בכניסה לחנות",
    )
    _join(db, gb, "r1@example.com")
    _join(db, gb, "r2@example.com")
    count, send = _run(db)
    assert count == 1
    assert sorted(c.args[0] for c in send.call_args_list) == [
        "r1@example.com",
        "r2@example.com",
    ]
    body = send.call_args_list[0].args[2]
    assert "מקום איסוף: הסניף בכרמל — הרצל 5, חיפה" in body
    assert "מועד איסוף: יום שישי 4.12, 09:00–12:00" in body
    assert "איסוף: בכניסה לחנות" in body
    # PRIVACY CONTRACT (group_buy_notifications): no participant address.
    assert "r1@example.com" not in body and "r2@example.com" not in body
    db.refresh(gb)
    assert gb.pickup_reminder_sent_at == NOW
    # A second run (or a restart) sends nothing again.
    count, send = _run(db)
    assert count == 0 and send.call_count == 0


def test_only_funded_groups_with_a_pickup_by_end_of_tomorrow(db):
    producer, _ = _producer_user(db, email="p3610o@example.com")
    later_today = _funded_with_pickup(db, producer, datetime(2026, 12, 3, 17, 0))
    in_three_days = _funded_with_pickup(db, producer, datetime(2026, 12, 6, 7, 0))
    already_past = _funded_with_pickup(db, producer, datetime(2026, 12, 3, 10, 0))
    still_open = _funded_with_pickup(
        db, producer, datetime(2026, 12, 4, 7, 0), status="open"
    )
    cancelled = _funded_with_pickup(
        db, producer, datetime(2026, 12, 4, 7, 0), status="cancelled"
    )
    no_window = _make_group_buy(db, producer, status="funded")
    for i, gb in enumerate(
        (later_today, in_three_days, already_past, still_open, cancelled, no_window)
    ):
        _join(db, gb, f"w{i}@example.com")
    count, send = _run(db)
    assert count == 1
    assert [c.args[0] for c in send.call_args_list] == ["w0@example.com"]


def test_a_delivery_only_group_is_stamped_and_not_mailed(db):
    producer, _ = _producer_user(db, email="p3610p@example.com")
    gb = _funded_with_pickup(
        db,
        producer,
        datetime(2026, 12, 4, 7, 0),
        delivery_note="משלוח עד הבית",
        pickup_note=None,
        fulfillment_note=None,
    )
    _join(db, gb, "d1@example.com")
    count, send = _run(db)
    assert count == 0 and send.call_count == 0
    db.refresh(gb)
    assert gb.pickup_reminder_sent_at == NOW


def test_a_business_no_longer_public_sends_no_reminder(db):
    producer, _ = _producer_user(db, email="p3610q@example.com")
    gb = _funded_with_pickup(db, producer, datetime(2026, 12, 4, 7, 0))
    _join(db, gb, "h1@example.com")
    producer.status = "inactive"
    db.commit()
    count, send = _run(db)
    assert count == 0 and send.call_count == 0
