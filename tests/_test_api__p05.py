"""Part 5 of 7 of `tests/test_api.py`: TestAvailabilityState, TestProducersCount, TestCategoryRequests, TestFavoritesCount, TestSimilarProducersExclude, TestContactClickTracking, TestGetProducersMeRouteOrder, TestUploadGoogleAvatarOrNone, TestAuthEmailHtmlEscape, TestResetPasswordFlow.

Moved here verbatim by the MEH-3540 mechanical split. Not collected
directly (no `test_` prefix): `tests/test_api.py` imports these tests, so
their node ids stay `tests/test_api.py::...`. Run them with
`pytest tests/test_api.py` (add `-k <ClassName>` to narrow).
"""

from app.models.models import ContactClick
from app.models.models import Producer
from app.models.models import User
from app.utils.clock import israel_today
from app.utils.clock import utc_now
from conftest import auth_header
from conftest import make_producer
from conftest import make_user
import pytest

# ---------- MEH-291: availability_state consolidation (Phase 2) ----------

class TestAvailabilityState:
    """Pause-only enum (2 values since MEH-2782) that consolidates is_available_today + availability_status.

    Phase 2 shipped the endpoint, the dual-write mirror, the auto-clear and
    the ?availability_state= filter. MEH-2271 (MEH-1854 chunk 3a) removed the
    DUAL-WRITE half; MEH-2272 (chunk 3b) removed the two derived legacy fields
    from ProducerListOut and the legacy boolean query alias. The assertions
    below check the RESPONSE's `availability_state`, not the two columns — a
    column assertion here would be pinning frozen data. MEH-2273 drops the
    columns.
    """

    @staticmethod
    def _setup(db):
        from app.models import User
        user = make_user(db, role="producer")
        producer = make_producer(db)
        user.producer_id = producer.id
        db.commit()
        db.refresh(user)
        # Re-fetch User so callers see producer_id wired
        return db.query(User).filter(User.id == user.id).first(), producer

    def test_new_endpoint_sets_accepting_orders(self, client, db):
        user, producer = self._setup(db)
        resp = client.post(
            "/producers/me/availability-state",
            json={"state": "accepting_orders"},
            headers=auth_header(user),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["availability_state"] == "accepting_orders"
        db.refresh(producer)
        assert producer.availability_state == "accepting_orders"

    # MEH-2758: available_today / full_this_week are no longer writable; the
    # refusal and the still-listed read live in tests/test_meh2758_pause_only_writes.py.

    def test_new_endpoint_on_vacation_requires_vacation_until(self, client, db):
        user, _ = self._setup(db)
        resp = client.post(
            "/producers/me/availability-state",
            json={"state": "on_vacation"},
            headers=auth_header(user),
        )
        assert resp.status_code == 422
        assert "תאריך חזרה לחופשה נדרש" in resp.text

    def test_new_endpoint_on_vacation_with_date_is_listed_as_on_vacation(
        self, client, db
    ):
        from datetime import timedelta
        user, producer = self._setup(db)
        future = (israel_today() + timedelta(days=10)).isoformat()
        resp = client.post(
            "/producers/me/availability-state",
            json={"state": "on_vacation", "vacation_until": future},
            headers=auth_header(user),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["availability_state"] == "on_vacation"
        assert body["vacation_until"] == future
        db.refresh(producer)
        assert producer.availability_state == "on_vacation"
        assert producer.vacation_until.isoformat() == future
        # An on_vacation producer is hidden from the default listing, so ask
        # for the state explicitly.
        listed = client.get("/producers?availability_state=on_vacation").json()
        mine = [p for p in listed if p["id"] == str(producer.id)]
        assert len(mine) == 1
        assert mine[0]["availability_state"] == "on_vacation"
        assert mine[0]["vacation_until"] == future

    # MEH-2758: removed with the legacy endpoint it exercised (POST /producers/me/availability).

    # MEH-2758: removed with the legacy endpoint it exercised (POST /producers/me/availability-status).

    def test_auto_clear_past_vacation_normalizes_the_state(self, client, db):
        from datetime import timedelta
        producer = make_producer(db)
        producer.availability_status = "vacation"
        producer.availability_state = "on_vacation"
        producer.vacation_until = israel_today() - timedelta(days=2)
        db.commit()

        resp = client.get(f"/producers/{producer.id}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["availability_state"] == "accepting_orders"
        assert body.get("vacation_until") is None

    def test_vacation_until_preserved_through_state_round_trip(self, client, db):
        from datetime import timedelta
        user, producer = self._setup(db)
        future = (israel_today() + timedelta(days=14)).isoformat()
        # Set on_vacation with a date.
        client.post(
            "/producers/me/availability-state",
            json={"state": "on_vacation", "vacation_until": future},
            headers=auth_header(user),
        )
        # Switch back to accepting → vacation_until cleared.
        resp = client.post(
            "/producers/me/availability-state",
            json={"state": "accepting_orders"},
            headers=auth_header(user),
        )
        assert resp.json()["vacation_until"] is None
        db.refresh(producer)
        assert producer.vacation_until is None

    def test_filter_by_availability_state(self, client, db):
        # Two approved producers: one on_vacation, one accepting_orders.
        p1 = make_producer(db, name="Alpha", status="approved")
        p1.availability_state = "on_vacation"
        p2 = make_producer(db, name="Beta", status="approved")
        p2.availability_state = "accepting_orders"
        db.commit()

        resp = client.get("/producers?availability_state=on_vacation")
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert "Alpha" in names
        assert "Beta" not in names

    # MEH-2758: removed with the legacy endpoint it exercised (POST /producers/me/availability-status (and _status_to_state)).

    def test_the_removed_alias_no_longer_filters_and_the_legacy_pair_is_gone(
        self, client, db
    ):
        """MEH-2272 (MEH-1854 chunk 3b): the ?is_on_vacation= alias is
        REMOVED, and so are the two derived fields on ProducerListOut.

        FastAPI ignores an undeclared query parameter, so a stale caller gets
        a 200 and the UNFILTERED default listing — not a 422. Both halves of
        the old alias are asserted against the no-parameter baseline. The rows
        MEH-2782: with available_today gone both rows are accepting_orders;
        the split this test once relied on can no longer be built.
        """
        p1 = make_producer(db, name="Gamma", status="approved")
        p1.availability_state = "accepting_orders"
        p2 = make_producer(db, name="Delta", status="approved")
        p2.availability_state = "accepting_orders"
        db.commit()

        def names(url):
            resp = client.get(url)
            assert resp.status_code == 200, resp.text
            return {p["name"] for p in resp.json()}

        baseline = names("/producers")
        # Control: the baseline really holds both, so "same set" below cannot
        # be satisfied by two empty listings.
        assert {"Gamma", "Delta"} <= baseline

        assert names("/producers?is_on_vacation=true") == baseline
        assert names("/producers?is_on_vacation=false") == baseline

        items = client.get("/producers").json()
        mine = [p for p in items if p["name"] in {"Gamma", "Delta"}]
        assert len(mine) == 2
        for item in mine:
            assert "is_on_vacation" not in item, item["name"]
            assert "availability_status" not in item, item["name"]
            assert "availability_state" in item, item["name"]

    def test_a_stale_alias_beside_the_state_filter_is_ignored(self, client, db):
        """Both parameters present → only the real filter exists now. A caller
        still sending the removed alias next to ?availability_state= must get
        exactly the state filter's answer.
        """
        p1 = make_producer(db, name="Epsilon", status="approved")
        p1.availability_state = "on_vacation"
        db.commit()

        resp = client.get(
            "/producers?availability_state=on_vacation&is_on_vacation=true"
        )
        assert resp.status_code == 200
        assert "Epsilon" in {p["name"] for p in resp.json()}


class TestProducersCount:
    """MEH-159 — GET /producers/count returns fresh total for pagination."""

    def test_count_endpoint_returns_json(self, client, db):
        resp = client.get("/producers/count")
        assert resp.status_code == 200
        body = resp.json()
        assert "count" in body
        assert isinstance(body["count"], int)

    def test_count_reflects_approved_producers(self, client, db):
        before = client.get("/producers/count").json()["count"]
        make_producer(db, status="approved")
        after = client.get("/producers/count").json()["count"]
        assert after == before + 1

    def test_pending_producer_excluded_from_count(self, client, db):
        before = client.get("/producers/count").json()["count"]
        make_producer(db, status="pending")
        after = client.get("/producers/count").json()["count"]
        assert after == before  # pending not counted


class TestCategoryRequests:
    """MEH-141 — category request flow: submit + admin review."""

    def test_submit_category_request_returns_201(self, client, db):
        resp = client.post(
            "/category-requests",
            json={"requested_name": "משקאות מותססים", "examples": "קומבוצ'ה"},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["requested_name"] == "משקאות מותססים"
        assert body["status"] == "pending"

    def test_submit_empty_name_rejected(self, client, db):
        resp = client.post(
            "/category-requests",
            json={"requested_name": "", "examples": None},
        )
        assert resp.status_code == 422

    def test_admin_list_category_requests_grouped(self, client, db):
        admin = make_user(db, role="admin")
        client.post("/category-requests", json={"requested_name": "תבלינים"})
        client.post("/category-requests", json={"requested_name": "תבלינים"})
        resp = client.get("/admin/category-requests", headers=auth_header(admin))
        assert resp.status_code == 200
        groups = resp.json()
        names = [g["requested_name"] for g in groups]
        assert "תבלינים" in names
        # find the group and verify count >= 2
        group = next((g for g in groups if g["requested_name"] == "תבלינים"), None)
        assert group is not None
        assert group["count"] >= 2

    def test_admin_patch_status(self, client, db):
        admin = make_user(db, role="admin")
        # Submit a request
        create_resp = client.post(
            "/category-requests",
            json={"requested_name": "קמח כוסמין", "examples": "לחם כוסמין"},
        )
        assert create_resp.status_code == 201
        req_id = create_resp.json()["id"]
        # Admin approves
        resp = client.patch(
            f"/admin/category-requests/{req_id}",
            json={"status": "approved", "admin_notes": "נוסיף בגרסה הבאה"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "approved"
        assert body["admin_notes"] == "נוסיף בגרסה הבאה"

    def test_non_admin_cannot_list_requests(self, client, db):
        consumer = make_user(db, role="consumer")
        resp = client.get("/admin/category-requests", headers=auth_header(consumer))
        assert resp.status_code == 403

    def test_non_admin_cannot_patch_request(self, client, db):
        consumer = make_user(db, role="consumer")
        create_resp = client.post(
            "/category-requests",
            json={"requested_name": "צמחי מרפא"},
        )
        assert create_resp.status_code == 201
        req_id = create_resp.json()["id"]
        resp = client.patch(
            f"/admin/category-requests/{req_id}",
            json={"status": "approved"},
            headers=auth_header(consumer),
        )
        assert resp.status_code == 403

    def test_admin_notes_preserved_on_status_reset(self, client, db):
        admin = make_user(db, role="admin")
        create_resp = client.post(
            "/category-requests",
            json={"requested_name": "שמנים קרים"},
        )
        req_id = create_resp.json()["id"]
        # Approve with notes
        client.patch(
            f"/admin/category-requests/{req_id}",
            json={"status": "approved", "admin_notes": "נבחן בגרסה הבאה"},
            headers=auth_header(admin),
        )
        # Reset to pending (no notes sent) — notes must survive
        resp = client.patch(
            f"/admin/category-requests/{req_id}",
            json={"status": "pending"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        assert resp.json()["admin_notes"] == "נבחן בגרסה הבאה"


class TestFavoritesCount:
    """MEH-106 — favorites_count in /producers response."""

    def test_producers_list_includes_favorites_count(self, client, db):
        make_producer(db, status="approved")
        resp = client.get("/producers")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert "favorites_count" in data[0]
        assert isinstance(data[0]["favorites_count"], int)

    def test_favorites_count_reflects_saved_producers(self, client, db):
        p = make_producer(db, status="approved")
        # count before any favorites
        before = client.get(f"/producers/{p.id}").json().get("favorites_count", 0)
        # add a favorite
        u = make_user(db)
        from app.models.models import Favorite
        fav = Favorite(user_id=u.id, producer_id=p.id)
        db.add(fav)
        db.commit()
        after = client.get(f"/producers/{p.id}").json().get("favorites_count", 0)
        assert after == before + 1

    def test_favorites_count_zero_when_no_saves(self, client, db):
        p = make_producer(db, status="approved")
        data = client.get(f"/producers/{p.id}").json()
        assert data["favorites_count"] == 0


class TestSimilarProducersExclude:
    def test_exclude_param_omits_producer(self, client, db):
        """GET /producers?exclude=<id> must not return that producer."""
        p1 = make_producer(db, name="Exclude Me", status="approved")
        make_producer(db, name="Keep Me", status="approved")
        resp = client.get(f"/producers?exclude={p1.id}")
        assert resp.status_code == 200
        ids = [p["id"] for p in resp.json()]
        assert str(p1.id) not in ids

    def test_exclude_param_absent_returns_all(self, client, db):
        """Without exclude, both producers are returned."""
        p1 = make_producer(db, name="Both A", status="approved")
        p2 = make_producer(db, name="Both B", status="approved")
        resp = client.get("/producers")
        assert resp.status_code == 200
        ids = [p["id"] for p in resp.json()]
        assert str(p1.id) in ids
        assert str(p2.id) in ids


class TestContactClickTracking:
    """MEH-82: POST /producers/{id}/contact-click and analytics integration."""

    def test_anonymous_click_returns_204(self, client, db):
        p = make_producer(db, status="approved")
        resp = client.post(f"/producers/{p.id}/contact-click", json={"method": "phone"})
        assert resp.status_code == 204

    def test_authenticated_click_attributed_to_user(self, client, db):
        p = make_producer(db, status="approved")
        u = make_user(db)
        resp = client.post(
            f"/producers/{p.id}/contact-click",
            json={"method": "instagram"},
            headers=auth_header(u),
        )
        assert resp.status_code == 204
        row = db.query(ContactClick).filter(ContactClick.producer_id == p.id).first()
        assert row is not None
        assert row.user_id == u.id
        assert row.method == "instagram"

    def test_all_valid_methods_accepted(self, client, db):
        p = make_producer(db, status="approved")
        for method in ("phone", "instagram", "website", "email"):
            resp = client.post(f"/producers/{p.id}/contact-click", json={"method": method})
            assert resp.status_code == 204, f"method={method} returned {resp.status_code}"

    def test_invalid_method_returns_422(self, client, db):
        p = make_producer(db, status="approved")
        resp = client.post(f"/producers/{p.id}/contact-click", json={"method": "fax"})
        assert resp.status_code == 422

    def test_unknown_producer_returns_404(self, client, db):
        import uuid
        resp = client.post(
            f"/producers/{uuid.uuid4()}/contact-click",
            json={"method": "phone"},
        )
        assert resp.status_code == 404

    def test_click_row_has_ip_hash(self, client, db):
        p = make_producer(db, status="approved")
        client.post(f"/producers/{p.id}/contact-click", json={"method": "website"})
        row = db.query(ContactClick).filter(ContactClick.producer_id == p.id).first()
        assert row is not None
        # ip_hash may be None in test (testclient passes no real IP) — just verify column exists
        assert hasattr(row, "ip_hash")

    def test_analytics_includes_contact_clicks(self, client, db):
        """GET /producers/me/analytics returns contact_clicks windowed dict."""
        u = make_user(db, role="producer")
        p = make_producer(db, status="approved")
        u.producer_id = p.id
        db.commit()
        db.refresh(u)

        # Record a click. MEH-2156: it must come from a VISITOR — this test
        # used to fire it as `u`, the owner, purely because she was the
        # authenticated user already on hand for the GET below. Owner clicks
        # are no longer logged (they are not audience), so an owner-fired
        # click now yields total=0 and says nothing about the reader this
        # test actually covers. The subject is unchanged: the shape of
        # `contact_clicks` on GET /producers/me/analytics.
        client.post(f"/producers/{p.id}/contact-click", json={"method": "email"})

        resp = client.get("/producers/me/analytics", headers=auth_header(u))
        assert resp.status_code == 200
        data = resp.json()
        assert "contact_clicks" in data
        cc = data["contact_clicks"]
        assert "last_7d" in cc and "last_30d" in cc and "total" in cc
        assert cc["total"] >= 1


class TestGetProducersMeRouteOrder:
    """MEH-300 regression — GET /producers/me must not be shadowed by
    GET /producers/{producer_id} due to router registration order."""

    def test_authenticated_producer_returns_200(self, client, db):
        user = make_user(db, role="producer")
        producer = make_producer(db)
        user.producer_id = producer.id
        db.commit()

        resp = client.get("/producers/me", headers=auth_header(user))

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["id"] == str(producer.id)
        assert body["name"] == producer.name

    def test_no_auth_returns_401(self, client, db):
        resp = client.get("/producers/me")
        assert resp.status_code == 401

    def test_consumer_returns_403(self, client, db):
        user = make_user(db, role="consumer")
        resp = client.get("/producers/me", headers=auth_header(user))
        assert resp.status_code == 403

    def test_uuid_route_not_broken(self, client, db):
        """Ensure GET /producers/{uuid} still resolves after reorder."""
        producer = make_producer(db)
        resp = client.get(f"/producers/{producer.id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == str(producer.id)

    def test_get_me_after_registration(self, client, db):
        """MEH-321 regression — GET /producers/me must return 200 immediately
        after a brand-new producer registration (Pydantic schema mismatch fix)."""
        # MEH-321 regression: GET /producers/me returns 200 with valid Pydantic
        # shape for a producer that has not been approved yet. (The fixture
        # carried `pending_whatsapp` until that status was removed in
        # MEH-2124; the NULL-field shape is what this guards, not the status.)
        #
        # NOTE: Post-MEH-328 (anti-enum refactor removed access_token from
        # /auth/register/producer non-upgrade response), this test no longer
        # exercises the original register-flow code path. The Pydantic
        # null-field serialization invariant is now covered narrowly via a
        # seeded producer that mirrors the register-flow NULL shape
        # (description / lat / lng / instagram / website / city / contact_email
        # all None). test_get_me_with_null_created_at_returns_200 (below)
        # covers the null created_at case separately. If a new MEH-321-class
        # regression surfaces post-launch, file a Linear and restore via a
        # full HTTP register flow (which after Chunk D/E will give us a
        # verified login path that still returns a token).
        #
        # make_producer fixture is bypassed because its signature
        # (conftest.py:151-159) forces description="Test producer" + non-null
        # lat/lng, which would mask the NULL-field shape this test guards.
        from app.models.models import Producer
        producer = Producer(
            name="חוות מה-321",
            description=None,
            city=None,
            lat=None,
            lng=None,
            phone="0501234567",
            instagram=None,
            website=None,
            primary_contact_method="whatsapp",
            contact_email=None,
            status="draft",
        )
        db.add(producer)
        db.flush()
        user = make_user(db, email="meh321@example.com", role="producer")
        user.producer_id = producer.id
        user.is_producer = True
        db.commit()

        resp = client.get("/producers/me", headers=auth_header(user))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["name"] == "חוות מה-321"
        assert body["status"] == "draft"

    def test_get_me_with_null_created_at_returns_200(self, client, db):
        """MEH-321: created_at is nullable=True in DB — NULL must not crash serialization."""
        from sqlalchemy import text as sa_text
        user = make_user(db, role="producer")
        producer = make_producer(db)
        user.producer_id = producer.id
        db.commit()
        db.execute(sa_text("UPDATE producers SET created_at = NULL WHERE id = :pid"), {"pid": str(producer.id)})
        db.commit()

        resp = client.get("/producers/me", headers=auth_header(user))
        assert resp.status_code == 200, resp.text
        assert resp.json()["created_at"] is None


class TestUploadGoogleAvatarOrNone:
    """MEH-299 — _upload_google_avatar_or_none helper unit tests.

    Login must never be blocked regardless of Cloudinary / network state.
    """

    @pytest.fixture(autouse=True)
    def _import_uploader_unmocked(self):
        # Import the uploader BEFORE a test mocks cloudinary.config: its
        # module-level setup reads config().api_proxy, and a first import
        # under the mock hands urllib3 a MagicMock proxy URL. Two tests here
        # passed only when an earlier test in the same xdist worker had
        # already imported it.
        import cloudinary.uploader  # noqa: F401

    def test_none_input_returns_none(self):
        from app.routers.auth import _upload_google_avatar_or_none
        assert _upload_google_avatar_or_none(None) is None

    def test_empty_string_returns_none(self):
        from app.routers.auth import _upload_google_avatar_or_none
        assert _upload_google_avatar_or_none("") is None

    def test_no_cloudinary_config_returns_url_unchanged(self, monkeypatch):
        from app.routers.auth import _upload_google_avatar_or_none
        from app.config import settings
        monkeypatch.setattr(settings, "cloudinary_cloud_name", None)
        url = "https://lh3.googleusercontent.com/photo.jpg"
        assert _upload_google_avatar_or_none(url) == url

    @staticmethod
    def _fake_stream_cm(chunks):
        """Build a context-manager-compatible mock for httpx.stream.

        MEH-440-followup switched the avatar uploader from httpx.get
        (full buffer) to httpx.stream (chunked + early-abort). Tests
        mock the streaming response with a tiny stand-in that yields
        the requested chunks from iter_bytes(...).
        """
        from unittest.mock import MagicMock
        resp = MagicMock()
        resp.raise_for_status.return_value = None
        resp.iter_bytes.return_value = iter(chunks)
        cm = MagicMock()
        cm.__enter__.return_value = resp
        cm.__exit__.return_value = False
        return cm

    def test_httpx_error_is_fail_open(self, monkeypatch):
        from unittest.mock import patch
        from app.routers.auth import _upload_google_avatar_or_none
        from app.config import settings
        monkeypatch.setattr(settings, "cloudinary_cloud_name", "test-cloud")
        monkeypatch.setattr(settings, "cloudinary_api_key", "key")
        monkeypatch.setattr(settings, "cloudinary_api_secret", "secret")
        with patch("httpx.stream", side_effect=Exception("network error")):
            result = _upload_google_avatar_or_none("https://lh3.googleusercontent.com/photo.jpg")
        assert result is None

    def test_cloudinary_error_is_fail_open(self, monkeypatch):
        from unittest.mock import patch
        from app.routers.auth import _upload_google_avatar_or_none
        from app.config import settings
        monkeypatch.setattr(settings, "cloudinary_cloud_name", "test-cloud")
        monkeypatch.setattr(settings, "cloudinary_api_key", "key")
        monkeypatch.setattr(settings, "cloudinary_api_secret", "secret")
        cm = self._fake_stream_cm([b"\xff\xd8\xff" + b"\x00" * 100])
        with patch("httpx.stream", return_value=cm):
            with patch("cloudinary.uploader.upload", side_effect=Exception("Cloudinary down")):
                with patch("cloudinary.config"):
                    result = _upload_google_avatar_or_none("https://lh3.googleusercontent.com/photo.jpg")
        assert result is None

    def test_success_returns_cloudinary_url(self, monkeypatch):
        from unittest.mock import patch
        from app.routers.auth import _upload_google_avatar_or_none
        from app.config import settings
        monkeypatch.setattr(settings, "cloudinary_cloud_name", "test-cloud")
        monkeypatch.setattr(settings, "cloudinary_api_key", "key")
        monkeypatch.setattr(settings, "cloudinary_api_secret", "secret")
        # Import cloudinary.uploader BEFORE patching cloudinary.config: the
        # module builds its HTTP pool at import time from config().api_proxy,
        # and a MagicMock config makes that a ProxyManager(MagicMock) ->
        # TypeError. Under xdist the import order is whatever the worker ran
        # first, so this test must not depend on a sibling importing it (#3908).
        import cloudinary.uploader  # noqa: F401

        cm = self._fake_stream_cm([b"\xff\xd8\xff" + b"\x00" * 100])
        expected = "https://res.cloudinary.com/test-cloud/image/upload/mehamakor/avatars/abc.jpg"
        with patch("httpx.stream", return_value=cm):
            with patch("cloudinary.config"):
                with patch("cloudinary.uploader.upload", return_value={"secure_url": expected}):
                    result = _upload_google_avatar_or_none("https://lh3.googleusercontent.com/photo.jpg")
        assert result == expected

    def test_avatar_aborts_oversized_stream(self, monkeypatch):
        """MEH-440-followup: streaming download aborts as soon as the
        cumulative chunk size exceeds MAX_AVATAR_BYTES. Cloudinary
        upload must NOT be reached, and the result must be None."""
        from unittest.mock import patch
        from app.routers.auth import _upload_google_avatar_or_none
        from app.config import settings
        from app.services.oauth_verifiers import MAX_AVATAR_BYTES
        monkeypatch.setattr(settings, "cloudinary_cloud_name", "test-cloud")
        monkeypatch.setattr(settings, "cloudinary_api_key", "key")
        monkeypatch.setattr(settings, "cloudinary_api_secret", "secret")
        # Build chunks that exceed MAX_AVATAR_BYTES (1 MB). Two chunks
        # of 600 KiB each = 1.2 MB total — second chunk trips the cap.
        # Import cloudinary.uploader BEFORE patching cloudinary.config: the
        # module builds its HTTP pool at import time from config().api_proxy,
        # and a MagicMock config makes that a ProxyManager(MagicMock) ->
        # TypeError. Under xdist the import order is whatever the worker ran
        # first, so this test must not depend on a sibling importing it (#3908).
        import cloudinary.uploader  # noqa: F401

        big = b"\x00" * (600 * 1024)
        cm = self._fake_stream_cm([big, big])
        upload_called = {"n": 0}

        def _upload_should_not_run(*_a, **_kw):
            upload_called["n"] += 1
            return {"secure_url": "should-not-reach"}

        with patch("httpx.stream", return_value=cm):
            with patch("cloudinary.config"):
                with patch("cloudinary.uploader.upload", side_effect=_upload_should_not_run):
                    result = _upload_google_avatar_or_none("https://lh3.googleusercontent.com/photo.jpg")
        assert result is None, f"oversized stream must short-circuit (cap = {MAX_AVATAR_BYTES})"
        assert upload_called["n"] == 0, "Cloudinary upload must not run after size-cap abort"


class TestAuthEmailHtmlEscape:
    """MEH-440-followup: name interpolation in HTML email bodies must
    be html-escaped so a hostile registered name can't inject markup
    into the rendered email. Plain-text body keeps the raw name (text
    rendering doesn't interpret markup)."""

    def test_email_escapes_html_in_name(self, monkeypatch):
        captured = {}

        def fake_send(email, subject, body, html=None, test_cause=False):
            captured["body"] = body
            captured["html"] = html

        monkeypatch.setattr("app.services.auth_emails.send_email", fake_send)
        # MEH-301: send_verify_email now pre-flights resend_api_key; patch it
        # so the early-return guard doesn't short-circuit before send_email.
        from app.services import auth_emails as _ae
        monkeypatch.setattr(_ae.settings, "resend_api_key", "test-key")

        from app.services.auth_emails import send_verify_email
        hostile = "<script>alert(1)</script>"
        send_verify_email("u@example.com", hostile, "tok123")

        # Plain-text body keeps the raw name.
        assert hostile in captured["body"], "plain text must keep raw name"
        # HTML body has the escaped form, never the raw markup.
        assert "&lt;script&gt;alert(1)&lt;/script&gt;" in captured["html"], \
            "HTML body must contain the escaped name"
        assert hostile not in captured["html"], \
            "HTML body must not contain the unescaped name"


class TestResetPasswordFlow:
    """MEH-304 / MEH-191: end-to-end reset-password tests (gap closed)."""

    def test_happy_path(self, client, db):
        import secrets
        from datetime import timedelta
        user = make_user(db, password="OldPass1!")  # guard-ok: test-fixture password, moved verbatim from tests/test_api.py (MEH-3540)
        token = secrets.token_urlsafe(32)
        user.reset_token = token
        user.reset_token_expires_at = utc_now() + timedelta(hours=1)
        db.commit()

        res = client.post("/auth/reset-password", json={"token": token, "new_password": "NewPass1!Long"})
        assert res.status_code == 200
        db.refresh(user)
        assert user.reset_token is None

        # old password must no longer work
        login_old = client.post("/auth/login", json={"email": user.email, "password": "OldPass1!"})
        assert login_old.status_code == 401

        # new password must work
        login_new = client.post("/auth/login", json={"email": user.email, "password": "NewPass1!Long"})
        assert login_new.status_code == 200

    def test_unknown_token_returns_404(self, client, db):
        res = client.post("/auth/reset-password", json={"token": "nonexistent_token_abc", "new_password": "NewPass1!Long"})
        assert res.status_code == 404

    def test_expired_token_returns_410(self, client, db):
        import secrets
        from datetime import timedelta
        user = make_user(db)
        token = secrets.token_urlsafe(32)
        user.reset_token = token
        user.reset_token_expires_at = utc_now() - timedelta(seconds=1)
        db.commit()

        res = client.post("/auth/reset-password", json={"token": token, "new_password": "NewPass1!Long"})
        assert res.status_code == 410

    def test_invalid_body_returns_422(self, client, db):
        res = client.post("/auth/reset-password", json={"token": "abc"})
        assert res.status_code == 422

    def test_short_password_returns_422(self, client, db):
        import secrets
        from datetime import timedelta
        user = make_user(db)
        token = secrets.token_urlsafe(32)
        user.reset_token = token
        user.reset_token_expires_at = utc_now() + timedelta(hours=1)
        db.commit()
        res = client.post("/auth/reset-password", json={"token": token, "new_password": "short"})
        assert res.status_code == 422
