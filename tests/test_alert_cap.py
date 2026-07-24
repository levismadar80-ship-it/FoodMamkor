"""MEH-1338 — fire_alerts frequency cap.

At most one message per (user, producer, channel) in a rolling 24h window,
backed by the AlertLog ledger. Blocked alerts are dropped (no digest in v1).
Channels are capped independently; the cap is isolated per (user, producer).
"""

from datetime import datetime, timedelta

from conftest import make_producer, make_user

from app.models import AlertLog, FavoriteAlert
from app.routers.alerts import fire_alerts
from app.schemas.schemas import AlertContent

_SUB = {"endpoint": "https://push.example/x", "keys": {"p256dh": "a", "auth": "b"}}


def _content():
    return AlertContent(title="עדכון", body="גוף", url="/p/1")


def _alert(db, user, producer, **flags):
    a = FavoriteAlert(
        user_id=user.id,
        producer_id=producer.id,
        notify_new_product=flags.get("notify_new_product", True),
        notify_new_event=flags.get("notify_new_event", True),
        notify_delivery_area=flags.get("notify_delivery_area", True),
        whatsapp_opt_in=flags.get("whatsapp_opt_in", False),
        push_subscription=flags.get("push_subscription"),
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


def _seed_log(db, user, producer, channel, *, sent_at=None):
    row = AlertLog(
        user_id=user.id,
        producer_id=producer.id,
        channel=channel,
        alert_type="new_product",
    )
    if sent_at is not None:
        row.sent_at = sent_at
    db.add(row)
    db.commit()


def _count(db, channel=None):
    q = db.query(AlertLog)
    if channel:
        q = q.filter(AlertLog.channel == channel)
    return q.count()


def _patch(monkeypatch):
    push, wa = [], []
    monkeypatch.setattr(
        "app.services.push.send_push_notification", lambda *a, **k: push.append(1)
    )
    monkeypatch.setattr(
        "app.routers.alerts.send_template", lambda *a, **k: wa.append(1)
    )
    return push, wa


class TestFrequencyCap:
    def test_second_same_channel_send_within_24h_is_capped(self, db, monkeypatch):
        push, wa = _patch(monkeypatch)
        producer = make_producer(db, name="Cap Farm")
        user = make_user(db, email="cap@example.com")
        user.phone = "0501234567"
        db.commit()
        _alert(
            db,
            user,
            producer,
            notify_new_product=True,
            whatsapp_opt_in=True,
            push_subscription=_SUB,
        )

        fire_alerts(db, producer.id, "new_product", _content())
        fire_alerts(db, producer.id, "new_product", _content())

        assert push == [1]  # push delivered once, 2nd capped
        assert wa == [1]  # whatsapp delivered once, 2nd capped
        assert _count(db, "push") == 1
        assert _count(db, "whatsapp") == 1

    def test_cap_is_per_channel(self, db, monkeypatch):
        push, wa = _patch(monkeypatch)
        producer = make_producer(db, name="Chan Farm")
        user = make_user(db, email="chan@example.com")
        user.phone = "0502223344"
        db.commit()
        _alert(db, user, producer, whatsapp_opt_in=True, push_subscription=_SUB)
        _seed_log(db, user, producer, "push")  # push already sent in-window

        fire_alerts(db, producer.id, "new_product", _content())

        assert push == []  # push capped
        assert wa == [1]  # whatsapp independent → still fires

    def test_allowed_after_24h(self, db, monkeypatch):
        push, wa = _patch(monkeypatch)
        producer = make_producer(db, name="Old Farm")
        user = make_user(db, email="old@example.com")
        db.commit()
        _alert(db, user, producer, push_subscription=_SUB)
        _seed_log(
            db,
            user,
            producer,
            "push",
            sent_at=datetime.utcnow() - timedelta(hours=25),
        )

        fire_alerts(db, producer.id, "new_product", _content())

        assert push == [1]  # prior send was >24h ago → not capped

    def test_cap_isolated_per_user_and_producer(self, db, monkeypatch):
        push, _wa = _patch(monkeypatch)
        p1 = make_producer(db, name="P1")
        p2 = make_producer(db, name="P2")
        u1 = make_user(db, email="u1cap@example.com")
        u2 = make_user(db, email="u2cap@example.com")
        db.commit()
        _alert(db, u1, p1, push_subscription={"e": 1})
        _alert(db, u2, p1, push_subscription={"e": 2})
        _alert(db, u1, p2, push_subscription={"e": 3})
        _seed_log(db, u1, p1, "push")  # cap only (u1, p1, push)

        fire_alerts(db, p1.id, "new_product", _content())
        assert push == [1]  # u1@p1 capped; u2@p1 fires

        push.clear()
        fire_alerts(db, p2.id, "new_product", _content())
        assert push == [1]  # u1@p2 not capped (different producer)

    def test_failed_send_is_not_recorded(self, db, monkeypatch):
        # A raising channel must NOT write an AlertLog row — otherwise a
        # transient failure would suppress the next (real) attempt.
        push = []

        def boom(*a, **k):
            push.append(1)
            raise RuntimeError("boom")

        monkeypatch.setattr("app.services.push.send_push_notification", boom)
        monkeypatch.setattr("app.routers.alerts.send_template", lambda *a, **k: True)

        producer = make_producer(db, name="Fail Farm")
        user = make_user(db, email="fail@example.com")
        db.commit()
        _alert(db, user, producer, push_subscription=_SUB)

        fire_alerts(db, producer.id, "new_product", _content())

        assert push == [1]  # attempted
        assert _count(db, "push") == 0  # but not recorded → retryable
