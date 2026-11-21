"""Part 2 of 2 of `tests/test_experiences.py`: TestExperienceEdit, TestExperienceCancelToggle, TestExperienceSignupCount, TestExperienceMinParticipants, TestExperiencePinPrivacy, TestEventsUntouched, TestHostBusinessLink.

Moved here verbatim by the MEH-3540 mechanical split. Not collected
directly (no `test_` prefix): `tests/test_experiences.py` imports these tests, so
their node ids stay `tests/test_experiences.py::...`. Run them with
`pytest tests/test_experiences.py` (add `-k <ClassName>` to narrow).
"""

from app.models.models import Experience
from conftest import auth_header
from conftest import make_user
from _test_experiences__common import _make_experience  # noqa: F401
from _test_experiences__common import _make_host  # noqa: F401
from _test_experiences__common import _mock_moderation  # noqa: F401
from _test_experiences__common import _payload  # noqa: F401

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
        # MEH-1001: 404 (was 403) — non-owner must not confirm existence.
        assert resp.status_code == 404

    # MEH-2013: ExperienceUpdate.city stays Optional on purpose. Making it
    # required would 422 every edit of a row written before the create-side
    # rule existed — the owner would be locked out of her own experience by a
    # field she never had the chance to fill.
    def test_editing_a_row_that_predates_the_city_rule_still_works(
        self, client, db, monkeypatch
    ):
        _mock_moderation(monkeypatch)
        host = make_user(db)
        ex = _make_experience(db, host, city=None, status="approved")

        resp = client.put(
            f"/experiences/{ex.id}",
            json={"title": "כותרת מעודכנת לסדנה"},
            headers=auth_header(host),
        )

        assert resp.status_code == 200
        db.refresh(ex)
        assert ex.city is None  # untouched, not backfilled

    def test_a_legacy_null_city_row_still_renders(self, client, db):
        """The read paths must not 500 on the rows the old create path let
        through — ExperienceListOut.city is `str | None`, and it stays so."""
        host = _make_host(db)
        _make_experience(db, host, city=None, status="approved")

        resp = client.get("/experiences")

        assert resp.status_code == 200
        assert [e["city"] for e in resp.json()] == [None]

    def test_non_owner_cannot_delete(self, client, db):
        host = make_user(db, email="a@t.com")
        other = make_user(db, email="b@t.com")
        ex = _make_experience(db, host, status="approved")

        resp = client.delete(
            f"/experiences/{ex.id}", headers=auth_header(other)
        )
        # MEH-1001: 404 (was 403) — non-owner must not confirm existence.
        assert resp.status_code == 404

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


# ---------- Reversible cancel (is_active) — MEH-1419 ----------


class TestExperienceCancelToggle:
    """MEH-1419 — a host can reversibly cancel/reactivate an approved
    experience via PUT {is_active}. Mirrors Event.is_active: cancelled drops
    from the public feed, stays on /mine, and a pure toggle must NOT re-run
    moderation (an approved experience stays approved)."""

    def test_public_list_hides_cancelled(self, client, db):
        host = _make_host(db)
        _make_experience(db, host, title="Live", status="approved", is_active=True)
        _make_experience(db, host, title="Off", status="approved", is_active=False)
        resp = client.get("/experiences")
        assert resp.status_code == 200
        assert [e["title"] for e in resp.json()] == ["Live"]

    def test_mine_includes_cancelled_with_flag(self, client, db):
        host = make_user(db)
        _make_experience(db, host, title="Live", status="approved", is_active=True)
        _make_experience(db, host, title="Off", status="approved", is_active=False)
        resp = client.get("/experiences/mine", headers=auth_header(host))
        assert resp.status_code == 200
        by_title = {e["title"]: e for e in resp.json()}
        assert by_title["Off"]["is_active"] is False
        assert by_title["Live"]["is_active"] is True

    def test_owner_can_cancel_and_reactivate(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch, status="APPROVED")
        host = _make_host(db)
        ex = _make_experience(db, host, title="Toggle", status="approved")

        # Cancel → drops from public feed
        resp = client.put(
            f"/experiences/{ex.id}",
            json={"is_active": False},
            headers=auth_header(host),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["is_active"] is False
        assert [e["title"] for e in client.get("/experiences").json()] == []

        # Reactivate → returns to the public feed
        resp = client.put(
            f"/experiences/{ex.id}",
            json={"is_active": True},
            headers=auth_header(host),
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is True
        assert [e["title"] for e in client.get("/experiences").json()] == ["Toggle"]

    def test_pure_toggle_does_not_re_moderate_approved(self, client, db, monkeypatch):
        """A cancel that only flips is_active must keep status=approved —
        it must NOT reset to pending like a content edit does."""
        _mock_moderation(monkeypatch, status="APPROVED")
        host = make_user(db)
        ex = _make_experience(db, host, status="approved")

        resp = client.put(
            f"/experiences/{ex.id}",
            json={"is_active": False},
            headers=auth_header(host),
        )
        assert resp.status_code == 200
        db.refresh(ex)
        assert ex.status == "approved"  # not bumped back to pending
        assert ex.is_active is False

    def test_content_edit_still_re_moderates(self, client, db, monkeypatch):
        """Guard is scoped: a real content edit on an approved experience
        still resets it to pending (existing behaviour preserved)."""
        _mock_moderation(monkeypatch, status="APPROVED")
        host = make_user(db)
        ex = _make_experience(db, host, status="approved")

        resp = client.put(
            f"/experiences/{ex.id}",
            json={
                "description": (
                    "תיאור חדש וארוך דיו שמכיל יותר מעשרים תווים אמיתיים."
                )
            },
            headers=auth_header(host),
        )
        assert resp.status_code == 200
        db.refresh(ex)
        assert ex.status == "pending"


# ---------- Sign-up count (MEH-2663) ----------


class TestExperienceSignupCount:
    """Sign-up happens on WhatsApp, so the host types how many signed up.
    PUT {participants_count} updates spots_left and — like is_active — must
    not send an approved experience back to moderation."""

    def test_owner_sets_count_spots_left_follows(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch, status="APPROVED")
        host = _make_host(db)
        ex = _make_experience(db, host, status="approved", max_participants=8)
        resp = client.put(
            f"/experiences/{ex.id}",
            json={"participants_count": 6},
            headers=auth_header(host),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["participants_count"] == 6
        assert body["spots_left"] == 2
        db.refresh(ex)
        assert ex.status == "approved"  # not bumped back to pending

    def test_count_and_toggle_together_still_no_re_moderation(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch, status="APPROVED")
        host = _make_host(db)
        ex = _make_experience(db, host, status="approved", max_participants=8)
        resp = client.put(
            f"/experiences/{ex.id}",
            json={"participants_count": 8, "is_active": True},
            headers=auth_header(host),
        )
        assert resp.status_code == 200
        assert resp.json()["spots_left"] == 0
        db.refresh(ex)
        assert ex.status == "approved"

    def test_count_with_content_edit_re_moderates(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch, status="APPROVED")
        host = _make_host(db)
        ex = _make_experience(db, host, status="approved", max_participants=8)
        resp = client.put(
            f"/experiences/{ex.id}",
            json={"participants_count": 2, "title": "כותרת חדשה לגמרי"},
            headers=auth_header(host),
        )
        assert resp.status_code == 200
        db.refresh(ex)
        assert ex.status == "pending"

    def test_negative_count_rejected(self, client, db):
        host = _make_host(db)
        ex = _make_experience(db, host, status="approved", max_participants=8)
        resp = client.put(
            f"/experiences/{ex.id}",
            json={"participants_count": -1},
            headers=auth_header(host),
        )
        assert resp.status_code == 422

    def test_count_above_cap_is_clamped_to_cap(self, client, db, monkeypatch):
        # The dashboard clamps too; a direct PUT must not store 12 of 8.
        _mock_moderation(monkeypatch, status="APPROVED")
        host = _make_host(db)
        ex = _make_experience(db, host, status="approved", max_participants=8)
        resp = client.put(
            f"/experiences/{ex.id}",
            json={"participants_count": 12},
            headers=auth_header(host),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["participants_count"] == 8
        assert resp.json()["spots_left"] == 0
        db.refresh(ex)
        assert ex.participants_count == 8

    def test_explicit_null_count_stores_zero(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch, status="APPROVED")
        host = _make_host(db)
        ex = _make_experience(db, host, status="approved", max_participants=8)
        ex.participants_count = 5
        db.commit()
        resp = client.put(
            f"/experiences/{ex.id}",
            json={"participants_count": None},
            headers=auth_header(host),
        )
        assert resp.status_code == 200, resp.text
        db.refresh(ex)
        assert ex.participants_count == 0
        assert ex.status == "approved"

    def test_stranger_cannot_set_count(self, client, db):
        host = _make_host(db)
        stranger = make_user(db)
        ex = _make_experience(db, host, status="approved", max_participants=8)
        resp = client.put(
            f"/experiences/{ex.id}",
            json={"participants_count": 8},
            headers=auth_header(stranger),
        )
        assert resp.status_code == 404
        db.refresh(ex)
        assert (ex.participants_count or 0) == 0


class TestExperienceMinParticipants:
    """Stage B: an optional minimum to run the experience. It must be stored,
    read back on the public detail, and never exceed the max."""

    def test_submit_stores_min_and_detail_returns_it(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch, status="APPROVED")
        host = make_user(db, role="producer", email="minp@test.com")
        resp = client.post(
            "/experiences",
            json=_payload(min_participants=4, max_participants=10),
            headers=auth_header(host),
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["min_participants"] == 4

    def test_submit_min_above_max_rejected(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch, status="APPROVED")
        host = make_user(db, role="producer", email="minp@test.com")
        resp = client.post(
            "/experiences",
            json=_payload(min_participants=12, max_participants=10),
            headers=auth_header(host),
        )
        assert resp.status_code == 422
        assert resp.json()["detail"] == "המינימום לא יכול להיות גדול מהמקסימום"

    def test_public_list_carries_min(self, client, db):
        host = _make_host(db)
        _make_experience(db, host, status="approved", min_participants=3)
        rows = client.get("/experiences").json()
        assert [r["min_participants"] for r in rows] == [3]

    def test_update_min_above_existing_max_rejected(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch, status="APPROVED")
        host = _make_host(db)
        ex = _make_experience(db, host, status="approved", max_participants=8)
        resp = client.put(
            f"/experiences/{ex.id}",
            json={"min_participants": 9},
            headers=auth_header(host),
        )
        assert resp.status_code == 422
        db.refresh(ex)
        assert ex.min_participants is None

    def test_update_lowering_max_below_min_rejected(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch, status="APPROVED")
        host = _make_host(db)
        ex = _make_experience(db, host, max_participants=8, min_participants=5)
        resp = client.put(
            f"/experiences/{ex.id}",
            json={"max_participants": 4},
            headers=auth_header(host),
        )
        assert resp.status_code == 422
        db.refresh(ex)
        assert ex.max_participants == 8

    def test_update_clearing_min_stores_null(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch, status="APPROVED")
        host = _make_host(db)
        ex = _make_experience(db, host, max_participants=8, min_participants=5)
        resp = client.put(
            f"/experiences/{ex.id}",
            json={"min_participants": None},
            headers=auth_header(host),
        )
        assert resp.status_code == 200, resp.text
        db.refresh(ex)
        assert ex.min_participants is None

    def test_unrelated_edit_not_blocked_by_inverted_stored_pair(
        self, client, db, monkeypatch
    ):
        _mock_moderation(monkeypatch, status="APPROVED")
        host = _make_host(db)
        ex = _make_experience(db, host, max_participants=4, min_participants=6)
        resp = client.put(
            f"/experiences/{ex.id}",
            json={"participants_count": 2},
            headers=auth_header(host),
        )
        assert resp.status_code == 200, resp.text
        db.refresh(ex)
        assert ex.participants_count == 2

    def test_editing_min_alone_keeps_approved_without_moderation(
        self, client, db, monkeypatch
    ):
        calls = []

        def _boom(*a, **k):
            calls.append(1)
            raise AssertionError("moderation must not run on a min-only edit")

        import app.routers.experiences as router_mod

        monkeypatch.setattr(router_mod, "validate_experience", _boom)
        host = _make_host(db)
        ex = _make_experience(db, host, status="approved", max_participants=8)
        resp = client.put(
            f"/experiences/{ex.id}",
            json={"min_participants": 4},
            headers=auth_header(host),
        )
        assert resp.status_code == 200, resp.text
        db.refresh(ex)
        assert ex.min_participants == 4
        assert ex.status == "approved"
        assert calls == []

    def test_min_zero_rejected(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch, status="APPROVED")
        host = make_user(db, role="producer", email="minp@test.com")
        resp = client.post(
            "/experiences",
            json=_payload(min_participants=0),
            headers=auth_header(host),
        )
        assert resp.status_code == 422


# ---------- Location-pin privacy (MEH-1417) ----------


class TestExperiencePinPrivacy:
    """A home experience hides its street address from strangers; the
    lat/lng must be hidden too, or MEH-1404's MiniMap redraws the exact
    residence as a pin. Public (commercial) venues keep their pin."""

    def test_stranger_home_experience_hides_coords_and_address(
        self, client, db
    ):
        host = _make_host(db)
        ex = _make_experience(
            db,
            host,
            status="approved",
            location_type="home",
            address="רחוב מגורים פרטי 42",
            lat=32.0853,
            lng=34.7818,
        )
        body = client.get(f"/experiences/{ex.id}").json()
        assert body["address"] is None
        assert body["lat"] is None
        assert body["lng"] is None

    def test_stranger_public_experience_keeps_coords(self, client, db):
        host = _make_host(db)
        ex = _make_experience(
            db,
            host,
            status="approved",
            location_type="public",
            lat=32.0853,
            lng=34.7818,
        )
        body = client.get(f"/experiences/{ex.id}").json()
        assert body["lat"] is not None
        assert body["lng"] is not None

    def test_owner_home_experience_keeps_coords(self, client, db):
        host = make_user(db)
        ex = _make_experience(
            db,
            host,
            status="approved",
            location_type="home",
            address="רחוב הגפן 5",
            lat=32.0853,
            lng=34.7818,
        )
        body = client.get(
            f"/experiences/{ex.id}", headers=auth_header(host)
        ).json()
        assert body["address"] == "רחוב הגפן 5"
        assert body["lat"] is not None
        assert body["lng"] is not None

    def test_admin_home_experience_keeps_coords(self, client, db):
        host = make_user(db, email="h@example.com")
        admin = make_user(db, role="admin", email="a@example.com")
        ex = _make_experience(
            db,
            host,
            status="approved",
            location_type="home",
            lat=32.0853,
            lng=34.7818,
        )
        body = client.get(
            f"/experiences/{ex.id}", headers=auth_header(admin)
        ).json()
        assert body["lat"] is not None
        assert body["lng"] is not None


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


# ---------- MEH-2476: the host's business is linked ----------


class TestHostBusinessLink:
    """The public payload names the host's approved business so the page can
    link to it and its WhatsApp CTA can reach her. A host's business is
    always approved on a public path (MEH-1749), so the fields are filled
    whenever the experience is visible at all."""

    def _approved_with_business(self, db):
        host = _make_host(db)
        producer = host.producer
        producer.slug = "meh2476-farm"
        producer.phone = "0521234567"
        db.commit()
        _make_experience(db, host, status="approved")
        return producer

    def test_list_carries_the_business(self, client, db):
        producer = self._approved_with_business(db)
        rows = client.get("/experiences").json()
        assert len(rows) == 1
        host = rows[0]["host"]
        assert host["producer_id"] == str(producer.id)
        assert host["producer_slug"] == "meh2476-farm"
        assert host["producer_name"] == producer.name
        assert host["producer_phone"] == "0521234567"

    def test_detail_carries_the_business(self, client, db):
        producer = self._approved_with_business(db)
        ex_id = client.get("/experiences").json()[0]["id"]
        host = client.get(f"/experiences/{ex_id}").json()["host"]
        assert host["producer_id"] == str(producer.id)

    def test_owner_without_an_approved_business_gets_no_link(self, client, db):
        """The owner still sees her pending business's experience (owner path),
        but no link is built to a business page that 404s for everyone else."""
        host = _make_host(db, producer_status="pending")
        ex = _make_experience(db, host, status="approved")
        host_out = client.get(f"/experiences/{ex.id}", headers=auth_header(host)).json()["host"]
        assert host_out["name"] == host.name
        assert host_out.get("producer_id") is None
        assert host_out.get("producer_slug") is None
