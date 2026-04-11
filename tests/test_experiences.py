"""API tests for the Experiences (community workshops) feature.

Experiences are community-submitted events: anyone logged in can host
a workshop, cooking class, food tour, nutrition session, etc. Every
submission goes through Claude Haiku pre-moderation (FLAGGED/APPROVED/
REJECTED) and then admin approval before becoming public.

Coverage:
  - Submission: auth, validation, Claude verdict handling, persistence
  - Public listing: only approved visible, filters by category / city
  - Detail visibility: stranger/owner/admin rules for non-approved
  - Admin moderation: approve / request-changes / reject with feedback
  - Full status cycle: pending → changes_requested → pending → approved
  - Owner-only edit/delete + /experiences/mine
  - POST /experiences/validate — no auth, no DB write (real-time hint)

Claude calls are mocked via monkeypatch so tests are deterministic
and don't need ANTHROPIC_API_KEY.
"""
from datetime import date, time, timedelta
from decimal import Decimal

from app.models.models import Experience, User
from conftest import auth_header, make_user


# ---------- helpers ----------


def _payload(**overrides) -> dict:
    """Valid minimal submission payload. Override fields per-test."""
    base = {
        "title": "סדנת אפיית לחם מחמצת לכל המשפחה",
        "description": (
            "סדנה מעשית של 3 שעות ללימוד אפיית לחם מחמצת ביתי מהתחלה "
            "ועד הסוף. מתאים למתחילות ומתקדמות."
        ),
        "image_url": "https://res.cloudinary.com/demo/image/upload/sample.jpg",
        "category": "בישול",
        "event_date": (date.today() + timedelta(days=14)).isoformat(),
        "event_time": "10:00",
        "location_type": "home",
        "city": "תל אביב",
        "address": "רחוב הרצל 1",
        "price_per_person": 150,
        "max_participants": 10,
        "requirements": "סינר ונעליים סגורות",
        "is_recurring": False,
    }
    base.update(overrides)
    return base


def _make_experience(db, host: User, **overrides) -> Experience:
    """Insert an Experience row directly (bypassing the HTTP layer).
    Used for listing/admin tests that don't care about the submission flow."""
    data = {
        "title": "Experience",
        "description": (
            "A detailed description long enough to pass validation — "
            "at least twenty characters of real content."
        ),
        "image_url": "https://res.cloudinary.com/demo/image/upload/sample.jpg",
        "category": "בישול",
        "host_user_id": host.id,
        "event_date": date.today() + timedelta(days=7),
        "event_time": time(10, 0),
        "location_type": "home",
        "city": "תל אביב",
        "max_participants": 10,
        "price_per_person": Decimal("150"),
        "status": "pending",
        "moderation_status": "APPROVED",
    }
    data.update(overrides)
    ex = Experience(**data)
    db.add(ex)
    db.commit()
    db.refresh(ex)
    return ex


def _mock_moderation(monkeypatch, status="APPROVED", reason=None, suggestion=None):
    """Patch the moderation service to return a fixed verdict.

    Applied at both the service module and the router module to cover
    both `from … import validate_experience` and the local reference
    inside the router. Tests that want to simulate FLAGGED/REJECTED
    just change the `status` argument.
    """
    result = {"status": status, "reason": reason, "suggestion": suggestion}

    def _fake_validate(_):
        return result

    import app.services.experience_moderation as mod
    import app.routers.experiences as router_mod

    monkeypatch.setattr(mod, "validate_experience", _fake_validate)
    monkeypatch.setattr(router_mod, "validate_experience", _fake_validate)


# ---------- Submission ----------


class TestExperienceSubmission:
    def test_requires_authentication(self, client):
        assert client.post("/experiences", json=_payload()).status_code == 401

    def test_consumer_can_submit(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch, status="APPROVED")
        user = make_user(db, role="consumer", email="c@test.com")
        resp = client.post(
            "/experiences", json=_payload(), headers=auth_header(user)
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["status"] == "pending"
        assert body["moderation_status"] == "APPROVED"
        assert body["title"] == _payload()["title"]
        assert body["host"]["id"] == str(user.id)
        # spots_left computed
        assert body["spots_left"] == 10

    def test_producer_can_also_submit(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch, status="APPROVED")
        user = make_user(db, role="producer", email="p@test.com")
        resp = client.post(
            "/experiences", json=_payload(), headers=auth_header(user)
        )
        assert resp.status_code == 201

    def test_persisted_as_pending(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch, status="APPROVED")
        user = make_user(db)
        resp = client.post(
            "/experiences", json=_payload(), headers=auth_header(user)
        )
        exp_id = resp.json()["id"]
        row = db.query(Experience).filter(Experience.id == exp_id).first()
        assert row is not None
        assert row.status == "pending"
        assert row.host_user_id == user.id

    def test_flagged_still_pending_but_recorded(self, client, db, monkeypatch):
        _mock_moderation(
            monkeypatch,
            status="FLAGGED",
            reason="תיאור לא ברור",
            suggestion="הוסיפי פרטים על מה שיהיה בסדנה",
        )
        user = make_user(db)
        resp = client.post(
            "/experiences", json=_payload(), headers=auth_header(user)
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["status"] == "pending"
        assert body["moderation_status"] == "FLAGGED"
        assert body["moderation_reason"] == "תיאור לא ברור"

    def test_rejected_blocks_submission(self, client, db, monkeypatch):
        _mock_moderation(
            monkeypatch,
            status="REJECTED",
            reason="תוכן לא רלוונטי לפלטפורמה",
        )
        user = make_user(db)
        resp = client.post(
            "/experiences", json=_payload(), headers=auth_header(user)
        )
        assert resp.status_code == 400
        # Nothing persisted
        assert db.query(Experience).count() == 0

    def test_title_too_short_rejected(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch)
        user = make_user(db)
        resp = client.post(
            "/experiences",
            json=_payload(title="חם"),
            headers=auth_header(user),
        )
        assert resp.status_code == 422

    def test_description_too_short_rejected(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch)
        user = make_user(db)
        resp = client.post(
            "/experiences",
            json=_payload(description="קצר מדי"),
            headers=auth_header(user),
        )
        assert resp.status_code == 422

    def test_invalid_location_type_rejected(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch)
        user = make_user(db)
        resp = client.post(
            "/experiences",
            json=_payload(location_type="farm"),
            headers=auth_header(user),
        )
        assert resp.status_code == 422


# ---------- Real-time validate endpoint ----------


class TestExperienceValidate:
    def test_validate_is_public_and_returns_verdict(
        self, client, db, monkeypatch
    ):
        _mock_moderation(
            monkeypatch,
            status="FLAGGED",
            reason="תיאור חסר מידע",
            suggestion="ספרי מה יהיה בסדנה",
        )
        resp = client.post(
            "/experiences/validate",
            json={"title": "סדנה", "description": "תיאור", "category": "בישול"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "FLAGGED"
        assert body["reason"] == "תיאור חסר מידע"
        assert body["suggestion"] == "ספרי מה יהיה בסדנה"

    def test_validate_does_not_persist(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch, status="APPROVED")
        client.post(
            "/experiences/validate",
            json={"title": "t", "description": "d"},
        )
        assert db.query(Experience).count() == 0


# ---------- Public listing ----------


class TestExperienceListing:
    def test_lists_only_approved(self, client, db):
        host = make_user(db)
        _make_experience(db, host, title="Live", status="approved")
        _make_experience(db, host, title="Wait", status="pending")
        _make_experience(db, host, title="Dead", status="rejected")
        _make_experience(
            db, host, title="Edit", status="changes_requested"
        )
        resp = client.get("/experiences")
        assert resp.status_code == 200
        titles = [e["title"] for e in resp.json()]
        assert titles == ["Live"]

    def test_filter_by_category(self, client, db):
        host = make_user(db)
        _make_experience(
            db, host, title="Cook", category="בישול", status="approved"
        )
        _make_experience(
            db, host, title="Tour", category="סיור אוכל", status="approved"
        )
        resp = client.get("/experiences", params={"category": "בישול"})
        assert [e["title"] for e in resp.json()] == ["Cook"]

    def test_filter_by_city(self, client, db):
        host = make_user(db)
        _make_experience(db, host, title="TLV", city="תל אביב", status="approved")
        _make_experience(db, host, title="JLM", city="ירושלים", status="approved")
        resp = client.get("/experiences", params={"city": "תל אביב"})
        assert [e["title"] for e in resp.json()] == ["TLV"]

    def test_public_listing_hides_private_address(self, client, db):
        """Address is stored on the row but must not leak in the public list."""
        host = make_user(db)
        _make_experience(
            db,
            host,
            title="Private Host",
            status="approved",
            address="רחוב מגורים פרטי 42",
        )
        resp = client.get("/experiences")
        body = resp.json()[0]
        # City is public; street address is not
        assert body.get("city") == "תל אביב"
        assert "address" not in body or body["address"] is None

    def test_spots_left_computed(self, client, db):
        host = make_user(db)
        _make_experience(
            db,
            host,
            title="Spots",
            status="approved",
            max_participants=10,
            participants_count=7,
        )
        resp = client.get("/experiences")
        assert resp.json()[0]["spots_left"] == 3

    def test_past_experiences_are_excluded(self, client, db):
        host = make_user(db)
        _make_experience(
            db,
            host,
            title="Old",
            status="approved",
            event_date=date.today() - timedelta(days=2),
        )
        _make_experience(
            db,
            host,
            title="Soon",
            status="approved",
            event_date=date.today() + timedelta(days=2),
        )
        resp = client.get("/experiences")
        titles = [e["title"] for e in resp.json()]
        assert titles == ["Soon"]


# ---------- Detail view ----------


class TestExperienceDetail:
    def test_404_for_unknown(self, client):
        resp = client.get(
            "/experiences/00000000-0000-0000-0000-000000000000"
        )
        assert resp.status_code == 404

    def test_stranger_cannot_see_pending(self, client, db):
        host = make_user(db)
        ex = _make_experience(db, host, status="pending")
        resp = client.get(f"/experiences/{ex.id}")
        assert resp.status_code == 404

    def test_owner_can_see_own_pending(self, client, db):
        host = make_user(db)
        ex = _make_experience(db, host, status="pending")
        resp = client.get(
            f"/experiences/{ex.id}", headers=auth_header(host)
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "pending"

    def test_admin_can_see_pending(self, client, db):
        host = make_user(db, email="h@t.com")
        admin = make_user(db, role="admin", email="a@t.com")
        ex = _make_experience(db, host, status="pending")
        resp = client.get(
            f"/experiences/{ex.id}", headers=auth_header(admin)
        )
        assert resp.status_code == 200

    def test_approved_visible_publicly(self, client, db):
        host = make_user(db)
        ex = _make_experience(db, host, status="approved")
        resp = client.get(f"/experiences/{ex.id}")
        assert resp.status_code == 200

    def test_owner_detail_exposes_address(self, client, db):
        """The host submitted the address and should see it back."""
        host = make_user(db)
        ex = _make_experience(
            db, host, status="pending", address="רחוב הגפן 5"
        )
        resp = client.get(
            f"/experiences/{ex.id}", headers=auth_header(host)
        )
        assert resp.json().get("address") == "רחוב הגפן 5"


# ---------- Admin moderation ----------


class TestAdminExperienceFlows:
    def test_unauthenticated_returns_401(self, client):
        assert client.get("/admin/experiences").status_code == 401

    def test_consumer_gets_403(self, client, db):
        u = make_user(db, role="consumer")
        resp = client.get("/admin/experiences", headers=auth_header(u))
        assert resp.status_code == 403

    def test_admin_lists_all_by_default(self, client, db):
        host = make_user(db, email="h@t.com")
        admin = make_user(db, role="admin", email="a@t.com")
        _make_experience(db, host, title="P", status="pending")
        _make_experience(db, host, title="A", status="approved")
        _make_experience(db, host, title="R", status="rejected")

        resp = client.get("/admin/experiences", headers=auth_header(admin))
        assert resp.status_code == 200
        assert {e["title"] for e in resp.json()} == {"P", "A", "R"}

    def test_admin_filter_by_status(self, client, db):
        host = make_user(db, email="h@t.com")
        admin = make_user(db, role="admin", email="a@t.com")
        _make_experience(db, host, title="P", status="pending")
        _make_experience(db, host, title="A", status="approved")

        resp = client.get(
            "/admin/experiences",
            params={"status": "pending"},
            headers=auth_header(admin),
        )
        assert [e["title"] for e in resp.json()] == ["P"]

    def test_approve_transitions_status(self, client, db):
        host = make_user(db, email="host@t.com")
        admin = make_user(db, role="admin")
        ex = _make_experience(db, host, status="pending")

        resp = client.post(
            f"/admin/experiences/{ex.id}/approve",
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "approved"

        db.refresh(ex)
        assert ex.status == "approved"

    def test_reject_stores_reason(self, client, db):
        host = make_user(db, email="host@t.com")
        admin = make_user(db, role="admin")
        ex = _make_experience(db, host, status="pending")

        resp = client.post(
            f"/admin/experiences/{ex.id}/reject",
            json={"feedback": "תוכן לא רלוונטי לפלטפורמה"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "rejected"
        assert body["rejection_reason"] == "תוכן לא רלוונטי לפלטפורמה"

    def test_request_changes_requires_feedback(self, client, db):
        host = make_user(db, email="host@t.com")
        admin = make_user(db, role="admin")
        ex = _make_experience(db, host, status="pending")

        resp = client.post(
            f"/admin/experiences/{ex.id}/request-changes",
            json={"feedback": ""},
            headers=auth_header(admin),
        )
        assert resp.status_code == 400

    def test_request_changes_stores_feedback(self, client, db):
        host = make_user(db, email="host@t.com")
        admin = make_user(db, role="admin")
        ex = _make_experience(db, host, status="pending")

        resp = client.post(
            f"/admin/experiences/{ex.id}/request-changes",
            json={"feedback": "הוסיפי כתובת מדויקת ותיאור ארוך יותר"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "changes_requested"
        assert body["admin_feedback"] == "הוסיפי כתובת מדויקת ותיאור ארוך יותר"

    def test_full_status_cycle(self, client, db, monkeypatch):
        """pending → changes_requested → (host edits) → pending → approved"""
        _mock_moderation(monkeypatch, status="APPROVED")
        host = make_user(db, email="host@t.com")
        admin = make_user(db, role="admin")
        ex = _make_experience(db, host, status="pending")

        # 1. Request changes
        client.post(
            f"/admin/experiences/{ex.id}/request-changes",
            json={"feedback": "קצר מדי"},
            headers=auth_header(admin),
        )
        db.refresh(ex)
        assert ex.status == "changes_requested"
        assert ex.admin_feedback == "קצר מדי"

        # 2. Host re-edits → back to pending, feedback cleared
        resp = client.put(
            f"/experiences/{ex.id}",
            json={
                "description": (
                    "תיאור ארוך ומפורט הרבה יותר ששופר בעקבות ההערות מהצוות."
                )
            },
            headers=auth_header(host),
        )
        assert resp.status_code == 200, resp.text
        db.refresh(ex)
        assert ex.status == "pending"
        assert ex.admin_feedback is None

        # 3. Admin approves
        resp = client.post(
            f"/admin/experiences/{ex.id}/approve",
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        db.refresh(ex)
        assert ex.status == "approved"

    def test_approved_becomes_public_after_approval(
        self, client, db, monkeypatch
    ):
        _mock_moderation(monkeypatch)
        host = make_user(db, email="host@t.com")
        admin = make_user(db, role="admin")
        ex = _make_experience(db, host, title="GoLive", status="pending")

        # Not yet visible
        assert client.get("/experiences").json() == []

        client.post(
            f"/admin/experiences/{ex.id}/approve",
            headers=auth_header(admin),
        )

        listed = [e["title"] for e in client.get("/experiences").json()]
        assert "GoLive" in listed


# ---------- Owner-only editing ----------


class TestExperienceEdit:
    def test_non_owner_cannot_edit(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch)
        host = make_user(db, email="a@t.com")
        other = make_user(db, email="b@t.com")
        ex = _make_experience(db, host, status="approved")

        resp = client.put(
            f"/experiences/{ex.id}",
            json={"title": "hijacked"},
            headers=auth_header(other),
        )
        assert resp.status_code == 403

    def test_non_owner_cannot_delete(self, client, db):
        host = make_user(db, email="a@t.com")
        other = make_user(db, email="b@t.com")
        ex = _make_experience(db, host, status="approved")

        resp = client.delete(
            f"/experiences/{ex.id}", headers=auth_header(other)
        )
        assert resp.status_code == 403

    def test_owner_can_delete(self, client, db):
        host = make_user(db)
        ex = _make_experience(db, host)
        resp = client.delete(
            f"/experiences/{ex.id}", headers=auth_header(host)
        )
        assert resp.status_code == 200
        assert db.query(Experience).filter(Experience.id == ex.id).first() is None

    def test_admin_can_delete_any(self, client, db):
        host = make_user(db, email="h@t.com")
        admin = make_user(db, role="admin", email="a@t.com")
        ex = _make_experience(db, host)
        resp = client.delete(
            f"/experiences/{ex.id}", headers=auth_header(admin)
        )
        assert resp.status_code == 200

    def test_mine_returns_all_statuses_for_owner(self, client, db):
        host = make_user(db)
        _make_experience(db, host, title="P", status="pending")
        _make_experience(db, host, title="A", status="approved")
        _make_experience(db, host, title="R", status="rejected")
        resp = client.get("/experiences/mine", headers=auth_header(host))
        assert resp.status_code == 200
        assert {e["title"] for e in resp.json()} == {"P", "A", "R"}

    def test_mine_requires_auth(self, client):
        assert client.get("/experiences/mine").status_code == 401


# ---------- Cross-feature: existing /events is untouched ----------


class TestEventsUntouched:
    """Adding experiences must not regress the existing producer-events flow.

    The existing /events router serves producer farm events (Event model)
    and lives in backend/app/routers/events.py. Experiences live in a
    completely separate table + router and must not collide.
    """

    def test_events_route_still_responds(self, client):
        # Empty is fine — we just want to confirm the route exists and
        # doesn't 500 after the experience router mounts.
        resp = client.get("/events")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
