"""MEH-3339 — optional second phone + label.

Covers: owner save/clear, admin save, same format rule as `phone`, label
without number → 422, label sanitized + capped at 30, public detail carries
both, and the main phone (+ its verification) is untouched by the second one.
"""

from tests.conftest import auth_header, make_producer, make_user


def _owner(db, **kw):
    producer = make_producer(db, **kw)
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user, producer


def _put_me(client, user, body):
    return client.put("/producers/me", json=body, headers=auth_header(user))


def test_owner_saves_and_clears_the_second_number(client, db):
    user, producer = _owner(db)
    resp = _put_me(
        client,
        user,
        {"secondary_phone": "0522723011", "secondary_phone_label": "להזמנות"},
    )
    assert resp.status_code == 200, resp.text
    detail = client.get(f"/producers/{producer.id}").json()
    assert detail["secondary_phone"] == "0522723011"
    assert detail["secondary_phone_label"] == "להזמנות"

    cleared = _put_me(
        client, user, {"secondary_phone": None, "secondary_phone_label": None}
    )
    assert cleared.status_code == 200, cleared.text
    detail = client.get(f"/producers/{producer.id}").json()
    assert detail["secondary_phone"] is None
    assert detail["secondary_phone_label"] is None


def test_admin_saves_the_second_number(client, db):
    producer = make_producer(db)
    admin = make_user(db, role="admin")
    resp = client.put(
        f"/admin/producers/{producer.id}",
        json={"secondary_phone": "0522723011", "secondary_phone_label": "להזמנות"},
        headers=auth_header(admin),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["secondary_phone"] == "0522723011"


def test_number_without_label_is_allowed(client, db):
    user, producer = _owner(db)
    resp = _put_me(client, user, {"secondary_phone": "0522723011"})
    assert resp.status_code == 200, resp.text
    assert (
        client.get(f"/producers/{producer.id}").json()["secondary_phone_label"] is None
    )


def test_label_without_number_is_422(client, db):
    user, producer = _owner(db)
    resp = _put_me(client, user, {"secondary_phone_label": "להזמנות"})
    assert resp.status_code == 422
    db.refresh(producer)
    assert producer.secondary_phone_label is None


def test_bad_number_is_422_like_the_main_phone(client, db):
    user, _ = _owner(db)
    bad = "abc-not-a-phone"
    assert _put_me(client, user, {"phone": bad}).status_code == 422  # control
    assert _put_me(client, user, {"secondary_phone": bad}).status_code == 422


def test_label_is_sanitized_and_capped(client, db):
    user, producer = _owner(db)
    resp = _put_me(
        client,
        user,
        {"secondary_phone": "0522723011", "secondary_phone_label": "<b>להזמנות</b>"},
    )
    assert resp.status_code == 200, resp.text
    assert (
        client.get(f"/producers/{producer.id}").json()["secondary_phone_label"]
        == "להזמנות"
    )
    too_long = _put_me(
        client,
        user,
        {"secondary_phone": "0522723011", "secondary_phone_label": "א" * 31},
    )
    assert too_long.status_code == 422


def test_second_number_leaves_the_main_phone_and_its_verification_alone(client, db):
    user, producer = _owner(db, phone_verified=True)
    producer.phone = "0522518862"
    db.commit()
    resp = _put_me(
        client,
        user,
        {"secondary_phone": "0522723011", "secondary_phone_label": "להזמנות"},
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.phone == "0522518862"
    assert producer.phone_verified is True


def test_consumer_cannot_write_it(client, db):
    consumer = make_user(db, role="consumer")
    resp = client.put(
        "/producers/me",
        json={"secondary_phone": "0522723011"},
        headers=auth_header(consumer),
    )
    assert resp.status_code == 403
