"""
API tests for מהמקור backend.

Coverage:
- Auth: register, login (success/wrong password/blocked user), /auth/me
- Producers: list, filter by delivery_city, filter by category, get by id
- Admin: 401/403 for non-admins, approve flow, dashboard, users, categories,
  settings, analytics, page editing
- Contact: POST /contact — DB save, validation, email sending, fail-open
"""
from app.models.models import AdminSetting, ContactMessage, Producer, ProducerReview, ProducerWhatsAppClick, StaticPage
from conftest import auth_header, make_category, make_producer, make_user


# ---------- Auth ----------

class TestAuth:
    def test_register_creates_user_and_returns_token(self, client):
        resp = client.post(
            "/auth/register",
            json={"email": "alice@test.com", "name": "Alice", "password": "Pass1234!"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["token_type"] == "bearer"
        assert body["access_token"]

    def test_register_duplicate_email_fails(self, client, db):
        make_user(db, email="dup@test.com")
        resp = client.post(
            "/auth/register",
            json={"email": "dup@test.com", "name": "x", "password": "Pass1234!"},
        )
        assert resp.status_code == 400

    def test_login_returns_jwt(self, client, db):
        make_user(db, email="bob@test.com", password="Pass1234!")
        resp = client.post(
            "/auth/login",
            json={"email": "bob@test.com", "password": "Pass1234!"},
        )
        assert resp.status_code == 200
        assert resp.json()["access_token"]

    def test_login_wrong_password(self, client, db):
        make_user(db, email="bob2@test.com", password="Pass1234!")
        resp = client.post(
            "/auth/login",
            json={"email": "bob2@test.com", "password": "wrong"},
        )
        assert resp.status_code == 401

    def test_login_blocked_user_returns_403(self, client, db):
        make_user(db, email="blocked@test.com", password="Pass1234!", is_blocked=True)
        resp = client.post(
            "/auth/login",
            json={"email": "blocked@test.com", "password": "Pass1234!"},
        )
        assert resp.status_code == 403

    def test_me_requires_token(self, client):
        assert client.get("/auth/me").status_code == 401

    def test_me_returns_current_user(self, client, db):
        u = make_user(db, email="me@test.com")
        resp = client.get("/auth/me", headers=auth_header(u))
        assert resp.status_code == 200
        assert resp.json()["email"] == "me@test.com"

    # --- Producer registration (MEH-144 regression tests) ---

    VALID_PRODUCER_REG = {
        "email": "producer@test.com",
        "name": "שרה ישראלית",
        "password": "Pass1234!",
        "producer_name": "חוות שרה",
        "phone": "0501234567",
        "category_ids": [],
        "primary_contact_method": "whatsapp",
    }

    def test_register_producer_succeeds_returns_token(self, client, db):
        """Valid payload → 200 + JWT; user+producer rows created."""
        resp = client.post("/auth/register/producer", json=self.VALID_PRODUCER_REG)
        assert resp.status_code == 200
        assert resp.json()["access_token"]
        from app.models.models import User, Producer
        user = db.query(User).filter(User.email == "producer@test.com").first()
        assert user is not None
        assert user.role == "producer"
        assert user.is_producer is True  # MEH-143: durable flag set on new registration too
        producer = db.query(Producer).filter(Producer.name == "חוות שרה").first()
        assert producer is not None
        assert producer.status == "pending_whatsapp"

    def test_register_producer_duplicate_email_returns_409(self, client, db):
        """Existing email → 409 (not 400) with actionable Hebrew message."""
        make_user(db, email="producer@test.com")
        resp = client.post("/auth/register/producer", json=self.VALID_PRODUCER_REG)
        assert resp.status_code == 409
        assert "התחברי לחשבון שלך" in resp.json()["detail"]

    def test_register_producer_email_failure_still_succeeds(self, client, db, monkeypatch):
        """Email delivery failure must never block the 200 response (fire-and-forget)."""
        from unittest.mock import patch
        from app import config
        # Activate resend so send_email attempts a real send, then simulate Resend
        # being down.  The exception is caught INSIDE send_email's try/except so
        # the background task completes without raising — registration must still
        # return 200.
        monkeypatch.setattr(config.settings, "resend_api_key", "re_test_key")
        with patch("resend.Emails.send", side_effect=Exception("Resend down")):
            resp = client.post("/auth/register/producer", json={
                **self.VALID_PRODUCER_REG,
                "email": "producer2@test.com",
                "producer_name": "חוות שרה 2",
            })
        assert resp.status_code == 200
        assert resp.json()["access_token"]

    # --- MEH-143: role-upgrade (existing consumer adds a producer) ---

    def test_logged_in_user_can_upgrade_to_producer(self, client, db):
        """Authenticated consumer → POST without email/name/password → 200 + producer created."""
        from app.models.models import User, Producer
        user = make_user(db, email="consumer@upgrade.com", role="consumer")
        resp = client.post(
            "/auth/register/producer",
            json={
                "producer_name": "חוות השדרוג",
                "phone": "0521234567",
                "category_ids": [],
                "primary_contact_method": "whatsapp",
            },
            headers=auth_header(user),
        )
        assert resp.status_code == 200
        assert resp.json()["access_token"]
        db.expire_all()
        upgraded = db.query(User).filter(User.id == user.id).first()
        assert upgraded.role == "producer"
        assert upgraded.is_producer is True
        assert upgraded.producer_id is not None

    def test_upgrade_twice_returns_409(self, client, db):
        """A user who already has a producer cannot register another."""
        user = make_user(db, email="already@producer.com", role="producer")
        # Give the user a linked producer
        from app.models.models import Producer
        producer = Producer(name="קיים", status="pending_whatsapp")
        db.add(producer)
        db.flush()
        user.producer_id = producer.id
        db.commit()
        resp = client.post(
            "/auth/register/producer",
            json={
                "producer_name": "חוות שנייה",
                "phone": "0521234567",
                "category_ids": [],
                "primary_contact_method": "whatsapp",
            },
            headers=auth_header(user),
        )
        assert resp.status_code == 409

    def test_email_exists_endpoint_returns_true(self, client, db):
        make_user(db, email="taken@test.com")
        resp = client.get("/auth/email-exists?email=taken@test.com")
        assert resp.status_code == 200
        assert resp.json()["exists"] is True

    def test_email_exists_endpoint_returns_false(self, client):
        resp = client.get("/auth/email-exists?email=free@test.com")
        assert resp.status_code == 200
        assert resp.json()["exists"] is False

    def test_anonymous_registration_still_requires_account_fields(self, client):
        """Unauthenticated POST without email/name/password → 422."""
        resp = client.post(
            "/auth/register/producer",
            json={
                "producer_name": "חוות אנונימית",
                "phone": "0521234567",
                "category_ids": [],
                "primary_contact_method": "whatsapp",
            },
        )
        assert resp.status_code == 422


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
        "category_ids": [],
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

    def test_post_producers_with_auth_creates_pending_producer(self, client, db):
        """Authenticated user → 201, producer created with status=pending
        (pre-existing behavior, now gated behind auth)."""
        user = make_user(db, email="creator@test.com")
        resp = client.post(
            "/producers",
            json=self.VALID_PRODUCER_PAYLOAD,
            headers=auth_header(user),
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["name"] == "חוות הבדיקה"
        assert body["status"] == "pending"
        # DB row exists
        row = db.query(Producer).filter(Producer.name == "חוות הבדיקה").first()
        assert row is not None
        assert row.status == "pending"

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
        p = make_producer(db, status="pending")
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
            json={"name": "חדש", "emoji": "✨"},
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

    def test_settings_get_and_update(self, client, db):
        admin = make_user(db, role="admin")
        resp = client.get("/admin/settings", headers=auth_header(admin))
        assert resp.status_code == 200
        defaults = resp.json()
        assert "admin_email" in defaults

        resp = client.put(
            "/admin/settings",
            json={"admin_email": "boss@mehamakor.co.il"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        # Persisted
        row = db.query(AdminSetting).filter(AdminSetting.key == "admin_email").first()
        assert row is not None
        assert row.value == "boss@mehamakor.co.il"

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
    """Registration produces pending_whatsapp status; admin sees it as pending."""

    def test_register_producer_sets_pending_whatsapp(self, client, db, monkeypatch):
        # Stub out Twilio and email so no network calls
        import app.routers.auth as auth_mod
        monkeypatch.setattr(auth_mod, "_notify_admin_new_producer", lambda *a, **k: None)
        monkeypatch.setattr(auth_mod, "_notify_producer_registered", lambda *a, **k: None)
        monkeypatch.setattr(auth_mod, "_send_welcome_email", lambda *a, **k: None)

        resp = client.post("/auth/register/producer", json={
            "email": "farm56@test.com",
            "name": "Farmer",
            "password": "Pass1234!",
            "producer_name": "חוות הבדיקה",
            "phone": "0501234567",
            "category_ids": [],
            "primary_contact_method": "whatsapp",
        })
        assert resp.status_code == 200
        from app.models.models import Producer
        p = db.query(Producer).filter(Producer.name == "חוות הבדיקה").first()
        assert p is not None
        assert p.status == "pending_whatsapp"

    def test_admin_pending_endpoint_includes_pending_whatsapp(self, client, db):
        make_producer(db, name="Classic Pending", status="pending")
        make_producer(db, name="WA Pending", status="pending_whatsapp")
        from conftest import make_user
        admin = make_user(db, email="admin56@test.com", role="admin")
        resp = client.get("/admin/producers/pending", headers=auth_header(admin))
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert "Classic Pending" in names
        assert "WA Pending" in names

    def test_admin_list_pending_filter_includes_pending_whatsapp(self, client, db):
        make_producer(db, name="WA2", status="pending_whatsapp")
        admin = make_user(db, email="admin56b@test.com", role="admin")
        resp = client.get("/admin/producers", params={"status": "pending"}, headers=auth_header(admin))
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert "WA2" in names


class TestMeh56BioGenerator:
    """POST /producers/me/bio/generate — fail-open when no API key."""

    def test_bio_generate_returns_empty_without_api_key(self, client, db, monkeypatch):
        from app import config
        monkeypatch.setattr(config.settings, "anthropic_api_key", "")
        # Also reset the cached client in bio_generator
        import app.services.bio_generator as bg
        bg._client = None

        from conftest import make_user, auth_header
        from app.models.models import Producer
        p = make_producer(db, name="ביו חוות")
        user = make_user(db, email="biouser@test.com", role="producer")
        user.producer_id = p.id
        db.commit()

        resp = client.post(
            "/producers/me/bio/generate",
            json={"source": "organic farm in the Galilee"},
            headers=auth_header(user),
        )
        assert resp.status_code == 200
        assert resp.json()["bio"] == ""

    def test_bio_generate_requires_auth(self, client):
        resp = client.post("/producers/me/bio/generate", json={"source": "test"})
        assert resp.status_code == 401

    def test_bio_generate_rejects_empty_source(self, client, db):
        from conftest import make_user
        from app.models.models import Producer
        p = make_producer(db, name="ביו2")
        user = make_user(db, email="biouser2@test.com", role="producer")
        user.producer_id = p.id
        db.commit()
        resp = client.post(
            "/producers/me/bio/generate",
            json={"source": ""},
            headers=auth_header(user),
        )
        assert resp.status_code == 422


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
        assert row.message == "היי, יש לכן אפשרות להוסיף יצרן חדש?"

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
        assert row.message == "שלום"

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


# ---------- WhatsApp Click Tracking ----------

class TestWhatsAppClickTracking:
    """POST /producers/{id}/whatsapp-click — anonymous + optional-auth tracking.

    Verifies:
    - Anonymous click records a row with user_id=None
    - Authenticated click records a row with the correct user_id
    - Unknown producer returns 404
    - Dashboard endpoint counts the last-7d clicks correctly
    """

    def test_anonymous_click_records_row(self, client, db):
        p = make_producer(db)
        resp = client.post(f"/producers/{p.id}/whatsapp-click")
        assert resp.status_code == 200
        row = db.query(ProducerWhatsAppClick).first()
        assert row is not None
        assert row.producer_id == p.id
        assert row.user_id is None

    def test_authenticated_click_records_user_id(self, client, db):
        p = make_producer(db)
        user = make_user(db, email="clicker@test.com")
        resp = client.post(
            f"/producers/{p.id}/whatsapp-click",
            headers=auth_header(user),
        )
        assert resp.status_code == 200
        row = db.query(ProducerWhatsAppClick).first()
        assert row is not None
        assert row.user_id == user.id

    def test_unknown_producer_returns_404(self, client):
        resp = client.post(
            "/producers/00000000-0000-0000-0000-000000000000/whatsapp-click"
        )
        assert resp.status_code == 404

    def test_dashboard_counts_weekly_clicks(self, client, db):
        """whatsapp_clicks_week reflects rows recorded in the last 7 days."""
        p = make_producer(db)
        user = make_user(db, email="prod@test.com", role="producer")
        user.producer_id = p.id
        db.commit()

        # Record 3 clicks
        for _ in range(3):
            client.post(f"/producers/{p.id}/whatsapp-click")

        resp = client.get("/producers/me/dashboard", headers=auth_header(user))
        assert resp.status_code == 200
        assert resp.json()["whatsapp_clicks_week"] == 3


# ---------- Producer Reviews ----------

class TestProducerReviews:
    """POST /producers/{id}/reviews — WhatsApp gate, moderation, pagination.

    Gate rule: first-time reviewer must have a ProducerWhatsAppClick row
    with user_id matching the caller. Existing reviewers (updating) bypass
    the gate.
    """

    def _make_click(self, db, producer, user):
        """Helper: insert a whatsapp click row for a user+producer pair."""
        click = ProducerWhatsAppClick(
            producer_id=producer.id,
            user_id=user.id,
        )
        db.add(click)
        db.commit()
        return click

    def test_get_reviews_empty(self, client, db):
        p = make_producer(db)
        resp = client.get(f"/producers/{p.id}/reviews")
        assert resp.status_code == 200
        body = resp.json()
        assert body["reviews"] == []
        assert body["total"] == 0
        assert body["page"] == 1
        assert body["pages"] == 1

    def test_post_review_requires_whatsapp_click(self, client, db):
        """No prior WhatsApp click → 403."""
        p = make_producer(db)
        user = make_user(db, email="norclick@test.com")
        resp = client.post(
            f"/producers/{p.id}/reviews",
            json={"stars": 5, "title": "מצוין", "body": None},
            headers=auth_header(user),
        )
        assert resp.status_code == 403

    def test_post_review_allowed_after_whatsapp_click(self, client, db):
        """User who clicked WhatsApp → 201, review stored."""
        p = make_producer(db)
        user = make_user(db, email="clicker@test.com")
        self._make_click(db, p, user)

        resp = client.post(
            f"/producers/{p.id}/reviews",
            json={"stars": 4, "title": "טעים מאוד", "body": "המוצר ברמה גבוהה"},
            headers=auth_header(user),
        )
        assert resp.status_code == 201
        assert resp.json()["stars"] == 4

        review = db.query(ProducerReview).first()
        assert review is not None
        assert review.user_id == user.id

    def test_post_review_update_bypasses_gate(self, client, db):
        """User updating an existing review doesn't need a new click."""
        p = make_producer(db)
        user = make_user(db, email="updater@test.com")
        # Create a review directly in DB (as if they had clicked before)
        db.add(ProducerReview(
            producer_id=p.id,
            user_id=user.id,
            stars=3,
            body="OK",
        ))
        db.commit()

        # No click row but can still update existing review
        resp = client.post(
            f"/producers/{p.id}/reviews",
            json={"stars": 5, "title": "עדכון", "body": "עכשיו יותר טוב"},
            headers=auth_header(user),
        )
        assert resp.status_code == 201
        assert resp.json()["stars"] == 5

    def test_get_reviews_pagination(self, client, db):
        """12 reviews → 2 pages; page 1 returns 10, page 2 returns 2."""
        p = make_producer(db)
        for i in range(12):
            u = make_user(db, email=f"rev{i}@test.com")
            db.add(ProducerReview(producer_id=p.id, user_id=u.id, stars=5))
        db.commit()

        p1 = client.get(f"/producers/{p.id}/reviews", params={"page": 1}).json()
        assert len(p1["reviews"]) == 10
        assert p1["total"] == 12
        assert p1["pages"] == 2

        p2 = client.get(f"/producers/{p.id}/reviews", params={"page": 2}).json()
        assert len(p2["reviews"]) == 2

    def test_avg_rating_updated_after_review(self, client, db):
        """Producer avg_rating is recomputed after each review."""
        p = make_producer(db)
        for stars, email in [(4, "r1@test.com"), (2, "r2@test.com")]:
            u = make_user(db, email=email)
            db.add(ProducerReview(producer_id=p.id, user_id=u.id, stars=stars))
        db.commit()

        from app.routers.reviews import _recompute_producer_rating
        from app.database import SessionLocal
        with SessionLocal() as s:
            _recompute_producer_rating(p.id, s)

        db.expire(p)
        db.refresh(p)
        assert abs(p.avg_rating - 3.0) < 0.01
        assert p.reviews_count == 2

    def test_post_review_requires_auth(self, client, db):
        p = make_producer(db)
        resp = client.post(f"/producers/{p.id}/reviews", json={"stars": 5})
        assert resp.status_code == 401


# ---------- Avatar upload ----------

class TestAvatarUpload:
    def test_patch_profile_saves_avatar_url(self, client, db):
        """PATCH /users/me with avatar_url persists it and returns it in UserOut."""
        user = make_user(db, email="avatar@test.com")
        resp = client.patch(
            "/users/me",
            json={"avatar_url": "https://res.cloudinary.com/test/image/upload/avatars/abc.jpg"},
            headers=auth_header(user),
        )
        assert resp.status_code == 200
        assert resp.json()["avatar_url"] == "https://res.cloudinary.com/test/image/upload/avatars/abc.jpg"

    def test_upload_avatar_requires_auth(self, client, db):
        """POST /upload/avatar without JWT → 401."""
        import io
        fake_jpg = b"\xff\xd8\xff" + b"\x00" * 100
        resp = client.post(
            "/upload/avatar",
            files={"file": ("photo.jpg", io.BytesIO(fake_jpg), "image/jpeg")},
        )
        assert resp.status_code == 401


# ---------- MEH-148: Reserved slug protection ----------

class TestReservedSlugs:
    """Producer slugs must not collide with app routes (MEH-148)."""

    def test_admin_create_with_explicit_reserved_slug_returns_400(self, client, db):
        admin = make_user(db, role="admin")
        resp = client.post(
            "/admin/producers",
            json={
                "name": "חנות נהדרת",
                "slug": "about",
                "city": "תל אביב",
            },
            headers=auth_header(admin),
        )
        assert resp.status_code == 400
        assert "שמור" in resp.json()["detail"]

    def test_admin_create_reserved_slug_variants(self, client, db):
        admin = make_user(db, role="admin")
        for reserved in ("map", "admin", "login", "search", "favorites", "api"):
            resp = client.post(
                "/admin/producers",
                json={"name": "עסק", "slug": reserved, "city": "חיפה"},
                headers=auth_header(admin),
            )
            assert resp.status_code == 400, f"Expected 400 for slug '{reserved}'"

    def test_admin_create_with_reserved_name_auto_suffixes_slug(self, client, db):
        """When name auto-generates a reserved slug, the slug should be suffixed."""
        admin = make_user(db, role="admin")
        # Name "about" → slug "about" is reserved → should become "about-2"
        resp = client.post(
            "/admin/producers",
            json={"name": "about", "city": "ירושלים"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["slug"] not in ("about",), "Reserved slug was assigned unchanged"
        assert body["slug"].startswith("about-")

    def test_admin_update_with_reserved_slug_returns_400(self, client, db):
        admin = make_user(db, role="admin")
        producer = make_producer(db)
        resp = client.put(
            f"/admin/producers/{producer.id}",
            json={"slug": "map"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 400
        assert "שמור" in resp.json()["detail"]

    def test_producer_me_update_with_reserved_slug_returns_400(self, client, db):
        """A producer user cannot set their own slug to a reserved word."""
        user = make_user(db, role="producer")
        producer = make_producer(db)
        user.producer_id = producer.id
        db.commit()
        resp = client.put(
            "/producers/me",
            json={"slug": "admin"},
            headers=auth_header(user),
        )
        assert resp.status_code == 400
        assert "שמור" in resp.json()["detail"]

    def test_non_reserved_slug_is_accepted(self, client, db):
        admin = make_user(db, role="admin")
        resp = client.post(
            "/admin/producers",
            json={"name": "חוות האגס", "slug": "chavat-ha-egas", "city": "כפר סבא"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 201
        assert resp.json()["slug"] == "chavat-ha-egas"

    def test_reserved_slug_set_contains_key_routes(self, client, db):
        """Smoke-test the RESERVED_SLUGS constant itself."""
        from app.slug_utils import RESERVED_SLUGS
        for route in ("about", "map", "login", "admin", "search", "api"):
            assert route in RESERVED_SLUGS


# ---------- MEH-146: double-submit idempotency ----------

class TestDoubleSubmitIdempotency:
    """MEH-146 — duplicate POST on favorites and reviews must return 200, not 500."""

    def test_favorite_double_submit_is_idempotent(self, client, db):
        user = make_user(db, email="fav_double@test.com")
        producer = make_producer(db)
        headers = auth_header(user)

        r1 = client.post(f"/users/me/favorites/{producer.id}", headers=headers)
        assert r1.status_code in (200, 201)

        r2 = client.post(f"/users/me/favorites/{producer.id}", headers=headers)
        assert r2.status_code in (200, 201), f"Second POST returned {r2.status_code}: {r2.text}"

    def test_review_double_submit_is_idempotent(self, client, db):
        user = make_user(db, email="rev_double@test.com")
        producer = make_producer(db)
        headers = auth_header(user)

        # Satisfy the WhatsApp-click gate
        from app.models.models import ProducerWhatsAppClick
        click = ProducerWhatsAppClick(producer_id=producer.id, user_id=user.id)
        db.add(click)
        db.commit()

        payload = {"stars": 4, "title": "נהדר", "body": "מאוד טרי"}
        r1 = client.post(f"/producers/{producer.id}/reviews", json=payload, headers=headers)
        assert r1.status_code in (200, 201)

        r2 = client.post(f"/producers/{producer.id}/reviews", json=payload, headers=headers)
        assert r2.status_code in (200, 201), f"Second POST returned {r2.status_code}: {r2.text}"


# ---------- MEH-153: Cloudinary Hebrew error messages ----------

class TestCloudinaryHebrewErrors:
    """Upload error responses must be Hebrew (MEH-153)."""

    def test_freemium_limit_returns_hebrew(self, client, db):
        """A producer on free plan with 3+ images gets a Hebrew 403."""
        import io

        user = make_user(db, role="producer", email="upload_limit@test.com")
        producer = make_producer(db)
        user.producer_id = producer.id
        producer.plan = "free"
        # images is ARRAY(Text) on Producer; set 3 URLs to hit the limit
        producer.images = [
            "https://res.cloudinary.com/test/img/0.jpg",
            "https://res.cloudinary.com/test/img/1.jpg",
            "https://res.cloudinary.com/test/img/2.jpg",
        ]
        db.commit()

        fake_jpg = b"\xff\xd8\xff" + b"\x00" * 100
        resp = client.post(
            "/upload/image",
            files={"file": ("photo.jpg", io.BytesIO(fake_jpg), "image/jpeg")},
            headers=auth_header(user),
        )
        assert resp.status_code == 403
        detail = resp.json()["detail"]
        assert "חינם" in detail or "חינמי" in detail, f"Expected Hebrew, got: {detail}"
        assert "Free plan" not in detail, "English error leaked to user"

    def test_oversized_image_returns_hebrew(self, client, db):
        """Files over 5 MB return a Hebrew 400 error."""
        import io
        user = make_user(db, email="upload_size@test.com")
        big_content = b"\xff\xd8\xff" + b"\x00" * (5 * 1024 * 1024 + 1)
        resp = client.post(
            "/upload/image",
            files={"file": ("big.jpg", io.BytesIO(big_content), "image/jpeg")},
            headers=auth_header(user),
        )
        assert resp.status_code == 400
        detail = resp.json()["detail"]
        assert "MB" in detail
        assert "Upload failed" not in detail

    def test_invalid_file_type_returns_hebrew(self, client, db):
        """Non-image binary returns a Hebrew 400 error."""
        import io
        user = make_user(db, email="upload_type@test.com")
        fake_pdf = b"%PDF-1.4 not an image"
        resp = client.post(
            "/upload/image",
            files={"file": ("doc.pdf", io.BytesIO(fake_pdf), "application/pdf")},
            headers=auth_header(user),
        )
        assert resp.status_code == 400
        detail = resp.json()["detail"]
        assert "JPG" in detail or "PNG" in detail or "תמונות" in detail
        assert "Upload failed" not in detail


# ---------- MEH-155: Vacation badge auto-clear after return_date ----------

class TestVacationBadgeClear:
    """vacation_until field auto-clears expired vacation at serialization time (MEH-155)."""

    def test_set_vacation_with_future_date(self, client, db):
        """POST availability-status with vacation + future vacation_until persists both."""
        from datetime import date, timedelta
        user = make_user(db, role="producer")
        producer = make_producer(db)
        user.producer_id = producer.id
        db.commit()

        future = (date.today() + timedelta(days=7)).isoformat()
        resp = client.post(
            "/producers/me/availability-status",
            json={"status": "vacation", "vacation_until": future},
            headers=auth_header(user),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["availability_status"] == "vacation"
        assert body["vacation_until"] == future

    def test_expired_vacation_clears_in_api_response(self, client, db):
        """A producer with vacation_until in the past should appear as 'available' in GET /producers."""
        from datetime import date, timedelta
        producer = make_producer(db)
        producer.availability_status = "vacation"
        producer.vacation_until = date.today() - timedelta(days=1)
        db.commit()

        resp = client.get(f"/producers/{producer.id}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["availability_status"] == "available", (
            f"Expected 'available' for expired vacation, got '{body['availability_status']}'"
        )
        assert body.get("vacation_until") is None

    def test_active_vacation_stays_in_api_response(self, client, db):
        """A producer with vacation_until in the future stays as 'vacation'."""
        from datetime import date, timedelta
        producer = make_producer(db)
        producer.availability_status = "vacation"
        producer.vacation_until = date.today() + timedelta(days=3)
        db.commit()

        resp = client.get(f"/producers/{producer.id}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["availability_status"] == "vacation"

    def test_switching_away_from_vacation_clears_date(self, client, db):
        """Setting status to 'available' must clear vacation_until."""
        from datetime import date, timedelta
        user = make_user(db, role="producer")
        producer = make_producer(db)
        user.producer_id = producer.id
        producer.availability_status = "vacation"
        producer.vacation_until = date.today() + timedelta(days=5)
        db.commit()

        resp = client.post(
            "/producers/me/availability-status",
            json={"status": "available"},
            headers=auth_header(user),
        )
        assert resp.status_code == 200
        assert resp.json()["vacation_until"] is None


class TestMojibakeDetection:
    """MEH-154 — Excel import rejects mojibake'd Hebrew (UTF-8 decoded as Latin-1)."""

    # Helpers — raw rows as openpyxl would deliver them (cells already extracted).
    # Columns: name, contact, phone, instagram, website, wa_group, _unused, city, cat, ...
    def _good_row(self, name="חוות הגליל"):
        return [name, "שרה כהן", "0521234567", None, None, None, None, "חיפה", "בשר", None,
                None, None, None, "תיאור", None, None, None, None, None, None, None, None, None]

    def _mojibake_row(self, name="×©×××"):
        # × (U+00D7) is the Latin-1 misread of the UTF-8 lead byte 0xD7 for Hebrew.
        return [name, None, "0521111111", None, None, None, None, "×××", None, None,
                None, None, None, None, None, None, None, None, None, None, None, None, None]

    def test_good_hebrew_passes_parse(self):
        from app.services.producer_import import parse_row
        result = parse_row(self._good_row(), row_number=2)
        assert not result.mojibake
        assert not any("קידוד" in e for e in result.errors)

    def test_mojibake_name_flagged(self):
        from app.services.producer_import import parse_row
        # U+00D7 in the name should be detected as mojibake.
        result = parse_row(self._mojibake_row(name="ס×××ø"), row_number=2)
        assert result.mojibake
        assert any("קידוד לא תקין" in e for e in result.errors)

    def test_mojibake_in_city_field_flagged(self):
        from app.services.producer_import import parse_row
        row = self._good_row()
        row[7] = "×××"  # city column with mojibake
        result = parse_row(row, row_number=2)
        assert result.mojibake

    def test_import_rows_batch_rejected_on_mojibake(self, db):
        from app.services.producer_import import import_rows
        rows = [self._good_row(), self._mojibake_row(name="ס××ø")]
        result = import_rows(db, rows, dry_run=False)
        assert result.get("batch_rejected") is True
        assert result["imported"] == 0
        assert "קידוד לא תקין" in result["batch_error"]

    def test_import_rows_clean_batch_succeeds(self, db):
        from app.services.producer_import import import_rows
        rows = [self._good_row(name="מאפיית הדר")]
        result = import_rows(db, rows, dry_run=True)
        assert result.get("batch_rejected") is None
        assert result["imported"] == 1


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
        p = make_producer(db, status="approved")
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
