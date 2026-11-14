"""MEH-3128 — GET /group-buys/counts: one number per public status tab, read
through the SAME query the list uses, so a tab's count and its list agree.

The page hides a status tab whose count is 0 (GroupBuysClient.jsx); a count
that disagreed with the list would hide a tab that has rows, or show one that
opens on the empty state.
"""
from datetime import timedelta

from app.utils.clock import utc_now

from test_group_buys_api import _make_group_buy, _producer_user


def _list_len(client, status, city=None):
    params = {"status": status}
    if city:
        params["city"] = city
    r = client.get("/group-buys", params=params)
    assert r.status_code == 200
    return len(r.json())


def test_counts_match_each_tab_list(client, db):
    producer, _ = _producer_user(db)
    _make_group_buy(db, producer, status="open")
    _make_group_buy(db, producer, status="open", city="חיפה")
    _make_group_buy(db, producer, status="funded")
    # past deadline: not in the «פתוחות» list (MEH-2540) — must not be counted
    _make_group_buy(db, producer, status="open", deadline=utc_now() - timedelta(days=1))

    r = client.get("/group-buys/counts")
    assert r.status_code == 200
    body = r.json()
    assert body == {"open": 2, "funded": 1, "fulfilled": 0}
    for status, n in body.items():
        assert n == _list_len(client, status), status


def test_counts_follow_the_city(client, db):
    producer, _ = _producer_user(db)
    _make_group_buy(db, producer, status="open", city="חיפה")
    _make_group_buy(db, producer, status="funded", city="עכו")

    body = client.get("/group-buys/counts", params={"city": "חיפה"}).json()
    assert body == {"open": 1, "funded": 0, "fulfilled": 0}
    assert body["open"] == _list_len(client, "open", "חיפה")


def test_counts_skip_a_pending_business(client, db):
    producer, _ = _producer_user(db, email="pending-gb@example.com", status="pending")
    _make_group_buy(db, producer, status="open")
    assert client.get("/group-buys/counts").json() == {"open": 0, "funded": 0, "fulfilled": 0}


def test_counts_is_not_swallowed_by_the_id_route(client):
    # `/counts` declared after `/{group_buy_id}` would 422 on UUID parsing.
    assert client.get("/group-buys/counts").status_code == 200
