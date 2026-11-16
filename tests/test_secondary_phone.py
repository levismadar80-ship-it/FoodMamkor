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


# --- review follow-ups (MEH-3339) ---------------------------------------------


def test_label_only_save_is_fine_while_a_number_is_stored(client, db):
    user, producer = _owner(db)
    _put_me(
        client,
        user,
        {"secondary_phone": "0522723011", "secondary_phone_label": "להזמנות"},
    )
    resp = _put_me(client, user, {"secondary_phone_label": "לשאלות"})
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.secondary_phone == "0522723011"
    assert producer.secondary_phone_label == "לשאלות"


def test_clearing_the_number_clears_its_label(client, db):
    user, producer = _owner(db)
    _put_me(
        client,
        user,
        {"secondary_phone": "0522723011", "secondary_phone_label": "להזמנות"},
    )
    resp = _put_me(client, user, {"secondary_phone": None})
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.secondary_phone is None
    assert producer.secondary_phone_label is None  # no orphan to resurrect


def test_admin_put_label_without_number_is_422(client, db):
    producer = make_producer(db)
    resp = client.put(
        f"/admin/producers/{producer.id}",
        json={"secondary_phone_label": "להזמנות"},
        headers=auth_header(make_user(db, role="admin")),
    )
    assert resp.status_code == 422
    assert "מספר" in resp.json()["detail"]


def test_admin_create_keeps_the_second_number(client, db):
    resp = client.post(
        "/admin/producers",
        json={
            "name": "סנדרה פירות איכותיים",
            "phone": "0522518862",
            "secondary_phone": "0522723011",
            "secondary_phone_label": "להזמנות",
        },
        headers=auth_header(make_user(db, role="admin")),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["secondary_phone"] == "0522723011"
    assert resp.json()["secondary_phone_label"] == "להזמנות"


def test_changing_the_second_number_pings_the_admin(client, db):
    from unittest.mock import patch

    user, producer = _owner(db)
    with patch("app.routers.producer_me.notify_admin_producer_sensitive_edit") as ping:
        resp = _put_me(client, user, {"secondary_phone": "0522723011"})
    assert resp.status_code == 200, resp.text
    ping.assert_called_once()
    assert ping.call_args.args[1] == ["secondary_phone"]
