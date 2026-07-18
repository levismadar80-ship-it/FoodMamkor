"""MEH-1327 — pytest coverage for the favorites-alerts chain (prefs → DB → fan-out).

Pins the contract of `backend/app/routers/alerts.py` that runs in production
without dedicated coverage: GET/PUT prefs, and the `fire_alerts()` fan-out
called from events.py / producer_me.py via BackgroundTasks. Channels are mocked
(monkeypatched) — the real WhatsApp / Web Push transports are exercised
separately (MEH-1326 manual smoke).

The MEH-1191 422 guard (whatsapp_opt_in=true without a phone) is already covered
in tests/test_alerts_optin.py and is NOT duplicated here.

Monkeypatch boundaries:
  - app.routers.alerts.send_text            (module-level import, alerts.py:27)
  - app.services.push.send_push_notification (call-time import, alerts.py:190)
"""
from uuid import uuid4

from conftest import auth_header, make_producer, make_user

from app.models import Favorite, FavoriteAlert
from app.routers.alerts import fire_alerts
from app.schemas.schemas import AlertContent

_SUB = {"endpoint": "https://push.example/abc", "keys": {"p256dh": "x", "auth": "y"}}


def _favorite(db, user, producer):
    db.add(Favorite(user_id=user.id, producer_id=producer.id))
    db.commit()


def _make_alert(db, user, producer, **flags):
    """Insert a FavoriteAlert row with explicit flags (defaults all-off)."""
    alert = FavoriteAlert(
        user_id=user.id,
        producer_id=producer.id,
        notify_new_product=flags.get("notify_new_product", False),
        notify_new_event=flags.get("notify_new_event", False),
        notify_delivery_area=flags.get("notify_delivery_area", False),
        whatsapp_opt_in=flags.get("whatsapp_opt_in", False),
        push_subscription=flags.get("push_subscription"),
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


# ============================================================
# GET /users/me/favorites/{id}/alerts
# ============================================================


class TestGetAlertPrefs:
    def test_no_row_returns_all_false(self, client, db):
        """GET with no FavoriteAlert row → enabled=false + every flag false."""
        user = make_user(db, email="getempty@example.com")
        producer = make_producer(db, name="Farm Get")
        r = client.get(
            f"/users/me/favorites/{producer.id}/alerts",
            headers=auth_header(user),
        )
        assert r.status_code == 200
        body = r.json()
        assert body == {
            "enabled": False,
            "notify_new_product": False,
            "notify_new_event": False,
            "notify_delivery_area": False,
            "whatsapp_opt_in": False,
            "has_push": False,
        }


# ============================================================
# PUT /users/me/favorites/{id}/alerts
# ============================================================


class TestUpsertAlertPrefs:
    def test_put_without_favorite_returns_400(self, client, db):
        """PUT when the producer is not favorited → 400 (must favorite first)."""
        user = make_user(db, email="nofav@example.com")
        producer = make_producer(db, name="Farm NoFav")
        r = client.put(
            f"/users/me/favorites/{producer.id}/alerts",
            json={"notify_new_product": True},
            headers=auth_header(user),
        )
        assert r.status_code == 400

    def test_put_valid_persists_and_reflects_push(self, client, db):
        """PUT valid → persisted; has_push reflects the push_subscription."""
        user = make_user(db, email="putok@example.com")
        producer = make_producer(db, name="Farm PutOk")
        _favorite(db, user, producer)
        r = client.put(
            f"/users/me/favorites/{producer.id}/alerts",
            json={
                "notify_new_product": True,
                "notify_new_event": False,
                "notify_delivery_area": True,
                "push_subscription": _SUB,
            },
            headers=auth_header(user),
        )
        assert r.status_code == 200
        body = r.json()
        assert body["enabled"] is True
        assert body["notify_new_product"] is True
        assert body["notify_new_event"] is False
        assert body["notify_delivery_area"] is True
        assert body["has_push"] is True

        # Persisted: a subsequent GET reflects the same state.
        r2 = client.get(
            f"/users/me/favorites/{producer.id}/alerts",
            headers=auth_header(user),
        )
        assert r2.json()["has_push"] is True
        assert r2.json()["notify_delivery_area"] is True

        # And the row is really in the DB with the subscription stored.
        row = (
            db.query(FavoriteAlert)
            .filter(
                FavoriteAlert.user_id == user.id,
                FavoriteAlert.producer_id == producer.id,
            )
            .first()
        )
        assert row is not None
        assert row.push_subscription == _SUB


# ============================================================
# fire_alerts() fan-out
# ============================================================


class TestFireAlerts:
    def _content(self):
        return AlertContent(title="כותרת", body="גוף ההודעה", url="/producer/x")

    def test_only_optedin_rows_for_alert_type_receive(self, db, monkeypatch):
        """Only rows opted-in for THIS alert_type are fanned out to."""
        push_calls = []
        monkeypatch.setattr(
            "app.services.push.send_push_notification",
            lambda sub, **kw: push_calls.append(sub),
        )
        monkeypatch.setattr("app.routers.alerts.send_text", lambda to, body: True)

        producer = make_producer(db, name="Farm FanOut")
        opted_in = make_user(db, email="in@example.com")
        opted_out = make_user(db, email="out@example.com")
        # Both have a push subscription so the ONLY difference is the alert_type flag.
        _make_alert(
            db, opted_in, producer,
            notify_new_event=True, push_subscription={"endpoint": "in"},
        )
        _make_alert(
            db, opted_out, producer,
            notify_new_event=False, push_subscription={"endpoint": "out"},
        )

        fire_alerts(db, producer.id, "new_event", self._content())

        assert push_calls == [{"endpoint": "in"}]

    def test_whatsapp_sent_with_correct_args(self, db, monkeypatch):
        """whatsapp_opt_in + phone → send_text(to=phone, body=title/body/url)."""
        captured = {}

        def fake_send_text(to, body):
            captured["to"] = to
            captured["body"] = body
            return True

        monkeypatch.setattr("app.routers.alerts.send_text", fake_send_text)
        monkeypatch.setattr(
            "app.services.push.send_push_notification", lambda *a, **k: None
        )

        producer = make_producer(db, name="Farm WA")
        user = make_user(db, email="wa@example.com")
        user.phone = "0501234567"
        db.commit()
        _make_alert(
            db, user, producer, notify_new_product=True, whatsapp_opt_in=True
        )

        content = AlertContent(title="מוצר חדש", body="עגבניות", url="/p/1")
        fire_alerts(db, producer.id, "new_product", content)

        assert captured["to"] == "0501234567"
        assert "מוצר חדש" in captured["body"]
        assert "עגבניות" in captured["body"]
        assert "/p/1" in captured["body"]

    def test_push_sent_when_subscription_set(self, db, monkeypatch):
        """push_subscription set → send_push_notification called with content kwargs."""
        calls = []

        def fake_push(sub, *, title, body, url):
            calls.append({"sub": sub, "title": title, "body": body, "url": url})

        monkeypatch.setattr("app.services.push.send_push_notification", fake_push)
        monkeypatch.setattr("app.routers.alerts.send_text", lambda to, body: True)

        producer = make_producer(db, name="Farm Push")
        user = make_user(db, email="push@example.com")
        _make_alert(
            db, user, producer, notify_new_event=True, push_subscription=_SUB
        )

        content = AlertContent(title="אירוע", body="שוק", url="/e/9")
        fire_alerts(db, producer.id, "new_event", content)

        assert len(calls) == 1
        assert calls[0]["sub"] == _SUB
        assert calls[0]["title"] == "אירוע"
        assert calls[0]["body"] == "שוק"
        assert calls[0]["url"] == "/e/9"

    def test_one_recipient_exception_does_not_break_loop(self, db, monkeypatch):
        """A raising channel for one recipient must not stop the fan-out (fail-open)."""
        attempted = []

        def flaky_push(sub, **kw):
            attempted.append(sub)
            raise RuntimeError("boom")

        monkeypatch.setattr("app.services.push.send_push_notification", flaky_push)
        monkeypatch.setattr("app.routers.alerts.send_text", lambda to, body: True)

        producer = make_producer(db, name="Farm Failopen")
        u1 = make_user(db, email="r1@example.com")
        u2 = make_user(db, email="r2@example.com")
        _make_alert(db, u1, producer, notify_new_event=True, push_subscription={"e": 1})
        _make_alert(db, u2, producer, notify_new_event=True, push_subscription={"e": 2})

        # Must not raise despite every push blowing up.
        fire_alerts(db, producer.id, "new_event", self._content())

        # Both recipients were attempted — the loop continued past the first failure.
        assert len(attempted) == 2

    def test_unknown_alert_type_is_noop(self, db, monkeypatch):
        """Unknown alert_type → early no-op, no exception, no channel calls."""
        push_calls = []
        wa_calls = []
        monkeypatch.setattr(
            "app.services.push.send_push_notification",
            lambda *a, **k: push_calls.append(1),
        )
        monkeypatch.setattr(
            "app.routers.alerts.send_text", lambda *a, **k: wa_calls.append(1)
        )

        producer = make_producer(db, name="Farm Unknown")
        user = make_user(db, email="unknown@example.com")
        user.phone = "0509999999"
        db.commit()
        _make_alert(
            db, user, producer,
            notify_new_event=True,
            whatsapp_opt_in=True,
            push_subscription=_SUB,
        )

        # Should simply return without touching any channel.
        fire_alerts(db, producer.id, "bogus_type", self._content())
        # And a fully unrelated producer id is likewise a clean no-op.
        fire_alerts(db, uuid4(), "new_event", self._content())

        assert push_calls == []
        assert wa_calls == []
