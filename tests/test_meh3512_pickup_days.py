"""MEH-3512: a pickup point carries its weekdays and its own order cutoff as
fields — not inside the label.

Covers: round-trip on the owner CRUD (create + partial update), the Hebrew
422s (a day outside DELIVERY_DAYS, a malformed time, half a cutoff), and that
a point with none of the new fields reads exactly as before (public shape
emits [] / null, so the page renders the same row).
"""

from tests.conftest import auth_header, make_producer, make_user


def _owner(db):
    producer = make_producer(db, name="נקודות האיסוף של סנדרה")
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user, producer


def _pickup(**extra):
    body = {"kind": "pickup", "label": "שכונת אלונים", "city": "חיפה", "lat": 32.79, "lng": 34.98}
    body.update(extra)
    return body


def test_days_and_cutoff_round_trip_in_week_order(client, db):
    user, _ = _owner(db)
    resp = client.post(
        "/producers/me/locations",
        json=_pickup(
            pickup_days=["חמישי", "שלישי", "חמישי"],
            order_cutoff_day="רביעי",
            order_cutoff_time="15:00",
        ),
        headers=auth_header(user),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    # Sunday→Saturday, duplicates out.
    assert body["pickup_days"] == ["שלישי", "חמישי"]
    assert (body["order_cutoff_day"], body["order_cutoff_time"]) == ("רביעי", "15:00")


def test_partial_update_leaves_days_and_can_clear_them(client, db):
    user, _ = _owner(db)
    loc = client.post(
        "/producers/me/locations",
        json=_pickup(pickup_days=["שלישי"]),
        headers=auth_header(user),
    ).json()
    renamed = client.put(
        f"/producers/me/locations/{loc['id']}",
        json={"label": "כפר יונה מרכז"},
        headers=auth_header(user),
    )
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["pickup_days"] == ["שלישי"]
    cleared = client.put(
        f"/producers/me/locations/{loc['id']}",
        json={"pickup_days": [], "order_cutoff_day": None, "order_cutoff_time": None},
        headers=auth_header(user),
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["pickup_days"] == []
    assert cleared.json()["order_cutoff_day"] is None


def test_point_without_new_fields_reads_as_before(client, db):
    user, producer = _owner(db)
    resp = client.post("/producers/me/locations", json=_pickup(), headers=auth_header(user))
    assert resp.status_code == 201, resp.text
    assert resp.json()["pickup_days"] == []
    assert resp.json()["order_cutoff_day"] is None
    assert resp.json()["order_cutoff_time"] is None


def _post_422(client, user, **extra):
    resp = client.post("/producers/me/locations", json=_pickup(**extra), headers=auth_header(user))
    assert resp.status_code == 422, resp.text
    return resp.text


def test_unknown_day_is_a_hebrew_422(client, db):
    user, _ = _owner(db)
    assert "יום משלוח לא מוכר" in _post_422(client, user, pickup_days=["Friday"])


def test_bad_time_is_a_hebrew_422(client, db):
    user, _ = _owner(db)
    text = _post_422(client, user, order_cutoff_day="רביעי", order_cutoff_time="25:00")
    assert "שעת סגירת ההזמנות לא תקינה" in text


def test_unknown_cutoff_day_is_a_hebrew_422(client, db):
    user, _ = _owner(db)
    text = _post_422(client, user, order_cutoff_day="Wed", order_cutoff_time="15:00")
    assert "יום סגירת ההזמנות לא מוכר" in text


def test_half_a_cutoff_is_refused(client, db):
    user, _ = _owner(db)
    assert "גם יום וגם שעה" in _post_422(client, user, order_cutoff_time="15:00")
    loc = client.post("/producers/me/locations", json=_pickup(), headers=auth_header(user)).json()
    resp = client.put(
        f"/producers/me/locations/{loc['id']}",
        json={"order_cutoff_day": "רביעי"},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


def _put(client, user, loc_id, body):
    return client.put(f"/producers/me/locations/{loc_id}", json=body, headers=auth_header(user))


def _point_with_cutoff(client, user):
    body = _pickup(pickup_days=["חמישי"], order_cutoff_day="רביעי", order_cutoff_time="15:00")
    return client.post("/producers/me/locations", json=body, headers=auth_header(user)).json()


def test_clearing_one_half_of_a_stored_cutoff_is_refused(client, db):
    # Review finding: the pair was checked on the body only, so this stored
    # 15:00 with no day.
    user, _ = _owner(db)
    loc = _point_with_cutoff(client, user)
    resp = _put(client, user, loc["id"], {"order_cutoff_day": None})
    assert resp.status_code == 422, resp.text
    assert "גם יום וגם שעה" in resp.json()["detail"]
    db.expire_all()
    from app.models import ProducerLocation

    row = db.get(ProducerLocation, loc["id"])
    assert (row.order_cutoff_day, row.order_cutoff_time) == ("רביעי", "15:00")


def test_changing_only_the_day_keeps_the_stored_time(client, db):
    user, _ = _owner(db)
    loc = _point_with_cutoff(client, user)
    resp = _put(client, user, loc["id"], {"order_cutoff_day": "שלישי"})
    assert resp.status_code == 200, resp.text
    assert (resp.json()["order_cutoff_day"], resp.json()["order_cutoff_time"]) == ("שלישי", "15:00")


def test_a_point_turned_into_a_branch_drops_its_schedule(client, db):
    user, _ = _owner(db)
    loc = _point_with_cutoff(client, user)
    resp = _put(client, user, loc["id"], {"kind": "branch"})
    assert resp.status_code == 200, resp.text
    out = resp.json()
    assert (out["pickup_days"], out["order_cutoff_day"], out["order_cutoff_time"]) == ([], None, None)
