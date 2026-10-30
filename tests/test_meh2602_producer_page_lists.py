"""MEH-2602: ?producer_id= on the public group-buy and experience lists, so a
business page can show that business's own.

Staging sweep 29/10: the test bakery had an open group buy and an approved
experience, and its page showed neither — nothing could ask for "this
business's". Each test seeds a second business's row that must be excluded,
so a filter that does nothing cannot pass.

DISCRIMINATION: before this change FastAPI ignores the unknown parameter and
both lists return the other business's row too — 2 failed on the old routers.
"""

from tests.conftest import make_producer
from tests.test_experiences import _make_experience, _make_host
from tests.test_group_buys_api import _make_group_buy


def test_group_buys_filtered_to_one_business(client, db):
    mine = make_producer(db, name="מאפייה")
    other = make_producer(db, name="מחלבה")
    gb = _make_group_buy(db, mine)
    _make_group_buy(db, other)

    rows = client.get("/group-buys", params={"producer_id": str(mine.id)}).json()

    assert [r["id"] for r in rows] == [str(gb.id)]


def test_experiences_filtered_to_one_business(client, db):
    host = _make_host(db)
    other_host = _make_host(db)
    ex = _make_experience(db, host, status="approved")
    _make_experience(db, other_host, status="approved")

    rows = client.get(
        "/experiences", params={"producer_id": str(host.producer_id)}
    ).json()

    assert [r["id"] for r in rows] == [str(ex.id)]


def test_control_unfiltered_lists_still_return_everyone(client, db):
    _make_group_buy(db, make_producer(db, name="א"))
    _make_group_buy(db, make_producer(db, name="ב"))
    assert len(client.get("/group-buys").json()) == 2


def test_a_suspended_business_lists_nothing_by_id(client, db):
    """The filter narrows the public listing; it never widens it. A suspended
    business's id returns [] (CI reviewer, #3881)."""
    mine = make_producer(db, name="מושהה")
    _make_group_buy(db, mine)
    mine.status = "suspended"
    db.commit()

    rows = client.get("/group-buys", params={"producer_id": str(mine.id)}).json()

    assert rows == []
