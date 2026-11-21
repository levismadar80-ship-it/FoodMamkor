"""Part 3 of 7 of `tests/test_api.py`: TestProducers, TestAdminGuard, TestAdminFlows, TestMeh56WhatsAppOnboarding, TestMeh56BioGenerator, TestMeh1236RequestReview, TestMeh2120RequestReviewGate, TestContact.

Moved here verbatim by the MEH-3540 mechanical split. Not collected
directly (no `test_` prefix): `tests/test_api.py` imports these tests, so
their node ids stay `tests/test_api.py::...`. Run them with
`pytest tests/test_api.py` (add `-k <ClassName>` to narrow).
"""

from app.models.models import AdminSetting
from app.models.models import ContactMessage
from app.models.models import Producer
from app.models.models import StaticPage
from conftest import auth_header
from conftest import make_category
from conftest import make_producer
from conftest import make_submit_ready_producer
from conftest import make_user
from conftest import valid_producer_register_payload
import pytest

# ---------- Producers ----------

class TestProducers:
    def test_list_producers_returns_only_approved(self, client, db):
        make_producer(db, name="Approved One", status="approved")
        make_producer(db, name="Pending One", status="pending")
        resp = client.get("/producers")
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert "Approved One" in names
        assert "Pending One" not in names

    def test_filter_by_delivery_city(self, client, db):
        make_producer(db, name="TLV Delivery", delivery_cities=["תל אביב"])
        make_producer(db, name="Haifa Delivery", delivery_cities=["חיפה"])
        resp = client.get("/producers", params={"delivery_city": "תל אביב"})
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert names == ["TLV Delivery"]

    def test_filter_by_category(self, client, db):
        cat = make_category(db, name="ירקות")
        other = make_category(db, name="בשר")
        make_producer(db, name="Veg", category=cat)
        make_producer(db, name="Meat", category=other)
        resp = client.get("/producers", params={"category": cat.id})
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert names == ["Veg"]

    def test_get_producer_by_id(self, client, db):
        p = make_producer(db, name="Detail")
        resp = client.get(f"/producers/{p.id}")
        assert resp.status_code == 200
        assert resp.json()["name"] == "Detail"

    def test_get_unknown_producer_404(self, client):
        resp = client.get("/producers/00000000-0000-0000-0000-000000000000")
        assert resp.status_code == 404

    # ----- POST /producers auth -----
    #
    # docs/DATA.md has always documented POST /producers as auth-required
    # (it lives under the "producer dashboard" flow), but the handler
    # historically had no auth dependency — anyone could create a pending
    # producer row with no audit trail. Fixed in feature/fix-producers-post-auth.
    #
    # The public signup flow lives at POST /auth/register/producer and is
    # untouched; POST /producers is a secondary backend helper that should
    # only be callable by an authenticated user.

    VALID_PRODUCER_PAYLOAD = {
        "name": "חוות הבדיקה",
        "description": "test producer",
        "city": "תל אביב",
        "lat": 32.0853,
        "lng": 34.7818,
        "phone": "0501234567",
        "instagram": None,
        "website": None,
        # MEH-1153: ProducerCreate now requires ≥1 category. The guard tests
        # below (401 / 403 / overlong-name-422) never reach the DB insert, so a
        # non-empty placeholder id keeps them schema-valid (Regression rule 6);
        # the 201-success test overrides this with a real seeded category id.
        "category_ids": [1],
        "delivery_areas": [],
    }

    def test_post_producers_requires_auth(self, client):
        """No Authorization header → 401. Protects against anonymous
        creation of pending producers (was a silent security gap)."""
        resp = client.post("/producers", json=self.VALID_PRODUCER_PAYLOAD)
        assert resp.status_code == 401

    def test_post_producers_rejects_invalid_token(self, client):
        """Garbage token → 401, not 500."""
        resp = client.post(
            "/producers",
            json=self.VALID_PRODUCER_PAYLOAD,
            headers={"Authorization": "Bearer not-a-real-jwt"},
        )
        assert resp.status_code == 401

    def test_post_producers_with_auth_creates_draft_producer(self, client, db):
        """Authenticated user → 201, producer created with status=draft.

        MEH-2100: was `pending`. This endpoint is reachable by ANY logged-in
        verified user, so a `pending` row here was a route straight into the
        admin queue past the submit gate."""
        user = make_user(db, email="creator@test.com")
        # MEH-1153: this path inserts ProducerCategory rows, so the category
        # must actually exist — override the placeholder id with a real one.
        cat = make_category(db)
        payload = {**self.VALID_PRODUCER_PAYLOAD, "category_ids": [cat.id]}
        resp = client.post(
            "/producers",
            json=payload,
            headers=auth_header(user),
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["name"] == "חוות הבדיקה"
        assert body["status"] == "draft"
        # DB row exists
        row = db.query(Producer).filter(Producer.name == "חוות הבדיקה").first()
        assert row is not None
        assert row.status == "draft"

    def test_post_producers_overlong_name_returns_422(self, client, db):
        """MEH-229: name longer than the String(200) column → clean 422,
        not a DB-level 500. Validates the ProducerCreate.name max_length cap."""
        user = make_user(db, email="longname@example.com")
        payload = {**self.VALID_PRODUCER_PAYLOAD, "name": "א" * 201}
        resp = client.post("/producers", json=payload, headers=auth_header(user))
        assert resp.status_code == 422

    def test_admin_post_producers_overlong_name_returns_422(self, client, db):
        """MEH-229: same cap mirrored on the admin ProducerAdminCreate surface."""
        admin = make_user(db, role="admin", email="adminlongname@example.com")
        resp = client.post(
            "/admin/producers",
            json={"name": "א" * 201, "city": "תל אביב"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 422

    def test_post_producers_with_blocked_user_fails(self, client, db):
        """A blocked user should not be able to create producers — the
        get_current_user dep raises 403 for blocked accounts."""
        blocked = make_user(db, email="blocked@test.com", is_blocked=True)
        resp = client.post(
            "/producers",
            json=self.VALID_PRODUCER_PAYLOAD,
            headers=auth_header(blocked),
        )
        assert resp.status_code in (401, 403)


# ---------- Admin guard ----------

class TestAdminGuard:
    def test_unauthenticated_admin_returns_401(self, client):
        # FastAPI returns 401 for missing token, not 403
        assert client.get("/admin/dashboard").status_code == 401

    def test_consumer_cannot_access_admin(self, client, db):
        u = make_user(db, role="consumer")
        resp = client.get("/admin/dashboard", headers=auth_header(u))
        assert resp.status_code == 403

    def test_producer_cannot_access_admin(self, client, db):
        u = make_user(db, role="producer")
        resp = client.get("/admin/dashboard", headers=auth_header(u))
        assert resp.status_code == 403


# ---------- Admin functionality ----------

class TestAdminFlows:
    def test_approve_pending_producer(self, client, db):
        admin = make_user(db, role="admin")
        # MEH-799: approve gate requires >=1 image
        # MEH-2121: ...and a verified WhatsApp number.
        p = make_producer(
            db,
            status="pending",
            images=["https://res.cloudinary.com/demo/image/upload/v1/test.jpg"],
            phone_verified=True,
        )
        resp = client.post(
            f"/admin/producers/{p.id}/approve", headers=auth_header(admin)
        )
        assert resp.status_code == 200
        db.refresh(p)
        assert p.status == "approved"

    def test_dashboard_returns_stats(self, client, db):
        admin = make_user(db, role="admin")
        make_producer(db, status="approved")
        make_producer(db, status="pending")
        make_user(db, email="c1@t.com")
        resp = client.get("/admin/dashboard", headers=auth_header(admin))
        assert resp.status_code == 200
        body = resp.json()
        assert "stats" in body
        assert body["stats"]["total_producers"] >= 2
        assert body["stats"]["pending_producers"] >= 1
        assert "monthly_producers" in body
        assert "map_points" in body

    def test_users_list_with_search(self, client, db):
        admin = make_user(db, role="admin", email="admin@t.com")
        make_user(db, email="findme@t.com", name="Findable")
        resp = client.get(
            "/admin/users",
            params={"search": "findme"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        emails = [u["email"] for u in resp.json()]
        assert "findme@t.com" in emails

    def test_change_user_role(self, client, db):
        admin = make_user(db, role="admin")
        target = make_user(db, role="consumer")
        resp = client.put(
            f"/admin/users/{target.id}/role",
            json={"role": "admin"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        db.refresh(target)
        assert target.role == "admin"

    def test_block_user(self, client, db):
        admin = make_user(db, role="admin")
        target = make_user(db, role="consumer")
        resp = client.post(
            f"/admin/users/{target.id}/block",
            json={"is_blocked": True},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        db.refresh(target)
        assert target.is_blocked is True

    def test_categories_crud(self, client, db):
        admin = make_user(db, role="admin")
        # Create
        resp = client.post(
            "/admin/categories",
            json={"name": "חדש", "emoji": "✨", "requires_license": False},
            headers=auth_header(admin),
        )
        assert resp.status_code in (200, 201)
        cat_id = resp.json()["id"]
        # List
        resp = client.get("/admin/categories", headers=auth_header(admin))
        assert any(c["id"] == cat_id for c in resp.json())
        # Update
        resp = client.put(
            f"/admin/categories/{cat_id}",
            json={"name": "ערוך", "emoji": "🔥"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        # Delete
        resp = client.delete(
            f"/admin/categories/{cat_id}", headers=auth_header(admin)
        )
        assert resp.status_code == 200

    def test_categories_producer_count(self, client, db):
        # MEH-1034: GET /admin/categories annotates each row with a
        # query-time producer_count (0 for empty, N for associated).
        admin = make_user(db, role="admin")
        with_producers = make_category(db, name="עם עסקים", emoji="🧀")
        empty = make_category(db, name="בלי עסקים", emoji="🫙")
        make_producer(db, name="עסק א", category=with_producers)
        make_producer(db, name="עסק ב", category=with_producers)

        resp = client.get("/admin/categories", headers=auth_header(admin))
        assert resp.status_code == 200
        by_id = {c["id"]: c for c in resp.json()}
        assert by_id[with_producers.id]["producer_count"] == 2
        assert by_id[empty.id]["producer_count"] == 0

    def test_settings_get_and_update(self, client, db):
        admin = make_user(db, role="admin")
        resp = client.get("/admin/settings", headers=auth_header(admin))
        assert resp.status_code == 200
        defaults = resp.json()
        # MEH-1566: was `admin_email` until that write-only key was removed
        # from DEFAULT_SETTINGS. Any surviving free-text key exercises the same
        # GET-defaults + PUT-persists contract.
        assert "holiday_override_key" in defaults

        resp = client.put(
            "/admin/settings",
            json={"holiday_override_key": "pesach"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        # Persisted
        row = (
            db.query(AdminSetting)
            .filter(AdminSetting.key == "holiday_override_key")
            .first()
        )
        assert row is not None
        assert row.value == "pesach"

    def test_analytics_endpoint(self, client, db):
        admin = make_user(db, role="admin")
        make_producer(db)
        resp = client.get("/admin/analytics", headers=auth_header(admin))
        assert resp.status_code == 200
        body = resp.json()
        for key in ("monthly", "by_category", "by_city", "top_producers", "map_points"):
            assert key in body

    def test_static_page_editor(self, client, db):
        admin = make_user(db, role="admin")
        # First GET auto-creates blank page
        resp = client.get("/admin/pages/about", headers=auth_header(admin))
        assert resp.status_code == 200
        # Update body
        resp = client.put(
            "/admin/pages/about",
            json={"title": "החזון שלנו", "body": "אוכל אמיתי"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        page = db.query(StaticPage).filter(StaticPage.slug == "about").first()
        assert page.title == "החזון שלנו"
        assert page.body == "אוכל אמיתי"


# ---------- MEH-56: WhatsApp onboarding + bio ----------

class TestMeh56WhatsAppOnboarding:
    """Registration produces a draft; the admin queue is pending-only.

    The class name is MEH-56's: registration used to produce a
    `pending_whatsapp` status, which MEH-2100 replaced with `draft`; the old
    value was removed in MEH-2124.
    """

    def test_register_producer_creates_draft(self, client, db, monkeypatch):
        # Stub out Twilio and email so no network calls.
        # MEH-2100: notify_admin_new_producer is no longer imported by
        # auth.py — the admin ping moved to submit-for-review — so there is
        # nothing to stub for it here.
        import app.routers.auth as auth_mod
        import app.routers.auth_register_producer as reg_router  # MEH-3293
        monkeypatch.setattr(reg_router, "notify_producer_registered", lambda *a, **k: None)
        monkeypatch.setattr(auth_mod, "_send_welcome_email", lambda *a, **k: None)
        monkeypatch.setattr(reg_router, "_send_welcome_email", lambda *a, **k: None)

        resp = client.post("/auth/register/producer", json=valid_producer_register_payload() | {
            "email": "farm56@test.com",
            "name": "Farmer",
            "producer_name": "חוות הבדיקה",
            "phone": "0501234567",
        })
        assert resp.status_code == 200
        from app.models.models import Producer
        p = db.query(Producer).filter(Producer.name == "חוות הבדיקה").first()
        assert p is not None
        # MEH-2100: the WhatsApp-onboarding path no longer parks a new
        # registration in a status of its own — it starts in draft, and phone
        # verification is one item of the submit gate. (That status was
        # `pending_whatsapp`, removed in MEH-2124.)
        assert p.status == "draft"

    # These two cases asserted that the admin queue GROUPED `pending` with
    # `pending_whatsapp`; the second value was removed in MEH-2124, so what is
    # left to assert is the inverse — that the queue is pending-only and a
    # draft does not leak into it. That is the property MEH-2100 introduced
    # and the one a future regression would break.
    def test_admin_pending_endpoint_is_pending_only(self, client, db):
        make_producer(db, name="Classic Pending", status="pending")
        make_producer(db, name="Still A Draft", status="draft")
        from conftest import make_user
        admin = make_user(db, email="admin56@test.com", role="admin")
        resp = client.get("/admin/producers/pending", headers=auth_header(admin))
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert "Classic Pending" in names
        assert "Still A Draft" not in names

    def test_admin_list_pending_filter_is_pending_only(self, client, db):
        make_producer(db, name="WA2", status="pending")
        make_producer(db, name="Draft2", status="draft")
        admin = make_user(db, email="admin56b@test.com", role="admin")
        resp = client.get("/admin/producers", params={"status": "pending"}, headers=auth_header(admin))
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert "WA2" in names
        assert "Draft2" not in names


class TestMeh56BioGenerator:
    """POST /producers/me/bio/generate — fail-open when no API key."""

    def test_bio_generate_returns_empty_without_api_key(self, client, db, monkeypatch):
        from app import config
        monkeypatch.setattr(config.settings, "anthropic_api_key", "")
        # Also reset the cached client in bio_generator
        import app.services.bio_generator as bg
        bg._client = None

        from conftest import make_user, auth_header
        p = make_producer(db, name="ביו חוות")
        user = make_user(db, email="biouser@test.com", role="producer")
        user.producer_id = p.id
        db.commit()

        resp = client.post(
            "/producers/me/bio/generate",
            json={"sells": "organic farm in the Galilee"},
            headers=auth_header(user),
        )
        assert resp.status_code == 200
        assert resp.json()["bio"] == ""

    def test_bio_generate_requires_auth(self, client):
        resp = client.post("/producers/me/bio/generate", json={"sells": "test"})
        assert resp.status_code == 401

    def test_bio_generate_rejects_missing_sells(self, client, db):
        # MEH-1173: sells is the one required structured field.
        from conftest import make_user
        p = make_producer(db, name="ביו2")
        user = make_user(db, email="biouser2@test.com", role="producer")
        user.producer_id = p.id
        db.commit()
        resp = client.post(
            "/producers/me/bio/generate",
            json={"area": "הגליל", "special": "מתכון סבתא"},
            headers=auth_header(user),
        )
        assert resp.status_code == 422

    def test_bio_generate_happy_path_returns_bio(self, client, db, monkeypatch):
        # MEH-1235: lock the success contract at the route level — when the AI
        # IS available the endpoint returns the generated text (the frontend
        # then fills the textarea). Pairs with the fail-open empty case above so
        # the "textarea fills OR visible Hebrew error, never silent" invariant
        # is covered on both branches. generate_bio is imported inside the
        # handler, so patch it at its source module.
        import app.services.bio_generator as bg
        monkeypatch.setattr(bg, "generate_bio", lambda *a, **k: "ריבות בעבודת יד מהגליל")

        from conftest import make_user
        p = make_producer(db, name="ביו3")
        user = make_user(db, email="biouser3@test.com", role="producer")
        user.producer_id = p.id
        db.commit()

        resp = client.post(
            "/producers/me/bio/generate",
            json={"sells": "ריבות ביתיות"},
            headers=auth_header(user),
        )
        assert resp.status_code == 200
        assert resp.json()["bio"] == "ריבות בעבודת יד מהגליל"


class TestMeh1236RequestReview:
    """POST /producers/me/request-review — resubmit-for-review ping.

    Notification-only (no schema change): COMPLETE pending producer → 200 +
    admin ping fired; already-decided producer → 409; non-producer → 403;
    unauth → 401; over the 3/hour limit → 429.

    MEH-2120: the success-path fixtures moved from `make_producer` to
    `make_submit_ready_producer`, because the endpoint now refuses an
    incomplete profile. That is not a cosmetic fixture swap — before the gate,
    all three of these passed with a producer that had no photo and no product,
    which is precisely the bug Sapir reported. The gapped cases are asserted in
    TestMeh2120RequestReviewGate below.
    """

    def _producer_owner(self, db, status, email):
        from conftest import make_user
        p = make_producer(db, name="עסק בהמתנה", status=status)
        user = make_user(db, email=email, role="producer")
        user.producer_id = p.id
        db.commit()
        return p, user

    def test_pending_producer_fires_admin_ping(self, client, db, monkeypatch):
        called = {}
        import app.services.auth_notifications as an

        def _fake(name, city, test_cause=False):
            called["args"] = (name, city)

        monkeypatch.setattr(an, "notify_admin_producer_resubmit", _fake)
        p, user = make_submit_ready_producer(db, status="pending")

        resp = client.post("/producers/me/request-review", headers=auth_header(user))
        assert resp.status_code == 200
        # BackgroundTask runs within the TestClient call → the admin ping fired
        # with the producer's own name + city, fail-open at the service layer.
        assert called["args"] == (p.name, p.city)

    # A case here asserted that a `pending_whatsapp` producer may ask for
    # re-review — the second status the guard used to admit. It was removed in
    # MEH-2124 and the guard is now `status != "pending"`, so the case was
    # deleted rather than retargeted; the pending case is asserted above and
    # the 409 cases below cover every other status.

    def test_approved_producer_conflict(self, client, db):
        # Re-review only makes sense in the pending queue (mirrors
        # admin.request_producer_changes' 409 guard).
        _, user = self._producer_owner(db, "approved", "resub3@example.com")
        resp = client.post("/producers/me/request-review", headers=auth_header(user))
        assert resp.status_code == 409

    def test_non_producer_forbidden(self, client, db):
        from conftest import make_user
        consumer = make_user(db, email="resubcons@example.com", role="consumer")
        resp = client.post(
            "/producers/me/request-review", headers=auth_header(consumer)
        )
        assert resp.status_code == 403

    def test_requires_auth(self, client):
        resp = client.post("/producers/me/request-review")
        assert resp.status_code == 401

    def test_rate_limited_after_three_per_hour(self, client, db):
        # MEH-2120: must be a COMPLETE producer, or the first three calls
        # 422 and this asserts nothing about the limiter.
        _, user = make_submit_ready_producer(db, status="pending")
        headers = auth_header(user)
        statuses = [
            client.post("/producers/me/request-review", headers=headers).status_code
            for _ in range(4)
        ]
        assert statuses[:3] == [200, 200, 200]
        assert statuses[3] == 429


class TestMeh2120RequestReviewGate:
    """MEH-2120 — the resubmit side door now runs the same completeness gate as
    the front one.

    The bug this closes was reported live: a pending business with no photo and
    no product pressed "סיימתי להשלים — שלחו לבדיקה" and was told "נשלח
    לבדיקה". The admin then received "please look again" on a profile the
    MEH-799 photo gate cannot approve.

    Every case here degrades a COMPLETE producer by exactly one field, so a
    passing assertion names the one thing that caused it rather than passing on
    a producer that was missing four things anyway.
    """

    # (requirement code, mutation that removes exactly that requirement).
    # MEH-1938 chunk 5a: location is expressed as the `producer_locations`
    # ROWS, not lat/lng. `submission_gate._has_location` lost its fallback to
    # those columns when the Contract phase removed it, so clearing them no
    # longer degrades anything — and leaving them SET while deleting the rows
    # is the stronger construction: it is red against the pre-Contract gate
    # and green after, so it measures the removal rather than restating it.
    # `.clear()` deletes the rows (cascade="all, delete-orphan",
    # models.py:520-522), the same idiom the product/category cases use.
    _DEGRADATIONS = [
        ("image", lambda p: setattr(p, "images", [])),
        ("product", lambda p: p.products.clear()),
        ("category", lambda p: p.categories.clear()),
        ("location", lambda p: p.locations.clear()),
        ("phone_verified", lambda p: setattr(p, "phone_verified", False)),
    ]

    @pytest.mark.parametrize(
        "code,degrade", _DEGRADATIONS, ids=[c for c, _ in _DEGRADATIONS]
    )
    def test_each_missing_requirement_returns_422_naming_itself(
        self, client, db, code, degrade
    ):
        producer, user = make_submit_ready_producer(db, status="pending")
        degrade(producer)
        db.commit()

        resp = client.post("/producers/me/request-review", headers=auth_header(user))

        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert detail["code"] == "submit_gate_incomplete"
        # The named code is present AND it is the only one — the producer was
        # complete before the single degradation above, so a longer list would
        # mean the fixture, not the endpoint, decided the outcome.
        assert detail["params"]["missing"] == [code]

    def test_no_admin_ping_fires_when_the_gate_refuses(self, client, db, monkeypatch):
        """The point of the ticket is the admin's queue, not the status code.

        A 422 that still pinged the admin would satisfy every other assertion
        in this class and fix nothing.
        """
        called = []
        import app.services.auth_notifications as an

        monkeypatch.setattr(
            an, "notify_admin_producer_resubmit", lambda *a: called.append(a)
        )
        producer, user = make_submit_ready_producer(db, status="pending")
        producer.images = []
        db.commit()

        resp = client.post("/producers/me/request-review", headers=auth_header(user))

        assert resp.status_code == 422
        assert called == [], "the admin must not be pinged about a refused resubmit"

    def test_complete_pending_producer_is_unaffected(self, client, db):
        """The other side of the boundary. A gate asserted only on its refusing
        side passes just as well when it refuses everything."""
        _, user = make_submit_ready_producer(db, status="pending")
        resp = client.post("/producers/me/request-review", headers=auth_header(user))
        assert resp.status_code == 200

    def test_status_guard_still_wins_over_the_gate(self, client, db):
        """An approved business asking for re-review gets 409, not a
        completeness list. Ordering matters: telling a decided producer what it
        is "missing" would be answering a question nobody asked."""
        producer, user = make_submit_ready_producer(db, status="approved")
        producer.images = []
        db.commit()

        resp = client.post("/producers/me/request-review", headers=auth_header(user))
        assert resp.status_code == 409

    def test_422_body_is_identical_to_submit_for_review(self, client, db):
        """The shared-client-path requirement, proven by comparing the two REAL
        responses rather than by asserting a literal twice.

        Two producers, identical except for status, each missing only a photo.
        `detailToMessage` renders whichever it receives with no branch, and the
        checklist reads `params.missing` without knowing which door was used —
        so these payloads must be equal, not merely similar. A hand-written
        literal in each test would pass while the two endpoints drifted.
        """
        gapped_pending, pending_user = make_submit_ready_producer(
            db, status="pending", name="עסק בהמתנה"
        )
        gapped_pending.images = []
        gapped_draft, draft_user = make_submit_ready_producer(
            db, status="draft", name="עסק בטיוטה"
        )
        gapped_draft.images = []
        db.commit()

        side_door = client.post(
            "/producers/me/request-review", headers=auth_header(pending_user)
        )
        front_door = client.post(
            "/producers/me/submit-for-review", headers=auth_header(draft_user)
        )

        assert side_door.status_code == front_door.status_code == 422
        assert side_door.json()["detail"] == front_door.json()["detail"]


# ---------- Contact ----------

class TestContact:
    """POST /contact — public contact form.

    Required by Israeli consumer protection law (the "legal compliance"
    PR added the frontend /contact page; this backend endpoint is its
    counterpart).

    Contract:
    - Anonymous (no auth).
    - Validates {name, email, message} via Pydantic.
    - Persists to contact_messages table (source of truth).
    - Sends an email to CONTACT_EMAIL (falls back to ADMIN_EMAIL).
    - Fail-open: returns 200 even if SMTP is unconfigured or raises,
      because the DB row is the source of truth and the admin can
      always read messages from the DB directly.
    """

    VALID_PAYLOAD = {
        "name": "רות כהן",
        "email": "ruth@example.com",
        "message": "היי, יש לכן אפשרות להוסיף יצרן חדש?",
    }

    # ----- DB persistence -----

    def test_submit_contact_saves_to_db(self, client, db):
        resp = client.post("/contact", json=self.VALID_PAYLOAD)
        assert resp.status_code == 200
        row = db.query(ContactMessage).first()
        assert row is not None
        assert row.name == "רות כהן"
        assert row.email == "ruth@example.com"
        # MEH-1113: no topic → "general" label prepended as the first line.
        assert row.message == "נושא: שאלה כללית\n\nהיי, יש לכן אפשרות להוסיף יצרן חדש?"

    def test_submit_contact_trims_and_lowercases_email(self, client, db):
        resp = client.post(
            "/contact",
            json={
                "name": "  רות כהן  ",
                "email": "Ruth@Example.COM",
                "message": "  שלום  ",
            },
        )
        assert resp.status_code == 200
        row = db.query(ContactMessage).first()
        assert row.name == "רות כהן"
        assert row.email == "ruth@example.com"
        # MEH-1113: message trimmed, then prefixed with the default topic label.
        assert row.message == "נושא: שאלה כללית\n\nשלום"

    # ----- Validation -----

    def test_submit_contact_missing_name_fails(self, client):
        payload = dict(self.VALID_PAYLOAD)
        del payload["name"]
        resp = client.post("/contact", json=payload)
        assert resp.status_code == 422

    def test_submit_contact_missing_email_fails(self, client):
        payload = dict(self.VALID_PAYLOAD)
        del payload["email"]
        resp = client.post("/contact", json=payload)
        assert resp.status_code == 422

    def test_submit_contact_missing_message_fails(self, client):
        payload = dict(self.VALID_PAYLOAD)
        del payload["message"]
        resp = client.post("/contact", json=payload)
        assert resp.status_code == 422

    def test_submit_contact_invalid_email_fails(self, client):
        payload = dict(self.VALID_PAYLOAD)
        payload["email"] = "not-an-email"
        resp = client.post("/contact", json=payload)
        assert resp.status_code == 422

    def test_submit_contact_empty_name_fails(self, client):
        payload = dict(self.VALID_PAYLOAD)
        payload["name"] = ""
        resp = client.post("/contact", json=payload)
        assert resp.status_code == 422

    def test_submit_contact_no_auth_required(self, client, db):
        # Explicit: no Authorization header
        resp = client.post("/contact", json=self.VALID_PAYLOAD)
        assert resp.status_code == 200
        assert db.query(ContactMessage).count() == 1

    # ----- Topic (MEH-1113 — unified inbound routing, no DB column) -----

    def test_submit_contact_valid_topic_prepends_label_and_subject(
        self, client, db, monkeypatch
    ):
        """A whitelisted topic prepends its Hebrew label to the stored message
        and tags the email subject."""
        from app import config
        from unittest.mock import patch

        monkeypatch.setattr(config.settings, "resend_api_key", "re_test_key")
        monkeypatch.setattr(config.settings, "contact_email", "inbox@example.com")

        payload = dict(self.VALID_PAYLOAD)
        payload["topic"] = "business"
        with patch("app.routers.marketing.send_email") as mock_send:
            resp = client.post("/contact", json=payload)

        assert resp.status_code == 200
        row = db.query(ContactMessage).first()
        assert row.message.startswith("נושא: פנייה של בית עסק\n\n")
        assert "להוסיף יצרן חדש" in row.message
        _to, subject, _body = mock_send.call_args[0]
        assert subject == "מהמקור — פנייה חדשה (פנייה של בית עסק) מ-רות כהן"

    def test_submit_contact_invalid_topic_returns_422(self, client, db):
        """An off-whitelist topic is rejected with a Hebrew 422 detail."""
        payload = dict(self.VALID_PAYLOAD)
        payload["topic"] = "spam"
        resp = client.post("/contact", json=payload)
        assert resp.status_code == 422
        assert "נושא הפנייה אינו תקין" in resp.text
        assert db.query(ContactMessage).count() == 0

    def test_submit_contact_missing_topic_defaults_to_general(self, client, db):
        """Missing/None topic is treated as the 'general' label."""
        payload = dict(self.VALID_PAYLOAD)
        payload.pop("topic", None)
        resp = client.post("/contact", json=payload)
        assert resp.status_code == 200
        row = db.query(ContactMessage).first()
        assert row.message.startswith("נושא: שאלה כללית\n\n")

    # ----- Email delivery (Resend) -----

    def test_submit_contact_sends_email_to_contact_email(
        self, client, db, monkeypatch
    ):
        """When CONTACT_EMAIL is set, email routes to it with correct body."""
        from app import config
        from unittest.mock import patch

        monkeypatch.setattr(config.settings, "resend_api_key", "re_test_key")
        monkeypatch.setattr(
            config.settings, "contact_email", "contactmehamakor.online@gmail.com"
        )

        with patch("app.routers.marketing.send_email") as mock_send:
            resp = client.post("/contact", json=self.VALID_PAYLOAD)

        assert resp.status_code == 200
        mock_send.assert_called_once()
        to, subject, body = mock_send.call_args[0]
        assert to == "contactmehamakor.online@gmail.com"
        assert "רות כהן" in body
        assert "ruth@example.com" in body
        assert "להוסיף יצרן חדש" in body
        assert db.query(ContactMessage).count() == 1

    def test_submit_contact_falls_back_to_admin_email(
        self, client, db, monkeypatch
    ):
        """If CONTACT_EMAIL is empty but ADMIN_EMAIL is set, email routes to ADMIN_EMAIL."""
        from app import config
        from unittest.mock import patch

        monkeypatch.setattr(config.settings, "resend_api_key", "re_test_key")
        monkeypatch.setattr(config.settings, "contact_email", "")
        monkeypatch.setattr(config.settings, "admin_email", "levismadar80@gmail.com")

        with patch("app.routers.marketing.send_email") as mock_send:
            resp = client.post("/contact", json=self.VALID_PAYLOAD)

        assert resp.status_code == 200
        to, *_ = mock_send.call_args[0]
        assert to == "levismadar80@gmail.com"

    # ----- Fail-open -----

    def test_submit_contact_fail_open_when_no_recipient(
        self, client, db, monkeypatch
    ):
        """No recipient configured → 200, DB row still saved, no crash."""
        from app import config

        monkeypatch.setattr(config.settings, "contact_email", "")
        monkeypatch.setattr(config.settings, "admin_email", "")

        resp = client.post("/contact", json=self.VALID_PAYLOAD)
        assert resp.status_code == 200
        assert db.query(ContactMessage).count() == 1

    def test_submit_contact_fail_open_on_send_error(
        self, client, db, monkeypatch
    ):
        """Resend API raises → 200, DB row still saved (fail-open inside send_email)."""
        from app import config
        from unittest.mock import patch

        monkeypatch.setattr(config.settings, "resend_api_key", "re_test_key")
        monkeypatch.setattr(
            config.settings, "contact_email", "contactmehamakor.online@gmail.com"
        )

        with patch("resend.Emails.send", side_effect=Exception("network error")):
            resp = client.post("/contact", json=self.VALID_PAYLOAD)

        assert resp.status_code == 200
        assert db.query(ContactMessage).count() == 1
