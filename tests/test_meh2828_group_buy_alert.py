"""MEH-2828 — new_group_buy favorite alert: 5th alert type, fired on create.

The one firing point is group_buys.create_group_buy, after the row is
committed with status "open". Nothing else fires it: the owner's status
PATCH (cancel / fulfil), a join that funds the group, and a leave all go
through other routes. (There is no edit route for a group buy.)

The new column reads NULL as ON (Sapir 08/11) — the four older columns keep
their behaviour (only TRUE fires), which TestNullIsOn pins on both sides.

Monkeypatch boundaries are the MEH-1361 ones (tests/test_meh1361_recipe_alert.py):
  - app.routers.alerts.fire_alerts — once-semantics of the trigger;
  - app.services.push.send_push_notification + app.routers.alerts.send_template
    — the real fan-out through fire_alerts with the channels mocked.
"""

from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

from conftest import auth_header, make_producer, make_user

from app.models import Favorite, FavoriteAlert
from app.models.models import GroupBuy
from app.routers.group_buys import format_price
from app.utils.clock import utc_now

_SUB = {"endpoint": "https://push.example/gb", "keys": {"p256dh": "x", "auth": "y"}}


def _owner(db, *, name="מאפיית הכפר", email=None):
    producer = make_producer(db, name=name, status="approved")
    user = make_user(
        db, role="producer", email=email or f"gb-{uuid4().hex[:6]}@test.com"
    )
    user.producer_id = producer.id
    db.commit()
    db.refresh(user)
    return producer, user


def _payload(**overrides):
    payload = {
        "title": "רכש שמן זית",
        "product_name": "שמן זית כתית",
        "unit": "ליטר",
        "price_per_unit_regular": 80,
        "price_per_unit_group": 60,
        "min_participants": 3,
        "deadline": (utc_now() + timedelta(days=10)).isoformat(),
        "city": "חיפה",
        "fulfillment_note": "איסוף מהמשק ביום שישי",
    }
    payload.update(overrides)
    return payload


def _follower(db, producer, *, pref=True, push=_SUB, recipe=True):
    user = make_user(db, email=f"fan-{uuid4().hex[:6]}@example.com")
    db.add(Favorite(user_id=user.id, producer_id=producer.id))
    db.add(
        FavoriteAlert(
            user_id=user.id,
            producer_id=producer.id,
            notify_new_group_buy=pref,
            notify_new_recipe=recipe,
            push_subscription=push,
        )
    )
    db.commit()
    return user


def _capture_fire_alerts(monkeypatch):
    calls = []

    def fake_fire_alerts(db, producer_id, alert_type, content, target_cities=None):
        calls.append(
            {"producer_id": producer_id, "alert_type": alert_type, "content": content}
        )

    monkeypatch.setattr("app.routers.alerts.fire_alerts", fake_fire_alerts)
    return calls


def _mock_channels(monkeypatch):
    pushes = []
    monkeypatch.setattr(
        "app.services.push.send_push_notification",
        lambda sub, **kw: pushes.append({"sub": sub, **kw}),
    )
    monkeypatch.setattr("app.routers.alerts.send_template", lambda to, tmpl: True)
    return pushes


class TestTrigger:
    def test_create_fires_once_with_the_approved_copy_and_the_group_page(
        self, client, db, monkeypatch
    ):
        calls = _capture_fire_alerts(monkeypatch)
        producer, owner = _owner(db, name="מאפיית הכפר")
        resp = client.post(
            "/group-buys",
            json=_payload(
                title="שק קמח כוסמין",
                price_per_unit_regular=1250,
                price_per_unit_group=980.5,
            ),
            headers=auth_header(owner),
        )
        assert resp.status_code == 201
        gb_id = resp.json()["id"]
        assert len(calls) == 1
        call = calls[0]
        assert call["alert_type"] == "new_group_buy"
        assert call["producer_id"] == producer.id
        # rows A and B of the approved table, prices as the site writes them
        assert call["content"].title == "🛒 קבוצת רכישה חדשה: שק קמח כוסמין"
        assert call["content"].body == "מאפיית הכפר — 980.5₪ במקום 1,250₪"
        assert call["content"].url == f"/group-buys/{gb_id}"

    def test_a_refused_create_fires_nothing(self, client, db, monkeypatch):
        calls = _capture_fire_alerts(monkeypatch)
        _, owner = _owner(db)
        resp = client.post(
            "/group-buys",
            json=_payload(price_per_unit_regular=50, price_per_unit_group=60),
            headers=auth_header(owner),
        )
        assert resp.status_code == 400
        assert calls == []

    def test_cancel_and_fulfil_fire_nothing(self, client, db, monkeypatch):
        producer, owner = _owner(db)
        created = client.post(
            "/group-buys", json=_payload(), headers=auth_header(owner)
        )
        assert created.status_code == 201
        calls = _capture_fire_alerts(monkeypatch)  # from here on
        gb_id = created.json()["id"]
        r = client.patch(
            f"/group-buys/{gb_id}/status",
            json={"status": "cancelled"},
            headers=auth_header(owner),
        )
        assert r.status_code == 200
        assert calls == []

    def test_reaching_the_goal_fires_nothing(self, client, db, monkeypatch):
        producer, owner = _owner(db)
        created = client.post(
            "/group-buys", json=_payload(min_participants=1), headers=auth_header(owner)
        )
        assert created.status_code == 201
        calls = _capture_fire_alerts(monkeypatch)
        buyer = make_user(db, email=f"buyer-{uuid4().hex[:6]}@example.com")
        r = client.post(
            f"/group-buys/{created.json()['id']}/commit",
            json={"quantity": 1},
            headers=auth_header(buyer),
        )
        assert r.status_code in (200, 201), r.text
        db.expire_all()
        assert (
            db.query(GroupBuy).filter(GroupBuy.id == created.json()["id"]).one().status
            == "funded"
        )
        assert calls == []


class TestFanOut:
    """Through the REAL fire_alerts (channels mocked)."""

    def test_follower_with_the_toggle_on_gets_the_push(self, client, db, monkeypatch):
        pushes = _mock_channels(monkeypatch)
        producer, owner = _owner(db, name="חוות הזיתים")
        _follower(db, producer, pref=True)
        resp = client.post(
            "/group-buys", json=_payload(title="שמן חדש"), headers=auth_header(owner)
        )
        assert resp.status_code == 201
        assert len(pushes) == 1
        assert pushes[0]["title"] == "🛒 קבוצת רכישה חדשה: שמן חדש"
        assert pushes[0]["url"] == f"/group-buys/{resp.json()['id']}"

    def test_follower_with_the_toggle_off_gets_nothing(self, client, db, monkeypatch):
        pushes = _mock_channels(monkeypatch)
        producer, owner = _owner(db)
        _follower(db, producer, pref=False)
        resp = client.post("/group-buys", json=_payload(), headers=auth_header(owner))
        assert resp.status_code == 201
        assert pushes == []


class TestNullIsOn:
    def test_a_null_row_still_gets_the_group_buy_alert(self, client, db, monkeypatch):
        pushes = _mock_channels(monkeypatch)
        producer, owner = _owner(db)
        _follower(db, producer, pref=None)
        resp = client.post("/group-buys", json=_payload(), headers=auth_header(owner))
        assert resp.status_code == 201
        assert len(pushes) == 1

    def test_the_older_columns_are_unchanged_null_stays_off(self, db, monkeypatch):
        # Scope guard: only the new column reads NULL as ON.
        from app.routers.alerts import AlertContent, fire_alerts

        pushes = _mock_channels(monkeypatch)
        producer, _ = _owner(db)
        _follower(db, producer, pref=True, recipe=None)
        fire_alerts(
            db, producer.id, "new_recipe", AlertContent(title="t", body="b", url="/x")
        )
        assert pushes == []

    def test_prefs_get_reports_a_null_row_as_on(self, client, db):
        producer, _ = _owner(db)
        user = _follower(db, producer, pref=None)
        r = client.get(
            f"/users/me/favorites/{producer.id}/alerts", headers=auth_header(user)
        )
        assert r.status_code == 200
        assert r.json()["notify_new_group_buy"] is True


class TestPrefsApi:
    def test_toggle_round_trips_through_put_and_get(self, client, db):
        user = make_user(db, email=f"prefs-{uuid4().hex[:6]}@example.com")
        producer = make_producer(db, name="עסק הגדרות")
        db.add(Favorite(user_id=user.id, producer_id=producer.id))
        db.commit()
        url = f"/users/me/favorites/{producer.id}/alerts"

        r = client.put(
            url, json={"notify_new_group_buy": False}, headers=auth_header(user)
        )
        assert r.status_code == 200
        assert r.json()["notify_new_group_buy"] is False
        assert (
            client.get(url, headers=auth_header(user)).json()["notify_new_group_buy"]
            is False
        )

        r = client.put(
            url, json={"notify_new_group_buy": True}, headers=auth_header(user)
        )
        assert r.json()["notify_new_group_buy"] is True

    def test_put_without_the_field_defaults_it_on(self, client, db):
        user = make_user(db, email=f"prefs-{uuid4().hex[:6]}@example.com")
        producer = make_producer(db, name="עסק ברירת מחדל")
        db.add(Favorite(user_id=user.id, producer_id=producer.id))
        db.commit()
        r = client.put(
            f"/users/me/favorites/{producer.id}/alerts",
            json={"notify_new_product": True},
            headers=auth_header(user),
        )
        assert r.json()["notify_new_group_buy"] is True

    def test_no_row_reports_it_off(self, client, db):
        user = make_user(db, email=f"norow-{uuid4().hex[:6]}@example.com")
        producer = make_producer(db, name="עסק ריק")
        r = client.get(
            f"/users/me/favorites/{producer.id}/alerts", headers=auth_header(user)
        )
        assert r.json()["notify_new_group_buy"] is False


class TestFormatPrice:
    def test_matches_the_site_format(self):
        assert format_price(Decimal("45.00")) == "45₪"
        assert format_price(Decimal("1250.00")) == "1,250₪"
        assert format_price(Decimal("12.50")) == "12.5₪"
        assert format_price(Decimal("12.05")) == "12.05₪"
        assert format_price(Decimal("100.00")) == "100₪"
