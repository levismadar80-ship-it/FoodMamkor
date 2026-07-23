"""MEH-1161 — public event visibility is gated on producer approval.

Audit F1: a pending producer created an event and it went public instantly
(business name included). Public reads of events must only return content
whose producer is approved:

  - GET /events            → approved-producer events only (anon)
  - GET /events/upcoming   → approved-producer events only (anon)
  - GET /events/{id}       → pending producer's event = 404 for strangers
                             (MEH-254 / MEH-1001 anti-enumeration), but the
                             owner and admins still see it.
  - GET /events?producer_id=<own> with owner auth → own pending events kept
    (the owner's producer-page read path must stay unaffected).

REUSES: tests/test_events_cross_owner.py — producer+user wiring and the
404-not-403 convention.
"""

from datetime import date

from app.models.models import Event
from conftest import auth_header, make_producer, make_user


# ---------- helpers ----------


def _make_producer_user(db, *, email: str, status: str = "approved"):
    producer = make_producer(db, name="חוות הבדיקה", status=status)
    user = make_user(db, role="producer", email=email)
    user.producer_id = producer.id
    db.commit()
    db.refresh(user)
    return producer, user


def _make_event(db, producer_id, *, title="סדנת אפייה"):
    event = Event(
        producer_id=producer_id,
        title=title,
        event_date=date(2099, 1, 1),
        category="סדנה",
        is_active=True,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


# ---------- GET /events (public list) ----------


class TestListEventsProducerGate:
    def test_pending_producer_event_hidden_from_anon(self, client, db):
        pending, _ = _make_producer_user(db, email="p@example.com", status="pending")
        _make_event(db, pending.id, title="אירוע ממתין")

        resp = client.get("/events")
        assert resp.status_code == 200
        assert all(e["producer_id"] != str(pending.id) for e in resp.json())

    def test_approved_producer_event_visible_to_anon(self, client, db):
        approved, _ = _make_producer_user(db, email="a@example.com")
        event = _make_event(db, approved.id, title="אירוע מאושר")

        resp = client.get("/events")
        assert resp.status_code == 200
        assert any(e["id"] == str(event.id) for e in resp.json())

    def test_owner_still_sees_own_pending_events_via_producer_filter(
        self, client, db
    ):
        pending, owner = _make_producer_user(
            db, email="owner@example.com", status="pending"
        )
        event = _make_event(db, pending.id)

        resp = client.get(
            f"/events?producer_id={pending.id}", headers=auth_header(owner)
        )
        assert resp.status_code == 200
        assert any(e["id"] == str(event.id) for e in resp.json())

    def test_admin_sees_pending_producer_events_in_list(self, client, db):
        # Covers the list-path admin bypass branch specifically — the detail
        # tests below exercise a different code path (adversarial-review gap).
        pending, _ = _make_producer_user(db, email="p9@example.com", status="pending")
        admin = make_user(db, role="admin", email="admin9@example.com")
        event = _make_event(db, pending.id)

        resp = client.get("/events", headers=auth_header(admin))
        assert resp.status_code == 200
        assert any(e["id"] == str(event.id) for e in resp.json())

    def test_stranger_filtering_by_pending_producer_sees_nothing(self, client, db):
        pending, _ = _make_producer_user(db, email="p2@example.com", status="pending")
        _, stranger = _make_producer_user(db, email="s@example.com")
        _make_event(db, pending.id)

        resp = client.get(
            f"/events?producer_id={pending.id}", headers=auth_header(stranger)
        )
        assert resp.status_code == 200
        assert resp.json() == []


# ---------- GET /events/upcoming (home cards) ----------


class TestUpcomingEventsProducerGate:
    def test_pending_producer_event_hidden(self, client, db):
        pending, _ = _make_producer_user(db, email="p3@example.com", status="pending")
        approved, _ = _make_producer_user(db, email="a3@example.com")
        _make_event(db, pending.id, title="ממתין")
        visible = _make_event(db, approved.id, title="מאושר")

        resp = client.get("/events/upcoming")
        assert resp.status_code == 200
        ids = [e["id"] for e in resp.json()]
        assert str(visible.id) in ids
        assert all(e["producer_id"] != str(pending.id) for e in resp.json())


# ---------- GET /events/{id} (public detail) ----------


class TestEventDetailProducerGate:
    def test_pending_producer_event_404_for_anon(self, client, db):
        pending, _ = _make_producer_user(db, email="p4@example.com", status="pending")
        event = _make_event(db, pending.id)

        resp = client.get(f"/events/{event.id}")
        assert resp.status_code == 404
        assert resp.json()["detail"] == "Event not found"

    def test_pending_producer_event_404_for_stranger(self, client, db):
        pending, _ = _make_producer_user(db, email="p5@example.com", status="pending")
        _, stranger = _make_producer_user(db, email="s5@example.com")
        event = _make_event(db, pending.id)

        resp = client.get(f"/events/{event.id}", headers=auth_header(stranger))
        assert resp.status_code == 404

    def test_owner_sees_own_pending_event_detail(self, client, db):
        pending, owner = _make_producer_user(
            db, email="owner6@example.com", status="pending"
        )
        event = _make_event(db, pending.id)

        resp = client.get(f"/events/{event.id}", headers=auth_header(owner))
        assert resp.status_code == 200
        assert resp.json()["id"] == str(event.id)

    def test_admin_sees_pending_event_detail(self, client, db):
        pending, _ = _make_producer_user(db, email="p7@example.com", status="pending")
        admin = make_user(db, role="admin", email="admin7@example.com")
        event = _make_event(db, pending.id)

        resp = client.get(f"/events/{event.id}", headers=auth_header(admin))
        assert resp.status_code == 200

    def test_approved_producer_event_detail_public(self, client, db):
        approved, _ = _make_producer_user(db, email="a8@example.com")
        event = _make_event(db, approved.id)

        resp = client.get(f"/events/{event.id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == str(event.id)
