"""MEH-3117 — new_rescue favorite alert: 6th alert type, fired on create_offer.

The one firing point is rescue.create_offer, after the commit, and only for
an offer dated TODAY on the Israel clock (the approved title says «היום»).
A bag for tomorrow, a refused publish, a cancel and a reservation fire
nothing. The column reads NULL as ON, like MEH-2828's notify_new_group_buy.

Monkeypatch boundaries are MEH-2828's (tests/test_meh2828_group_buy_alert.py):
  - app.routers.alerts.fire_alerts — once-semantics of the trigger;
  - app.services.push.send_push_notification + app.routers.alerts.send_template
    — the real fan-out through fire_alerts with the channels mocked.
"""

from datetime import timedelta
from uuid import uuid4

import pytest
from conftest import auth_header, make_producer, make_user
from sqlalchemy import update

from app.models import Favorite, FavoriteAlert
from app.models.models import ProducerLocation
from app.routers import rescue as rescue_module
from app.services.rescue_emails import israel_hhmm
from app.utils.clock import israel_today, utc_now

_SUB = {"endpoint": "https://push.example/rs", "keys": {"p256dh": "x", "auth": "y"}}


@pytest.fixture
def rescue_on(monkeypatch):
    # Same seam as tests/test_rescue.py::rescue_on — the gate functions, not
    # settings (the settings field may not exist; config.py is Sapir's).
    monkeypatch.setattr(rescue_module, "rescue_bags_enabled", lambda: True)
    monkeypatch.setattr(rescue_module, "rescue_cities", lambda: ("חיפה",))
    return True


@pytest.fixture
def shop(db):
    producer = make_producer(db, name="מאפיית ההצלה", city="חיפה")
    owner = make_user(db, email=f"rs-{uuid4().hex[:6]}@example.com", role="producer")
    owner.producer_id = producer.id
    owner.is_producer = True
    location = ProducerLocation(
        producer_id=producer.id,
        kind="branch",
        is_primary=True,
        city="חיפה",
        address="הנביאים 10",
        lat=32.7940,
        lng=34.9896,
        location_precision="exact",
    )
    db.add(location)
    db.commit()
    db.refresh(location)
    return {"producer": producer, "owner": owner, "location": location}


def _payload(location, **over):
    now = utc_now()
    payload = {
        "producer_location_id": str(location.id),
        "date": israel_today().isoformat(),
        "qty_total": 4,
        "price_agorot": 1500,
        "pickup_start": (now + timedelta(hours=1)).isoformat(),
        "pickup_end": (now + timedelta(hours=3)).isoformat(),
        "cancel_until": (now + timedelta(minutes=30)).isoformat(),
    }
    payload.update(over)
    return payload


def _follower(db, producer, *, pref=True):
    user = make_user(db, email=f"fan-{uuid4().hex[:6]}@example.com")
    db.add(Favorite(user_id=user.id, producer_id=producer.id))
    db.add(
        FavoriteAlert(
            user_id=user.id,
            producer_id=producer.id,
            notify_new_rescue=pref,
            push_subscription=_SUB,
        )
    )
    db.commit()
    if pref is None:
        # The constructor applies the Python default=True to an explicit None
        # (MEH-2828 note), so write the NULL with an UPDATE and check it.
        db.execute(
            update(FavoriteAlert)
            .where(FavoriteAlert.user_id == user.id)
            .values(notify_new_rescue=None)
        )
        db.commit()
        row = db.query(FavoriteAlert).filter(FavoriteAlert.user_id == user.id).one()
        db.refresh(row)
        assert row.notify_new_rescue is None, "control: the row must really be NULL"
    return user


def _capture_fire_alerts(monkeypatch):
    calls = []

    def fake(db, producer_id, alert_type, content, target_cities=None):
        calls.append(
            {"producer_id": producer_id, "alert_type": alert_type, "content": content}
        )

    monkeypatch.setattr("app.routers.alerts.fire_alerts", fake)
    return calls


def _mock_channels(monkeypatch):
    pushes = []
    monkeypatch.setattr(
        "app.services.push.send_push_notification",
        lambda sub, **kw: pushes.append({"sub": sub, **kw}),
    )
    monkeypatch.setattr("app.routers.alerts.send_template", lambda to, tmpl, **kw: True)
    return pushes


class TestTrigger:
    def test_a_bag_for_today_fires_once_with_the_approved_copy(
        self, client, db, monkeypatch, rescue_on, shop
    ):
        calls = _capture_fire_alerts(monkeypatch)
        body = _payload(shop["location"], qty_total=3)
        resp = client.post(
            "/rescue/offers", json=body, headers=auth_header(shop["owner"])
        )
        assert resp.status_code == 201, resp.text
        assert len(calls) == 1
        call = calls[0]
        assert call["alert_type"] == "new_rescue"
        assert call["producer_id"] == shop["producer"].id
        offer = resp.json()
        from datetime import datetime

        start = israel_hhmm(datetime.fromisoformat(offer["pickup_start"]))
        end = israel_hhmm(datetime.fromisoformat(offer["pickup_end"]))
        # rows 2 and 3 of the approved table (MEH-3117)
        assert call["content"].title == "סלי הפתעה היום במאפיית ההצלה"
        assert call["content"].body == f"3 סלים, איסוף {start}–{end}"
        assert call["content"].url == "/rescue"

    def test_a_bag_for_tomorrow_fires_nothing(
        self, client, db, monkeypatch, rescue_on, shop
    ):
        calls = _capture_fire_alerts(monkeypatch)
        now = utc_now()
        body = _payload(
            shop["location"],
            date=(israel_today() + timedelta(days=1)).isoformat(),
            pickup_start=(now + timedelta(hours=25)).isoformat(),
            pickup_end=(now + timedelta(hours=27)).isoformat(),
            cancel_until=(now + timedelta(hours=24)).isoformat(),
        )
        resp = client.post(
            "/rescue/offers", json=body, headers=auth_header(shop["owner"])
        )
        assert resp.status_code == 201, resp.text
        assert calls == []

    def test_a_refused_publish_fires_nothing(
        self, client, db, monkeypatch, rescue_on, shop
    ):
        calls = _capture_fire_alerts(monkeypatch)
        body = _payload(
            shop["location"],
            date=(israel_today() - timedelta(days=1)).isoformat(),
        )
        resp = client.post(
            "/rescue/offers", json=body, headers=auth_header(shop["owner"])
        )
        assert resp.status_code == 422
        assert calls == []

    def test_a_reservation_fires_nothing(
        self, client, db, monkeypatch, rescue_on, shop
    ):
        created = client.post(
            "/rescue/offers",
            json=_payload(shop["location"]),
            headers=auth_header(shop["owner"]),
        )
        assert created.status_code == 201, created.text
        calls = _capture_fire_alerts(monkeypatch)  # from here on
        buyer = make_user(db, email=f"buyer-{uuid4().hex[:6]}@example.com")
        r = client.post(
            "/rescue/orders",
            json={"offer_id": created.json()["id"], "qty": 1},
            headers=auth_header(buyer),
        )
        assert r.status_code in (200, 201), r.text
        assert calls == []


class TestFanOut:
    """Through the REAL fire_alerts (channels mocked)."""

    def test_follower_with_the_toggle_on_gets_the_push(
        self, client, db, monkeypatch, rescue_on, shop
    ):
        pushes = _mock_channels(monkeypatch)
        _follower(db, shop["producer"], pref=True)
        resp = client.post(
            "/rescue/offers",
            json=_payload(shop["location"]),
            headers=auth_header(shop["owner"]),
        )
        assert resp.status_code == 201, resp.text
        assert len(pushes) == 1
        assert pushes[0]["title"] == "סלי הפתעה היום במאפיית ההצלה"
        assert pushes[0]["url"] == "/rescue"

    def test_follower_with_the_toggle_off_gets_nothing(
        self, client, db, monkeypatch, rescue_on, shop
    ):
        pushes = _mock_channels(monkeypatch)
        _follower(db, shop["producer"], pref=False)
        resp = client.post(
            "/rescue/offers",
            json=_payload(shop["location"]),
            headers=auth_header(shop["owner"]),
        )
        assert resp.status_code == 201, resp.text
        assert pushes == []

    def test_a_null_row_still_gets_the_alert(
        self, client, db, monkeypatch, rescue_on, shop
    ):
        pushes = _mock_channels(monkeypatch)
        _follower(db, shop["producer"], pref=None)
        resp = client.post(
            "/rescue/offers",
            json=_payload(shop["location"]),
            headers=auth_header(shop["owner"]),
        )
        assert resp.status_code == 201, resp.text
        assert len(pushes) == 1


class TestPrefsApi:
    def test_toggle_round_trips_through_put_and_get(self, client, db):
        user = make_user(db, email=f"prefs-{uuid4().hex[:6]}@example.com")
        producer = make_producer(db, name="עסק הגדרות")
        db.add(Favorite(user_id=user.id, producer_id=producer.id))
        db.commit()
        url = f"/users/me/favorites/{producer.id}/alerts"
        r = client.put(url, json={"notify_new_rescue": False}, headers=auth_header(user))
        assert r.status_code == 200
        assert r.json()["notify_new_rescue"] is False
        assert client.get(url, headers=auth_header(user)).json()["notify_new_rescue"] is False
        r = client.put(url, json={"notify_new_rescue": True}, headers=auth_header(user))
        assert r.json()["notify_new_rescue"] is True

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
        assert r.json()["notify_new_rescue"] is True

    def test_no_row_reports_it_off(self, client, db):
        user = make_user(db, email=f"norow-{uuid4().hex[:6]}@example.com")
        producer = make_producer(db, name="עסק ריק")
        r = client.get(
            f"/users/me/favorites/{producer.id}/alerts", headers=auth_header(user)
        )
        assert r.json()["notify_new_rescue"] is False
