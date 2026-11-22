"""Part 1 of 2 of `tests/test_experiences.py`: TestExperienceSubmission, TestExperienceValidate, TestExperienceCount, TestExperienceListing, TestExperienceDetail, TestPublicVisibilityRequiresApprovedBusiness, TestAdminExperienceFlows.

Moved here verbatim by the MEH-3540 mechanical split. Not collected
directly (no `test_` prefix): `tests/test_experiences.py` imports these tests, so
their node ids stay `tests/test_experiences.py::...`. Run them with
`pytest tests/test_experiences.py` (add `-k <ClassName>` to narrow).
"""

from app.models.models import Experience
from app.utils.clock import israel_today
from conftest import auth_header
from conftest import make_user
from datetime import timedelta
from _test_experiences__common import _make_experience  # noqa: F401
from _test_experiences__common import _make_host  # noqa: F401
from _test_experiences__common import _mock_moderation  # noqa: F401
from _test_experiences__common import _payload  # noqa: F401

# ---------- Submission ----------


class TestExperienceSubmission:
    def test_requires_authentication(self, client):
        assert client.post("/experiences", json=_payload()).status_code == 401

    # MEH-2246: the submit gate is require_verified_producer (events.py's
    # gate) — a consumer is rejected on the WRITE side, matching the MEH-1749
    # read gate that would have hidden her experience forever anyway. This
    # test inverts the old `test_consumer_can_submit` (201) it replaces.
    def test_consumer_is_rejected(self, client, db):
        # No moderation mock on purpose: the gate rejects before
        # validate_experience is ever called, and the count assertion below
        # would still hold if it were.
        user = make_user(db, role="consumer", email="c@test.com")
        resp = client.post(
            "/experiences", json=_payload(), headers=auth_header(user)
        )
        assert resp.status_code == 403, resp.text
        assert resp.json()["detail"] == "Producer access required"
        # Nothing persisted — the gate runs before moderation and the insert.
        assert db.query(Experience).count() == 0

    def test_producer_can_submit(self, client, db, monkeypatch):
        """The canonical happy path (was `test_producer_can_also_submit`)."""
        _mock_moderation(monkeypatch, status="APPROVED")
        user = make_user(db, role="producer", email="p@test.com")
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

    def test_unverified_producer_is_rejected(self, client, db):
        # Mirrors tests/test_verified_email_enforcement.py: the 403 carries the
        # structured detail so the frontend matches on the stable `code`.
        # No moderation mock — the gate raises before validate_experience.
        # NOT the discriminator for MEH-2246: the old require_verified_email
        # gate produced this exact 403 too (measured: green against both
        # routers). It guards that the structured email_unverified shape
        # survives the dependency swap; test_consumer_is_rejected is the test
        # that goes red against the old code.
        user = make_user(
            db, role="producer", email="unverified@test.com", email_verified=False
        )
        resp = client.post(
            "/experiences", json=_payload(), headers=auth_header(user)
        )
        assert resp.status_code == 403, resp.text
        assert resp.json()["detail"]["code"] == "email_unverified"
        assert db.query(Experience).count() == 0

    def test_persisted_as_pending(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch, status="APPROVED")
        user = make_user(db, role="producer")
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
        user = make_user(db, role="producer")
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
        user = make_user(db, role="producer")
        resp = client.post(
            "/experiences", json=_payload(), headers=auth_header(user)
        )
        assert resp.status_code == 400
        # Nothing persisted
        assert db.query(Experience).count() == 0

    def test_title_too_short_rejected(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch)
        user = make_user(db, role="producer")
        resp = client.post(
            "/experiences",
            json=_payload(title="חם"),
            headers=auth_header(user),
        )
        assert resp.status_code == 422

    def test_description_too_short_rejected(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch)
        user = make_user(db, role="producer")
        resp = client.post(
            "/experiences",
            json=_payload(description="קצר מדי"),
            headers=auth_header(user),
        )
        assert resp.status_code == 422

    def test_invalid_location_type_rejected(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch)
        user = make_user(db, role="producer")
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
        user = make_user(db, role="producer")
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
        user = make_user(db, role="producer")
        resp = client.post(
            "/experiences",
            json=_payload(city="   "),
            headers=auth_header(user),
        )
        assert resp.status_code == 422
        # Stated, not implied: a 422 that still wrote a row would be the worse
        # bug of the two, and only this line would catch it.
        assert db.query(Experience).count() == 0

    def test_missing_location_type_rejected(self, client, db, monkeypatch):
        """Previously defaulted to "home" server-side, which silently framed
        every direct submission as taking place in a private residence — the
        branch that hides lat/lng (experiences.py:309)."""
        _mock_moderation(monkeypatch)
        user = make_user(db, role="producer")
        payload = _payload()
        del payload["location_type"]
        resp = client.post(
            "/experiences", json=payload, headers=auth_header(user)
        )
        assert resp.status_code == 422
        assert db.query(Experience).count() == 0

    def test_city_is_stored_stripped(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch)
        user = make_user(db, role="producer")
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
            event_date=israel_today() - timedelta(days=2),
        )
        _make_experience(
            db,
            host,
            title="Soon",
            status="approved",
            event_date=israel_today() + timedelta(days=2),
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
            event_date=israel_today() - timedelta(days=1),
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

    # ---- MEH-2847: several categories (OR) ----

    def _three_by_category(self, db):
        """One approved experience per category, so every result is checked
        against rows it must KEEP and a row it must DROP."""
        host = _make_host(db)
        for title, category in [
            ("Cook", "בישול"),
            ("Tour", "סיור אוכל"),
            ("Farm", "חקלאות"),
        ]:
            _make_experience(
                db, host, title=title, category=category, status="approved"
            )

    @staticmethod
    def _titles(resp) -> set[str]:
        assert resp.status_code == 200, resp.text
        return {e["title"] for e in resp.json()}

    def test_filter_by_two_categories_returns_the_union(self, client, db):
        """The new behaviour. Before MEH-2847 `category` was one string and
        FastAPI kept only the LAST repeated value — this returned {"Tour"}."""
        self._three_by_category(db)

        # Repeated ?category=בישול&category=סיור אוכל — the frontend's format.
        resp = client.get("/experiences", params={"category": ["בישול", "סיור אוכל"]})

        assert self._titles(resp) == {"Cook", "Tour"}

    def test_two_categories_still_and_with_the_city(self, client, db):
        host = _make_host(db)
        _make_experience(
            db,
            host,
            title="Cook TLV",
            category="בישול",
            city="תל אביב",
            status="approved",
        )
        _make_experience(
            db,
            host,
            title="Tour TLV",
            category="סיור אוכל",
            city="תל אביב",
            status="approved",
        )
        _make_experience(
            db,
            host,
            title="Cook JLM",
            category="בישול",
            city="ירושלים",
            status="approved",
        )

        resp = client.get(
            "/experiences",
            params={"category": ["בישול", "סיור אוכל"], "city": "תל אביב"},
        )

        assert self._titles(resp) == {"Cook TLV", "Tour TLV"}

    def test_one_category_behaves_as_before(self, client, db):
        """Pin: an old single-value link is unchanged."""
        self._three_by_category(db)

        resp = client.get("/experiences", params={"category": "בישול"})

        assert self._titles(resp) == {"Cook"}

    def test_no_and_blank_category_return_everything(self, client, db):
        """Pin: a bare ?category= must not become IN ('') and hide every row."""
        self._three_by_category(db)
        everything = {"Cook", "Tour", "Farm"}

        assert self._titles(client.get("/experiences")) == everything
        assert self._titles(client.get("/experiences?category=")) == everything

    def test_unknown_category_alone_matches_nothing_and_beside_a_real_one_is_dropped(
        self, client, db
    ):
        """Pin: not refused (200, as before), matches nothing, hides nothing."""
        self._three_by_category(db)

        alone = client.get("/experiences", params={"category": "אפייה"})
        mixed = client.get("/experiences", params={"category": ["אפייה", "חקלאות"]})

        assert self._titles(alone) == set()
        assert self._titles(mixed) == {"Farm"}

    def test_a_value_outside_the_category_set_is_not_matched(self, client, db):
        """Each value is checked against EXPERIENCE_CATEGORIES (MEH-2847). A
        row saved before MEH-2602's check may hold the English key
        («workshop»); it is not reachable through the filter. Without the
        check this returned the legacy row."""
        host = _make_host(db)
        _make_experience(
            db, host, title="Legacy", category="workshop", status="approved"
        )
        _make_experience(db, host, title="Farm", category="חקלאות", status="approved")

        alone = client.get("/experiences", params={"category": "workshop"})
        both = client.get(
            "/experiences", params={"category": ["workshop", "חקלאות", "חקלאות"]}
        )

        assert self._titles(alone) == set()
        assert self._titles(both) == {"Farm"}

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
            event_date=israel_today() - timedelta(days=2),
        )
        _make_experience(
            db,
            host,
            title="Soon",
            status="approved",
            event_date=israel_today() + timedelta(days=2),
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

    def test_approve_does_not_reactivate_a_host_cancelled_experience(self, client, db):
        """MEH-2840 (Sapir 09/11): the host's cancel is the host's decision.
        Approving a pending row the host had toggled off publishes the status
        and leaves it off; the host's own «הפעלה מחדש» brings it back."""
        host = make_user(db, email="host2840@t.com")
        admin = make_user(db, role="admin", email="adm2840@t.com")
        ex = _make_experience(db, host, status="pending", is_active=False)

        resp = client.post(
            f"/admin/experiences/{ex.id}/approve", headers=auth_header(admin)
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["is_active"] is False
        db.refresh(ex)
        assert ex.status == "approved"
        assert ex.is_active is False

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
