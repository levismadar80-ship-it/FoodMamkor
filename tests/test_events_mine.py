"""MEH-1405 — owner-scoped GET /events/mine.

A producer manages her own events from the dashboard, so this list must
include inactive (canceled) events — unlike the public GET /events feed,
which filters is_active. Scoped to the caller's producer_id; a consumer or
anonymous caller is rejected by require_producer.

Mirrors test_events_cross_owner.py helpers.
"""

from datetime import date

from app.models.models import Event
from conftest import auth_header, make_producer, make_user


def _make_producer_user(db, *, email: str):
    producer = make_producer(db, name="חוות הבדיקה")
    user = make_user(db, role="producer", email=email)
    user.producer_id = producer.id
    db.commit()
    db.refresh(user)
    return producer, user


def _make_event(db, producer_id, *, title, is_active=True):
    event = Event(
        producer_id=producer_id,
        title=title,
        event_date=date(2099, 1, 1),
        category="שוק",
        is_active=is_active,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


class TestListMyEvents:
    def test_owner_sees_own_events_including_inactive(self, client, db):
        producer, user = _make_producer_user(db, email="owner@example.com")
        _make_event(db, producer.id, title="פעיל", is_active=True)
        _make_event(db, producer.id, title="מבוטל", is_active=False)

        resp = client.get("/events/mine", headers=auth_header(user))
        assert resp.status_code == 200
        titles = {e["title"] for e in resp.json()}
        assert titles == {"פעיל", "מבוטל"}
        # The inactive one carries is_active=False so the UI can badge it מבוטל.
        by_title = {e["title"]: e for e in resp.json()}
        assert by_title["מבוטל"]["is_active"] is False
        assert by_title["פעיל"]["is_active"] is True

    def test_owner_does_not_see_other_producers_events(self, client, db):
        producer_a, user_a = _make_producer_user(db, email="a@example.com")
        producer_b, _ = _make_producer_user(db, email="b@example.com")
        _make_event(db, producer_a.id, title="של א")
        _make_event(db, producer_b.id, title="של ב")

        resp = client.get("/events/mine", headers=auth_header(user_a))
        assert resp.status_code == 200
        titles = {e["title"] for e in resp.json()}
        assert titles == {"של א"}

    def test_consumer_rejected(self, client, db):
        consumer = make_user(db, role="consumer", email="consumer@example.com")
        resp = client.get("/events/mine", headers=auth_header(consumer))
        assert resp.status_code == 403

    def test_anonymous_rejected(self, client):
        resp = client.get("/events/mine")
        assert resp.status_code == 401
