"""
API tests for the Events & Experiences feature.

Covers:
  - Submission → stored as `pending` with moderation_flags
  - Listing only returns approved events (public)
  - Filters by type / category / city
  - Admin guard + approve / request-changes / reject flow
  - Status transitions and host feedback propagation
  - Re-edit sends event back to pending
  - Auth rules: owner/admin can see non-approved; strangers get 404
"""
from datetime import datetime, timedelta

from app.models.models import Event, User
from conftest import auth_header, make_user


# --- helpers ---


def _event_payload(**overrides) -> dict:
    base = {
        "title": "סדנת אפיית לחם מחמצת",
        "description": "סדנה מעשית של 3 שעות ללימוד אפיית לחם מחמצת ביתי מהתחלה ועד הסוף.",
        "images": ["https://res.cloudinary.com/demo/image/upload/sample.jpg"],
        "type": "experience",
        "category": "בישול",
        "location_type": "home",
        "starts_at": (datetime.utcnow() + timedelta(days=7)).isoformat(),
        "city": "תל אביב",
        "address": "רחוב הרצל 1",
        "price_per_person": 150,
        "max_participants": 10,
        "requirements": "סינר ונעליים סגורות",
        "is_recurring": False,
    }
    base.update(overrides)
    return base


def _make_event(db, host: User, **overrides) -> Event:
    from decimal import Decimal

    data = {
        "title": "Event",
        "description": "A detailed description long enough to pass validation.",
        "images": ["https://res.cloudinary.com/demo/image/upload/sample.jpg"],
        "type": "experience",
        "host_type": "community",
        "location_type": "public",
        "host_user_id": host.id,
        "starts_at": datetime.utcnow() + timedelta(days=7),
        "status": "pending",
        "city": "תל אביב",
        "category": "בישול",
        "price_per_person": Decimal("150"),
        "max_participants": 10,
    }
    data.update(overrides)
    event = Event(**data)
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


# --- Submission ---


class TestEventSubmission:
    def test_requires_authentication(self, client):
        resp = client.post("/events", json=_event_payload())
        assert resp.status_code == 401

    def test_consumer_can_submit_community_experience(self, client, db):
        user = make_user(db, role="consumer", email="c@test.com")
        resp = client.post(
            "/events", json=_event_payload(), headers=auth_header(user)
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["status"] == "pending"
        assert body["host_type"] == "community"
        assert body["type"] == "experience"
        assert body["title"] == "סדנת אפיית לחם מחמצת"
        # spots_left computed from max_participants - participants_count
        assert body["spots_left"] == 10
        # Claude pre-moderation ran (even when API key missing → not_checked)
        assert body["moderation_flags"] is not None
        assert "summary" in body["moderation_flags"]

    def test_submission_is_persisted_as_pending(self, client, db):
        user = make_user(db, email="host@t.com")
        resp = client.post(
            "/events", json=_event_payload(), headers=auth_header(user)
        )
        assert resp.status_code == 201
        event_id = resp.json()["id"]
        row = db.query(Event).filter(Event.id == event_id).first()
        assert row is not None
        assert row.status == "pending"
        assert row.host_user_id == user.id

    def test_title_too_short_rejected(self, client, db):
        user = make_user(db)
        resp = client.post(
            "/events",
            json=_event_payload(title="חמ"),
            headers=auth_header(user),
        )
        assert resp.status_code == 422

    def test_description_too_short_rejected(self, client, db):
        user = make_user(db)
        resp = client.post(
            "/events",
            json=_event_payload(description="קצר"),
            headers=auth_header(user),
        )
        assert resp.status_code == 422

    def test_invalid_type_rejected(self, client, db):
        user = make_user(db)
        resp = client.post(
            "/events",
            json=_event_payload(type="wedding"),
            headers=auth_header(user),
        )
        assert resp.status_code == 422


# --- Public listing ---


class TestEventListing:
    def test_list_returns_only_approved(self, client, db):
        host = make_user(db)
        _make_event(db, host, title="Approved", status="approved")
        _make_event(db, host, title="Pending", status="pending")
        _make_event(db, host, title="Rejected", status="rejected")
        resp = client.get("/events")
        assert resp.status_code == 200
        titles = [e["title"] for e in resp.json()]
        assert titles == ["Approved"]

    def test_filter_by_type(self, client, db):
        host = make_user(db)
        _make_event(db, host, title="Workshop", type="experience", status="approved")
        _make_event(db, host, title="Tour", type="event", status="approved")

        r1 = client.get("/events", params={"type": "experience"})
        assert [e["title"] for e in r1.json()] == ["Workshop"]

        r2 = client.get("/events", params={"type": "event"})
        assert [e["title"] for e in r2.json()] == ["Tour"]

    def test_filter_by_category(self, client, db):
        host = make_user(db)
        _make_event(db, host, title="Cook", category="בישול", status="approved")
        _make_event(db, host, title="Farm", category="חקלאות", status="approved")
        resp = client.get("/events", params={"category": "בישול"})
        assert [e["title"] for e in resp.json()] == ["Cook"]

    def test_filter_by_city(self, client, db):
        host = make_user(db)
        _make_event(db, host, title="TLV", city="תל אביב", status="approved")
        _make_event(db, host, title="JLM", city="ירושלים", status="approved")
        resp = client.get("/events", params={"city": "תל אביב"})
        assert [e["title"] for e in resp.json()] == ["TLV"]

    def test_spots_left_computed(self, client, db):
        host = make_user(db)
        _make_event(
            db,
            host,
            title="Spots",
            status="approved",
            max_participants=10,
            participants_count=7,
        )
        resp = client.get("/events")
        assert resp.json()[0]["spots_left"] == 3


# --- Detail view (visibility rules) ---


class TestEventDetail:
    def test_404_for_unknown(self, client):
        resp = client.get("/events/00000000-0000-0000-0000-000000000000")
        assert resp.status_code == 404

    def test_stranger_cannot_see_pending(self, client, db):
        host = make_user(db)
        ev = _make_event(db, host, status="pending")
        resp = client.get(f"/events/{ev.id}")
        assert resp.status_code == 404

    def test_owner_can_see_own_pending(self, client, db):
        host = make_user(db)
        ev = _make_event(db, host, status="pending")
        resp = client.get(f"/events/{ev.id}", headers=auth_header(host))
        assert resp.status_code == 200
        assert resp.json()["status"] == "pending"

    def test_admin_can_see_pending(self, client, db):
        host = make_user(db)
        admin = make_user(db, role="admin")
        ev = _make_event(db, host, status="pending")
        resp = client.get(f"/events/{ev.id}", headers=auth_header(admin))
        assert resp.status_code == 200

    def test_approved_visible_publicly(self, client, db):
        host = make_user(db)
        ev = _make_event(db, host, status="approved")
        resp = client.get(f"/events/{ev.id}")
        assert resp.status_code == 200


# --- Admin moderation ---


class TestAdminEventFlows:
    def test_consumer_cannot_access_admin_list(self, client, db):
        u = make_user(db, role="consumer")
        assert (
            client.get("/admin/events", headers=auth_header(u)).status_code == 403
        )

    def test_unauthenticated_admin_list_returns_401(self, client):
        assert client.get("/admin/events").status_code == 401

    def test_admin_can_list_all_statuses(self, client, db):
        host = make_user(db, email="h@t.com")
        admin = make_user(db, role="admin", email="a@t.com")
        _make_event(db, host, title="P", status="pending")
        _make_event(db, host, title="A", status="approved")

        r_all = client.get("/admin/events", headers=auth_header(admin))
        assert r_all.status_code == 200
        assert len(r_all.json()) == 2

        r_pending = client.get(
            "/admin/events",
            params={"status": "pending"},
            headers=auth_header(admin),
        )
        assert [e["title"] for e in r_pending.json()] == ["P"]

    def test_approve_transitions_status(self, client, db):
        host = make_user(db, email="host@t.com")
        admin = make_user(db, role="admin")
        ev = _make_event(db, host, status="pending")

        resp = client.post(
            f"/admin/events/{ev.id}/approve", headers=auth_header(admin)
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "approved"

        db.refresh(ev)
        assert ev.status == "approved"

    def test_reject_stores_reason(self, client, db):
        host = make_user(db, email="host@t.com")
        admin = make_user(db, role="admin")
        ev = _make_event(db, host, status="pending")

        resp = client.post(
            f"/admin/events/{ev.id}/reject",
            json={"feedback": "תוכן לא רלוונטי"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "rejected"
        assert body["rejection_reason"] == "תוכן לא רלוונטי"

        db.refresh(ev)
        assert ev.status == "rejected"

    def test_request_changes_requires_feedback(self, client, db):
        host = make_user(db, email="host@t.com")
        admin = make_user(db, role="admin")
        ev = _make_event(db, host, status="pending")

        # Empty feedback → 400
        resp = client.post(
            f"/admin/events/{ev.id}/request-changes",
            json={"feedback": ""},
            headers=auth_header(admin),
        )
        assert resp.status_code == 400

    def test_request_changes_stores_feedback(self, client, db):
        host = make_user(db, email="host@t.com")
        admin = make_user(db, role="admin")
        ev = _make_event(db, host, status="pending")

        resp = client.post(
            f"/admin/events/{ev.id}/request-changes",
            json={"feedback": "הוסף כתובת מלאה"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "changes_requested"
        assert body["admin_feedback"] == "הוסף כתובת מלאה"

    def test_full_status_cycle(self, client, db):
        """pending → changes_requested → (host edits) → pending → approved"""
        host = make_user(db, email="host@t.com")
        admin = make_user(db, role="admin")
        ev = _make_event(db, host, status="pending")

        # 1. Request changes
        client.post(
            f"/admin/events/{ev.id}/request-changes",
            json={"feedback": "קצר מדי"},
            headers=auth_header(admin),
        )
        db.refresh(ev)
        assert ev.status == "changes_requested"

        # 2. Host re-edits → back to pending
        resp = client.put(
            f"/events/{ev.id}",
            json={
                "description": "תיאור ארוך ומפורט הרבה יותר ששופר לאחר ההערות של הצוות."
            },
            headers=auth_header(host),
        )
        assert resp.status_code == 200
        db.refresh(ev)
        assert ev.status == "pending"
        assert ev.admin_feedback is None

        # 3. Admin approves
        resp = client.post(
            f"/admin/events/{ev.id}/approve", headers=auth_header(admin)
        )
        assert resp.status_code == 200
        db.refresh(ev)
        assert ev.status == "approved"

    def test_approved_event_is_public_after_approval(self, client, db):
        host = make_user(db, email="host@t.com")
        admin = make_user(db, role="admin")
        ev = _make_event(db, host, title="GoLive", status="pending")

        # Not yet visible
        assert client.get("/events").json() == []

        client.post(f"/admin/events/{ev.id}/approve", headers=auth_header(admin))

        listed = [e["title"] for e in client.get("/events").json()]
        assert "GoLive" in listed


# --- Owner-only editing ---


class TestEventEdit:
    def test_non_owner_cannot_edit(self, client, db):
        host = make_user(db, email="a@t.com")
        other = make_user(db, email="b@t.com")
        ev = _make_event(db, host, status="approved")

        resp = client.put(
            f"/events/{ev.id}",
            json={"title": "hijacked"},
            headers=auth_header(other),
        )
        assert resp.status_code == 403

    def test_non_owner_cannot_delete(self, client, db):
        host = make_user(db, email="a@t.com")
        other = make_user(db, email="b@t.com")
        ev = _make_event(db, host, status="approved")

        resp = client.delete(f"/events/{ev.id}", headers=auth_header(other))
        assert resp.status_code == 403

    def test_owner_can_delete(self, client, db):
        host = make_user(db)
        ev = _make_event(db, host)
        resp = client.delete(f"/events/{ev.id}", headers=auth_header(host))
        assert resp.status_code == 200
        assert db.query(Event).filter(Event.id == ev.id).first() is None

    def test_mine_returns_all_statuses_for_owner(self, client, db):
        host = make_user(db)
        _make_event(db, host, title="P", status="pending")
        _make_event(db, host, title="A", status="approved")
        _make_event(db, host, title="R", status="rejected")
        resp = client.get("/events/mine", headers=auth_header(host))
        assert resp.status_code == 200
        titles = {e["title"] for e in resp.json()}
        assert titles == {"P", "A", "R"}
