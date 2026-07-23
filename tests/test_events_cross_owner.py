"""Cross-owner authorization tests for the events feature (MEH-1001 chunk 1).

A producer PUT/DELETE against another producer's event must return 404,
not 403, so the existence of another producer's event is never leaked
(REUSES tests/test_producer_recipes.py:345-362 — the recipe twin).

Convention (MEH-1001, corrected):
  - update_event stays owner-only: cross-owner PUT -> 404.
  - delete_event keeps its admin-override: a stranger (non-owner,
    non-admin) -> 404, but an admin still deletes (-> 200). The admin
    branch is asserted here to prove the override survived the change.
"""

from datetime import date

from app.models.models import Event
from conftest import auth_header, make_producer, make_user


# ---------- helpers ----------


def _make_producer_user(db, *, email: str):
    """Producer + owning User, mirroring the register-flow wiring."""
    producer = make_producer(db, name="חוות הבדיקה")
    user = make_user(db, role="producer", email=email)
    user.producer_id = producer.id
    db.commit()
    db.refresh(user)
    return producer, user


def _make_event(db, producer_id):
    event = Event(
        producer_id=producer_id,
        title="סדנת אפייה",
        event_date=date(2099, 1, 1),
        category="סדנה",
        is_active=True,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


# ---------- PUT /events/{id} — owner-only ----------


class TestUpdateEventCrossOwner:
    def test_cross_owner_put_gets_404(self, client, db):
        producer_a, _ = _make_producer_user(db, email="a@example.com")
        _, user_b = _make_producer_user(db, email="b@example.com")
        event = _make_event(db, producer_a.id)

        resp = client.put(
            f"/events/{event.id}",
            json={"title": "ניסיון עריכה"},
            headers=auth_header(user_b),
        )
        assert resp.status_code == 404
        assert resp.json()["detail"] == "Event not found"

    def test_owner_put_gets_200(self, client, db):
        producer, user = _make_producer_user(db, email="owner@example.com")
        event = _make_event(db, producer.id)

        resp = client.put(
            f"/events/{event.id}",
            json={"title": "כותרת מעודכנת"},
            headers=auth_header(user),
        )
        assert resp.status_code == 200
        assert resp.json()["title"] == "כותרת מעודכנת"


# ---------- DELETE /events/{id} — owner or admin ----------


class TestDeleteEventCrossOwner:
    def test_cross_owner_delete_gets_404(self, client, db):
        producer_a, _ = _make_producer_user(db, email="a@example.com")
        _, user_b = _make_producer_user(db, email="b@example.com")
        event = _make_event(db, producer_a.id)

        resp = client.delete(
            f"/events/{event.id}",
            headers=auth_header(user_b),
        )
        assert resp.status_code == 404
        assert resp.json()["detail"] == "Event not found"
        # Existence preserved — the stranger's 404 must not have deleted it.
        assert db.query(Event).filter(Event.id == event.id).first() is not None

    def test_owner_delete_gets_200(self, client, db):
        producer, user = _make_producer_user(db, email="owner@example.com")
        event = _make_event(db, producer.id)

        resp = client.delete(
            f"/events/{event.id}",
            headers=auth_header(user),
        )
        assert resp.status_code == 200
        assert db.query(Event).filter(Event.id == event.id).first() is None

    def test_admin_delete_gets_200(self, client, db):
        """Admin-override must survive the 403->404 change (admin still 200)."""
        producer_a, _ = _make_producer_user(db, email="a@example.com")
        admin = make_user(db, role="admin", email="admin@example.com")
        event = _make_event(db, producer_a.id)

        resp = client.delete(
            f"/events/{event.id}",
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        assert db.query(Event).filter(Event.id == event.id).first() is None
