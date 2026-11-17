"""MEH-3222 (B6) — removing a favorite stops its alerts.

Alerts require a favorite (alerts.py: PUT prefs → 400 without one). Removing
the favorite used to leave the FavoriteAlert row behind, so WhatsApp/push
alerts kept firing for a business she had taken out of her favorites.
"""
from conftest import auth_header, make_producer, make_user
from app.models import Favorite, FavoriteAlert
from app.routers.alerts import fire_alerts
from app.schemas.schemas import AlertContent


def test_unfavorite_deletes_alert_row_and_no_alert_fires(client, db, monkeypatch):
    push_calls: list = []
    monkeypatch.setattr(
        "app.services.push.send_push_notification",
        lambda sub, **kw: push_calls.append(sub),
    )
    monkeypatch.setattr(
        "app.routers.alerts.send_template", lambda to, tmpl, test_cause=False: True
    )
    user = make_user(db, email="fan@example.com")
    producer = make_producer(db, name="Farm Unfav")
    db.add(Favorite(user_id=user.id, producer_id=producer.id))
    db.add(
        FavoriteAlert(
            user_id=user.id,
            producer_id=producer.id,
            notify_new_event=True,
            push_subscription={"endpoint": "fan"},
        )
    )
    db.commit()

    r = client.delete(f"/users/me/favorites/{producer.id}", headers=auth_header(user))
    assert r.status_code == 200, r.text

    db.expire_all()
    left = db.query(FavoriteAlert).filter(FavoriteAlert.user_id == user.id).count()
    assert left == 0

    fire_alerts(
        db,
        producer.id,
        "new_event",
        AlertContent(title="ערב טעימות", body="ערב טעימות בחווה", url=f"/producer/{producer.id}"),
    )
    assert push_calls == []


def test_unfavorite_leaves_other_businesses_alerts(client, db):
    user = make_user(db, email="fan2@example.com")
    kept = make_producer(db, name="Farm Kept")
    gone = make_producer(db, name="Farm Gone")
    for p in (kept, gone):
        db.add(Favorite(user_id=user.id, producer_id=p.id))
        db.add(FavoriteAlert(user_id=user.id, producer_id=p.id, notify_new_event=True))
    db.commit()

    r = client.delete(f"/users/me/favorites/{gone.id}", headers=auth_header(user))
    assert r.status_code == 200, r.text
    db.expire_all()
    rows = db.query(FavoriteAlert).filter(FavoriteAlert.user_id == user.id).all()
    assert [row.producer_id for row in rows] == [kept.id]
