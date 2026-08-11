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
from app.utils.clock import israel_today
from conftest import auth_header, make_producer, make_user


def _make_host(db, *, producer_status: str = "approved", **user_kwargs) -> User:
    """A host whose business is approved.

    MEH-1749 gated the public read paths on the host's business status, so a
    plain `make_user(db)` host is no longer publicly visible — its experiences
    are correctly filtered out. Public-visibility tests therefore build their
    host through here; owner/admin tests keep using `make_user` directly,
    because those paths bypass the gate by design.

    "Public read path" is the whole test, not just its subject. A test whose
    *subject* is cancellation or pin privacy still asserts through
    `GET /experiences` — so it needs a host with a business even though the
    business is not what it is testing. Six such tests were missed on the first
    sweep and only CI caught them; the criterion is **does this test read a
    public path**, never **is this test about visibility**.

    `**user_kwargs` forwards to `make_user` (e.g. `email=`) for tests that pin
    explicit addresses to keep two actors apart.

    Pass `producer_status="pending"` / `"rejected"` to exercise the gate.
    """
    host = make_user(db, **user_kwargs)
    producer = make_producer(db, status=producer_status)
    host.producer_id = producer.id
    db.commit()
    db.refresh(host)
    return host


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

    # MEH-2013: the form labels both "עיר *" and "סוג מיקום *", and the client
    # now blocks each — but MEH-1153's precedent is that a direct POST must be
    # blocked too, not just the browser. These four assert the write boundary.
    def test_missing_city_rejected(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch)
        user = make_user(db)
        payload = _payload()
        del payload["city"]
        resp = client.post(
            "/experiences", json=payload, headers=auth_header(user)
        )
        assert resp.status_code == 422
        assert db.query(Experience).count() == 0

    def test_blank_city_rejected(self, client, db, monkeypatch):
        """min_length=1 alone would accept "   " — which is city-less by the
        only meaning that matters, since the /experiences city filter would
        still never match it."""
        _mock_moderation(monkeypatch)
        user = make_user(db)
        resp = client.post(
            "/experiences",
            json=_payload(city="   "),
            headers=auth_header(user),
        )
        assert resp.status_code == 422

    def test_missing_location_type_rejected(self, client, db, monkeypatch):
        """Previously defaulted to "home" server-side, which silently framed
        every direct submission as taking place in a private residence — the
        branch that hides lat/lng (experiences.py:309)."""
        _mock_moderation(monkeypatch)
        user = make_user(db)
        payload = _payload()
        del payload["location_type"]
        resp = client.post(
            "/experiences", json=payload, headers=auth_header(user)
        )
        assert resp.status_code == 422
        assert db.query(Experience).count() == 0

    def test_city_is_stored_stripped(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch)
        user = make_user(db)
        resp = client.post(
            "/experiences",
            json=_payload(city="  תל אביב  "),
            headers=auth_header(user),
        )
        assert resp.status_code == 201
        assert db.query(Experience).one().city == "תל אביב"


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


# ---------- Public count (MEH-1918) ----------


class TestExperienceCount:
    """GET /experiences/count — the number the nav gates the link on.

    Every case here asserts the count against the SAME fixture the listing
    tests use for the equivalent exclusion, because a count that disagrees
    with the list it advertises is the whole failure mode: the nav would
    promise a page that renders empty.
    """

    def test_counts_only_publicly_listed(self, client, db):
        host = _make_host(db)
        _make_experience(db, host, title="Live", status="approved")
        _make_experience(db, host, title="Wait", status="pending")
        _make_experience(db, host, title="Dead", status="rejected")
        _make_experience(db, host, title="Edit", status="changes_requested")

        resp = client.get("/experiences/count")
        assert resp.status_code == 200
        assert resp.json() == {"count": 1}

    def test_past_experiences_are_not_counted(self, client, db):
        host = _make_host(db)
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
        assert client.get("/experiences/count").json() == {"count": 1}

    def test_today_still_counts(self, client, db):
        """The boundary the filter is `>=`, not `>` — an experience happening
        today is still orderable and must not vanish from the count at
        midnight.

        MEH-1918: seed with `israel_today()`, NOT `date.today()`. The route
        filters on `event_date >= israel_today()` and the CI runner is UTC, so
        between 21:00 and 24:00 UTC (Israel is UTC+3 in summer) Israel has
        already rolled over and a row dated UTC-today is in the PAST. This
        test asserted the exact boundary using the wrong clock and duly went
        red at 23:39 UTC with `{'count': 0} == {'count': 1}` — the very
        midnight vanishing it exists to forbid.

        Only the exact-today case is fragile: the other offsets in this file
        (±2, ±7, ±14 days) carry days of slack that a 3-hour skew cannot flip,
        which is why this is a one-line fix and not a sweep. `app/utils/clock.py`
        names the window in its own docstring: "UTC Fri 22:00 is already Sat in
        Israel."
        """
        host = _make_host(db)
        _make_experience(
            db, host, title="Today", status="approved", event_date=israel_today()
        )
        assert client.get("/experiences/count").json() == {"count": 1}

    def test_cancelled_experiences_are_not_counted(self, client, db):
        host = _make_host(db)
        _make_experience(db, host, title="On", status="approved", is_active=True)
        _make_experience(db, host, title="Off", status="approved", is_active=False)
        assert client.get("/experiences/count").json() == {"count": 1}

    def test_unapproved_business_is_not_counted(self, client, db):
        """MEH-1749's gate: approved experience, unapproved host business."""
        pending_host = _make_host(db, producer_status="pending", email="pend@example.com")
        _make_experience(db, pending_host, title="Hidden", status="approved")
        assert client.get("/experiences/count").json() == {"count": 0}

        approved_host = _make_host(db, email="ok@example.com")
        _make_experience(db, approved_host, title="Shown", status="approved")
        assert client.get("/experiences/count").json() == {"count": 1}

    def test_count_matches_the_listing_length_exactly(self, client, db):
        """The invariant the nav actually depends on. Built from a mixed bag so
        every exclusion above is exercised at once — if any filter drifts
        between the two callers, these two numbers stop agreeing."""
        host = _make_host(db)
        other = _make_host(db, producer_status="rejected", email="rej@example.com")
        _make_experience(db, host, title="A", status="approved")
        _make_experience(db, host, title="B", status="approved")
        _make_experience(db, host, title="C", status="pending")
        _make_experience(db, host, title="D", status="approved", is_active=False)
        _make_experience(
            db,
            host,
            title="E",
            status="approved",
            event_date=date.today() - timedelta(days=1),
        )
        _make_experience(db, other, title="F", status="approved")

        listing = client.get("/experiences").json()
        count = client.get("/experiences/count").json()["count"]
        assert count == len(listing) == 2

    def test_empty_database_returns_zero(self, client, db):
        assert client.get("/experiences/count").json() == {"count": 0}

    def test_is_public_no_auth_required(self, client, db):
        """No Authorization header anywhere in this class — asserted once,
        explicitly, so the route cannot quietly acquire a dependency."""
        resp = client.get("/experiences/count")
        assert resp.status_code == 200
        assert set(resp.json()) == {"count"}

    def test_count_is_not_swallowed_by_the_detail_route(self, client, db):
        """Route ORDER, not behaviour: declared after `/{experience_id}` the
        path would arrive as an id of "count". A 422/404 here means the
        catch-all won."""
        resp = client.get("/experiences/count")
        assert resp.status_code == 200, resp.text
        assert isinstance(resp.json().get("count"), int)


# ---------- Public listing ----------


class TestExperienceListing:
    def test_lists_only_approved(self, client, db):
        host = _make_host(db)
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
        host = _make_host(db)
        _make_experience(
            db, host, title="Cook", category="בישול", status="approved"
        )
        _make_experience(
            db, host, title="Tour", category="סיור אוכל", status="approved"
        )
        resp = client.get("/experiences", params={"category": "בישול"})
        assert [e["title"] for e in resp.json()] == ["Cook"]

    def test_filter_by_city(self, client, db):
        host = _make_host(db)
        _make_experience(db, host, title="TLV", city="תל אביב", status="approved")
        _make_experience(db, host, title="JLM", city="ירושלים", status="approved")
        resp = client.get("/experiences", params={"city": "תל אביב"})
        assert [e["title"] for e in resp.json()] == ["TLV"]

    def test_public_listing_hides_private_address(self, client, db):
        """Address is stored on the row but must not leak in the public list."""
        host = _make_host(db)
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
        host = _make_host(db)
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
        host = _make_host(db)
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
        host = _make_host(db)
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
        host = _make_host(db)
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


class TestPublicVisibilityRequiresApprovedBusiness:
    """MEH-1749 — LOCK (בעלי עסק מורשים בלבד): an experience reaches the
    public only when the business behind its host is approved.

    Experiences were the only content surface without this gate. Because
    `Experience.host_user_id` points at a User rather than a Producer, a host
    whose business was rejected — for missing a licence, say — could still
    publish publicly through her user account.

    These assert BEHAVIOUR (what a stranger receives), never that a particular
    filter was added. A test that checked for the filter would pass against an
    inert change; this one cannot.
    """

    def test_pending_business_experience_absent_from_listing(self, client, db):
        host = _make_host(db, producer_status="pending")
        _make_experience(db, host, title="TooEarly", status="approved")
        resp = client.get("/experiences")
        assert resp.status_code == 200
        assert [e["title"] for e in resp.json()] == []

    def test_rejected_business_experience_absent_from_listing(self, client, db):
        host = _make_host(db, producer_status="rejected")
        _make_experience(db, host, title="Rejected", status="approved")
        assert [e["title"] for e in client.get("/experiences").json()] == []

    def test_host_with_no_business_at_all_is_absent(self, client, db):
        """The INNER JOIN case: producer_id IS NULL. A plain consumer account
        can still submit; it just doesn't get a public surface."""
        host = make_user(db)
        _make_experience(db, host, title="NoBusiness", status="approved")
        assert [e["title"] for e in client.get("/experiences").json()] == []

    def test_pending_business_experience_404s_on_detail(self, client, db):
        """404 rather than 403 — same convention as events.py:167, so the UUID
        cannot be used to enumerate which businesses are awaiting approval."""
        host = _make_host(db, producer_status="pending")
        ex = _make_experience(db, host, status="approved")
        resp = client.get(f"/experiences/{ex.id}")
        assert resp.status_code == 404

    def test_detail_404_also_starves_the_seo_metadata_fetch(self, client, db):
        """The generateMetadata path, asserted at its real boundary.

        `frontend/app/[locale]/experiences/[id]/page.js:14` server-fetches THIS
        endpoint with no auth and falls back when the response is not ok. So
        the title of a pending business's experience stays out of <head>
        precisely because this request 404s — there is no separate frontend
        gate to test, and adding one would be a second copy (MEH-1740).
        """
        host = _make_host(db, producer_status="rejected")
        ex = _make_experience(db, host, status="approved")
        unauthenticated = client.get(f"/experiences/{ex.id}")
        assert unauthenticated.status_code == 404
        assert "title" not in unauthenticated.json()

    def test_owner_still_sees_her_own_while_business_pending(self, client, db):
        """The gate must not hide the host's work from the host."""
        host = _make_host(db, producer_status="pending")
        ex = _make_experience(db, host, status="approved")
        resp = client.get(f"/experiences/{ex.id}", headers=auth_header(host))
        assert resp.status_code == 200
        assert resp.json()["id"] == str(ex.id)

    def test_admin_still_sees_it_while_business_pending(self, client, db):
        host = _make_host(db, producer_status="pending")
        admin = make_user(db, role="admin", email="admin-1749@test.com")
        ex = _make_experience(db, host, status="approved")
        resp = client.get(f"/experiences/{ex.id}", headers=auth_header(admin))
        assert resp.status_code == 200

    def test_approved_business_is_visible_on_both_paths(self, client, db):
        """The other half of the discrimination: the gate must not hide
        legitimate content. Without this, filtering everything would pass."""
        host = _make_host(db, producer_status="approved")
        ex = _make_experience(db, host, title="Legit", status="approved")
        assert [e["title"] for e in client.get("/experiences").json()] == ["Legit"]
        assert client.get(f"/experiences/{ex.id}").status_code == 200


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
        host = _make_host(db, email="host@t.com")
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
