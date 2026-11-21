"""MEH-3597 — a group buy's pickup window (date + hours), optional, beside the
free-text pickup note. Before: only free text, so the card and page could not
say «איסוף: שישי 5.12, 9:00–13:00» the way a rescue bag does."""

from datetime import timedelta

from conftest import auth_header
from test_group_buys_api import _make_group_buy, _producer_user
from app.utils.clock import utc_now


def _payload(**over):
    deadline = utc_now() + timedelta(days=5)
    body = {
        "title": "קמח כוסמין מלא",
        "product_name": "שק קמח",
        "price_per_unit_regular": "18",
        "price_per_unit_group": "13",
        "min_participants": 2,
        "deadline": deadline.isoformat(),
        "pickup_note": "איסוף מהטחנה",
    }
    body.update(over)
    return body


def test_create_with_a_window_stores_it_naive_utc_and_returns_it(client, db):
    _, owner = _producer_user(db, email="pw1@example.com")
    r = client.post(
        "/group-buys",
        json=_payload(pickup_starts_at="2099-12-05T09:00:00+02:00", pickup_ends_at="2099-12-05T13:00:00+02:00"),
        headers=auth_header(owner),
    )
    assert r.status_code == 201, r.text
    gb_id = r.json()["id"]
    detail = client.get(f"/group-buys/{gb_id}").json()
    assert detail["pickup_starts_at"].startswith("2099-12-05T07:00:00")
    assert detail["pickup_ends_at"].startswith("2099-12-05T11:00:00")


def test_without_a_window_nothing_changes(client, db):
    _, owner = _producer_user(db, email="pw2@example.com")
    r = client.post("/group-buys", json=_payload(), headers=auth_header(owner))
    assert r.status_code == 201
    assert client.get(f"/group-buys/{r.json()['id']}").json()["pickup_starts_at"] is None


def test_half_a_window_or_a_reversed_one_is_refused(client, db):
    _, owner = _producer_user(db, email="pw3@example.com")
    h = auth_header(owner)
    assert client.post("/group-buys", json=_payload(pickup_starts_at="2099-12-05T09:00:00Z"), headers=h).status_code == 422
    assert client.post(
        "/group-buys",
        json=_payload(pickup_starts_at="2099-12-05T13:00:00Z", pickup_ends_at="2099-12-05T09:00:00Z"),
        headers=h,
    ).status_code == 422
    assert client.post(
        "/group-buys",
        json=_payload(pickup_starts_at="2099-12-01T09:00:00Z", pickup_ends_at="2099-12-09T09:00:00Z"),
        headers=h,
    ).status_code == 422


def test_owner_sets_and_clears_the_window_in_settings(client, db):
    producer, owner = _producer_user(db, email="pw4@example.com")
    gb = _make_group_buy(db, producer)
    h = auth_header(owner)
    r = client.patch(
        f"/group-buys/{gb.id}/settings",
        json={"pickup_starts_at": "2099-12-05T07:00:00Z", "pickup_ends_at": "2099-12-05T11:00:00Z"},
        headers=h,
    )
    assert r.status_code == 200, r.text
    db.refresh(gb)
    assert gb.pickup_starts_at.hour == 7 and gb.pickup_ends_at.hour == 11
    assert client.patch(f"/group-buys/{gb.id}/settings", json={"pickup_starts_at": "2099-12-05T07:00:00Z"}, headers=h).status_code == 422
    cleared = client.patch(f"/group-buys/{gb.id}/settings", json={"pickup_starts_at": None, "pickup_ends_at": None}, headers=h)
    assert cleared.status_code == 200, cleared.text
    db.refresh(gb)
    assert gb.pickup_starts_at is None and gb.pickup_ends_at is None


# MEH-3597 review round 1.
def test_exactly_a_week_is_accepted(client, db):
    _, owner = _producer_user(db, email="pw5@example.com")
    r = client.post(
        "/group-buys",
        json=_payload(pickup_starts_at="2099-12-01T09:00:00Z", pickup_ends_at="2099-12-08T09:00:00Z"),
        headers=auth_header(owner),
    )
    assert r.status_code == 201, r.text


def test_pickup_before_the_deadline_is_refused_on_create(client, db):
    _, owner = _producer_user(db, email="pw6@example.com")
    soon = utc_now() + timedelta(days=1)
    r = client.post(
        "/group-buys",
        json=_payload(pickup_starts_at=soon.isoformat(), pickup_ends_at=(soon + timedelta(hours=2)).isoformat()),
        headers=auth_header(owner),
    )
    assert r.status_code == 422
    assert "המועד האחרון" in r.text


def test_pickup_before_the_deadline_is_refused_in_settings(client, db):
    producer, owner = _producer_user(db, email="pw7@example.com")
    gb = _make_group_buy(db, producer)
    start = gb.deadline - timedelta(hours=1)
    r = client.patch(
        f"/group-buys/{gb.id}/settings",
        json={"pickup_starts_at": start.isoformat(), "pickup_ends_at": (start + timedelta(hours=3)).isoformat()},
        headers=auth_header(owner),
    )
    assert r.status_code == 400
    db.refresh(gb)
    assert gb.pickup_starts_at is None


def test_an_out_of_range_aware_date_is_a_422_not_a_500(client, db):
    _, owner = _producer_user(db, email="pw8@example.com")
    r = client.post(
        "/group-buys",
        json=_payload(pickup_starts_at="9999-12-31T23:00:00-10:00", pickup_ends_at="9999-12-31T23:30:00-10:00"),
        headers=auth_header(owner),
    )
    assert r.status_code == 422


def test_a_stranger_cannot_set_the_window(client, db):
    producer, _ = _producer_user(db, email="pw9@example.com")
    _, other = _producer_user(db, email="pw10@example.com")
    gb = _make_group_buy(db, producer)
    r = client.patch(
        f"/group-buys/{gb.id}/settings",
        json={"pickup_starts_at": "2099-12-05T07:00:00Z", "pickup_ends_at": "2099-12-05T11:00:00Z"},
        headers=auth_header(other),
    )
    assert r.status_code in (403, 404)
    db.refresh(gb)
    assert gb.pickup_starts_at is None
