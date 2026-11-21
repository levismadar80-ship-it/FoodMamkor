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
    for gb in (late, soon, done):
        _join(db, gb, me)
    ids = [
        r["id"]
        for r in client.get("/users/me/group-buys", headers=auth_header(me)).json()[
            "group_buys"
        ]
    ]
    assert ids == [str(soon.id), str(late.id), str(done.id)]


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
