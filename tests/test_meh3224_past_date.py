"""
Module:   test_meh3224_past_date
Purpose:  MEH-3224 (D6) — an event or experience cannot be created with, or
          moved to, a date before today (Israel). Today is allowed, and an
          edit that leaves a past event's stored date alone still saves.
Touches:  Postgres test DB via TestClient; experience moderation mocked.
Related:  backend/app/services/date_rules.py · routers/events.py ·
          routers/experiences.py
History:  MEH-3224 (creation)
"""

from datetime import timedelta

import pytest

from app.models.models import Event
from app.services.date_rules import PAST_DATE_DETAIL
from app.utils.clock import israel_today
from conftest import auth_header
from test_events import _approved_producer_user, _payload as _event_payload
from test_experiences import _make_experience, _make_host, _payload as _ex_payload


def _yesterday() -> str:
    return (israel_today() - timedelta(days=1)).isoformat()


@pytest.fixture(autouse=True)
def _quiet_side_effects(monkeypatch):
    import app.routers.experiences as ex_router
    import app.services.experience_moderation as ex_mod

    verdict = {"status": "APPROVED", "reason": None, "suggestion": None}
    monkeypatch.setattr(ex_mod, "validate_experience", lambda _: verdict)
    monkeypatch.setattr(ex_router, "validate_experience", lambda _: verdict)
    monkeypatch.setattr("app.routers.alerts.fire_alerts", lambda *a, **k: None)


class TestEvents:
    def test_create_yesterday_is_refused(self, client, db):
        user = _approved_producer_user(db, "past1@example.com")
        resp = client.post(
            "/events",
            json=_event_payload(event_date=_yesterday()),
            headers=auth_header(user),
        )
        assert resp.status_code == 422
        assert resp.json()["detail"] == PAST_DATE_DETAIL
        assert db.query(Event).count() == 0

    def test_create_today_is_allowed(self, client, db):
        user = _approved_producer_user(db, "past2@example.com")
        resp = client.post(
            "/events",
            json=_event_payload(event_date=israel_today().isoformat()),
            headers=auth_header(user),
        )
        assert resp.status_code == 201

    def test_moving_an_event_into_the_past_is_refused(self, client, db):
        user = _approved_producer_user(db, "past3@example.com")
        created = client.post(
            "/events", json=_event_payload(), headers=auth_header(user)
        ).json()
        resp = client.put(
            f"/events/{created['id']}",
            json={"event_date": _yesterday()},
            headers=auth_header(user),
        )
        assert resp.status_code == 422
        assert resp.json()["detail"] == PAST_DATE_DETAIL

    def test_editing_a_past_event_without_moving_it_still_saves(self, client, db):
        user = _approved_producer_user(db, "past4@example.com")
        past = israel_today() - timedelta(days=3)
        event = Event(
            producer_id=user.producer_id,
            title="שוק ישן",
            event_date=past,
            category="שוק",
            city="תל אביב",
        )
        db.add(event)
        db.commit()
        resp = client.put(
            f"/events/{event.id}",
            # the dashboard form re-sends the stored date with every save
            json={"title": "שוק ישן — תיקון", "event_date": past.isoformat()},
            headers=auth_header(user),
        )
        assert resp.status_code == 200


class TestExperiences:
    def test_create_yesterday_is_refused(self, client, db):
        host = _make_host(db, role="producer", email="h1@example.com")
        resp = client.post(
            "/experiences",
            json=_ex_payload(event_date=_yesterday()),
            headers=auth_header(host),
        )
        assert resp.status_code == 422
        assert resp.json()["detail"] == PAST_DATE_DETAIL

    def test_create_today_is_allowed(self, client, db):
        host = _make_host(db, role="producer", email="h2@example.com")
        resp = client.post(
            "/experiences",
            json=_ex_payload(event_date=israel_today().isoformat()),
            headers=auth_header(host),
        )
        assert resp.status_code == 201

    def test_moving_into_the_past_is_refused(self, client, db):
        host = _make_host(db, role="producer", email="h3@example.com")
        ex = _make_experience(db, host)
        resp = client.put(
            f"/experiences/{ex.id}",
            json={"event_date": _yesterday()},
            headers=auth_header(host),
        )
        assert resp.status_code == 422
        assert resp.json()["detail"] == PAST_DATE_DETAIL

    def test_a_past_experience_keeps_saving_when_its_date_is_untouched(
        self, client, db
    ):
        host = _make_host(db, role="producer", email="h4@example.com")
        past = israel_today() - timedelta(days=3)
        ex = _make_experience(db, host, event_date=past)
        resp = client.put(
            f"/experiences/{ex.id}",
            json={"is_active": False, "event_date": past.isoformat()},
            headers=auth_header(host),
        )
        assert resp.status_code == 200
