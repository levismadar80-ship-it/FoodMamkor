"""MEH-3609 — «הקבוצות שלי»: GET /users/me/group-buys lists the group buys
the caller joined, so she can get back to one without the email link."""

from datetime import timedelta

from conftest import auth_header, make_user
from test_group_buys_api import _make_group_buy, _producer_user
from app.models.models import GroupBuyCommit
from app.utils.clock import utc_now


def _join(db, gb, user, quantity=1):
    db.add(GroupBuyCommit(group_buy_id=gb.id, user_id=user.id, quantity=quantity))
    db.commit()


def test_signed_out_is_401(client):
    assert client.get("/users/me/group-buys").status_code == 401


def test_empty_when_she_joined_nothing(client, db):
    me = make_user(db, email="mine0@example.com")
    r = client.get("/users/me/group-buys", headers=auth_header(me))
    assert r.status_code == 200
    assert r.json() == {"group_buys": []}
    assert "no-store" in r.headers["cache-control"]


def test_only_her_own_rows_with_her_quantity(client, db):
    producer, _ = _producer_user(db, email="mineowner@example.com")
    me = make_user(db, email="mine1@example.com")
    other = make_user(db, email="mine2@example.com")
    mine = _make_group_buy(db, producer)
    theirs = _make_group_buy(db, producer)
    _join(db, mine, me, quantity=3)
    _join(db, theirs, other)
    rows = client.get("/users/me/group-buys", headers=auth_header(me)).json()[
        "group_buys"
    ]
    assert [r["id"] for r in rows] == [str(mine.id)]
    assert rows[0]["quantity"] == 3
    assert rows[0]["producer_name"] == producer.name
    assert rows[0]["unit"] == "שק"


def test_running_first_by_nearest_deadline_then_the_rest(client, db):
    producer, _ = _producer_user(db, email="mineowner2@example.com")
    me = make_user(db, email="mine3@example.com")
    now = utc_now()
    late = _make_group_buy(db, producer, deadline=now + timedelta(days=9))
    soon = _make_group_buy(
        db, producer, deadline=now + timedelta(days=2), status="funded"
    )
    done = _make_group_buy(
        db, producer, deadline=now + timedelta(days=20), status="fulfilled"
    )
    gone = _make_group_buy(
        db, producer, deadline=now + timedelta(days=5), status="cancelled"
    )
    # Still "open" but its deadline passed: waits for the expiry job, so it is
    # not running and does not lead the list (review finding).
    lapsed = _make_group_buy(db, producer, deadline=now - timedelta(days=1))
    for gb in (late, soon, done, gone, lapsed):
        _join(db, gb, me)
    ids = _ids(client, me)
    # Running by nearest deadline, then the rest by newest deadline.
    assert ids == [
        str(soon.id),
        str(late.id),
        str(done.id),
        str(gone.id),
        str(lapsed.id),
    ]


def _ids(client, user):
    return [
        r["id"]
        for r in client.get("/users/me/group-buys", headers=auth_header(user)).json()[
            "group_buys"
        ]
    ]


def test_a_group_she_left_drops_off(client, db):
    producer, _ = _producer_user(db, email="mineowner4@example.com")
    me = make_user(db, email="mine5@example.com")
    gb = _make_group_buy(db, producer)
    _join(db, gb, me)
    assert _ids(client, me) == [str(gb.id)]
    left = client.delete(f"/group-buys/{gb.id}/commit", headers=auth_header(me))
    assert left.status_code == 200
    assert _ids(client, me) == []


def test_a_paused_business_is_left_out_too(client, db):
    producer, _ = _producer_user(db, email="mineowner5@example.com")
    me = make_user(db, email="mine6@example.com")
    gb = _make_group_buy(db, producer)
    _join(db, gb, me)
    producer.status = "inactive"  # paused (STATE_MACHINES §2)
    db.commit()
    assert _ids(client, me) == []


def test_a_delivery_only_group_shows_no_pickup_time(client, db):
    # MEH-3597's rule: the card and the page hide a saved window on a
    # delivery-only group, so the list does too.
    producer, _ = _producer_user(db, email="mineowner6@example.com")
    me = make_user(db, email="mine7@example.com")
    start = utc_now() + timedelta(days=10)
    both = _make_group_buy(db, producer)
    delivery = _make_group_buy(db, producer)
    for gb, pickup in ((both, "בחנות"), (delivery, None)):
        gb.pickup_note = pickup
        gb.delivery_note = "משלוח לכל הארץ"
        gb.pickup_starts_at = start
        gb.pickup_ends_at = start + timedelta(hours=3)
        _join(db, gb, me)
    rows = {
        r["id"]: r
        for r in client.get("/users/me/group-buys", headers=auth_header(me)).json()[
            "group_buys"
        ]
    }
    assert rows[str(both.id)]["pickup_starts_at"] is not None
    assert rows[str(delivery.id)]["pickup_starts_at"] is None
    assert rows[str(delivery.id)]["pickup_ends_at"] is None


def test_a_group_of_a_business_no_longer_public_is_left_out(client, db):
    # Its page answers 404 to her (MEH-2484), so the row would be a dead link.
    producer, _ = _producer_user(db, email="mineowner3@example.com")
    me = make_user(db, email="mine4@example.com")
    gb = _make_group_buy(db, producer)
    _join(db, gb, me)
    producer.status = "rejected"
    db.commit()
    assert client.get("/users/me/group-buys", headers=auth_header(me)).json() == {
        "group_buys": []
    }
