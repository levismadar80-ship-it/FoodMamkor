"""
API tests for מהמקור backend.

Coverage:
- Auth: register, login (success/wrong password/blocked user), /auth/me
- Producers: list, filter by delivery_city, filter by category, get by id
- Admin: 401/403 for non-admins, approve flow, dashboard, users, categories,
  settings, analytics, page editing
- Contact: POST /contact — DB save, validation, email sending, fail-open
"""
from app.models.models import AdminSetting, ContactMessage, Producer, ProducerWhatsAppClick, StaticPage
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
        monkeypatch.setattr(auth_mod, "_notify_admin_new_producer", lambda p: None)
        monkeypatch.setattr(auth_mod, "_notify_producer_registered", lambda p: None)
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

    # ----- Email delivery (SMTP) -----

    def test_submit_contact_sends_email_to_contact_email(
        self, client, db, monkeypatch
    ):
        """When CONTACT_EMAIL + SMTP are configured, an email is sent to
        CONTACT_EMAIL with name/email/message in the body."""
        from app import config
        from app.routers import marketing

        monkeypatch.setattr(config.settings, "smtp_user", "bot@example.com")
        monkeypatch.setattr(config.settings, "smtp_password", "secret")
        monkeypatch.setattr(
            config.settings, "contact_email", "contactmehamakor.online@gmail.com"
        )

        sent = {}

        class FakeSMTP:
            def __init__(self, host, port):
                sent["host"] = host
                sent["port"] = port

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def starttls(self):
                pass

            def login(self, user, password):
                sent["login"] = (user, password)

            def send_message(self, msg):
                sent["to"] = msg["To"]
                sent["from"] = msg["From"]
                sent["subject"] = msg["Subject"]
                sent["body"] = msg.get_payload(decode=True).decode("utf-8")

        import smtplib
        monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
        # Also patch the late-imported name inside the router module, if any.
        monkeypatch.setattr(marketing, "smtplib", smtplib, raising=False)

        resp = client.post("/contact", json=self.VALID_PAYLOAD)
        assert resp.status_code == 200

        assert sent.get("to") == "contactmehamakor.online@gmail.com"
        assert sent.get("from") == "bot@example.com"
        assert "רות כהן" in sent.get("body", "")
        assert "ruth@example.com" in sent.get("body", "")
        assert "להוסיף יצרן חדש" in sent.get("body", "")
        # And DB row still created
        assert db.query(ContactMessage).count() == 1

    def test_submit_contact_falls_back_to_admin_email(
        self, client, db, monkeypatch
    ):
        """If CONTACT_EMAIL is empty but ADMIN_EMAIL is set, the email
        is routed to ADMIN_EMAIL (backwards-compat with pre-existing
        SMTP config)."""
        from app import config

        monkeypatch.setattr(config.settings, "smtp_user", "bot@example.com")
        monkeypatch.setattr(config.settings, "smtp_password", "secret")
        monkeypatch.setattr(config.settings, "contact_email", "")
        monkeypatch.setattr(
            config.settings, "admin_email", "levismadar80@gmail.com"
        )

        sent = {}

        class FakeSMTP:
            def __init__(self, host, port):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def starttls(self):
                pass

            def login(self, *a, **k):
                pass

            def send_message(self, msg):
                sent["to"] = msg["To"]

        import smtplib
        monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)

        resp = client.post("/contact", json=self.VALID_PAYLOAD)
        assert resp.status_code == 200
        assert sent.get("to") == "levismadar80@gmail.com"

    # ----- Fail-open -----

    def test_submit_contact_fail_open_when_smtp_missing(
        self, client, db, monkeypatch
    ):
        """SMTP unconfigured → 200, DB row still saved, no crash."""
        from app import config

        monkeypatch.setattr(config.settings, "smtp_user", "")
        monkeypatch.setattr(config.settings, "smtp_password", "")
        monkeypatch.setattr(config.settings, "contact_email", "")
        monkeypatch.setattr(config.settings, "admin_email", "")

        resp = client.post("/contact", json=self.VALID_PAYLOAD)
        assert resp.status_code == 200
        assert db.query(ContactMessage).count() == 1

    def test_submit_contact_fail_open_on_smtp_exception(
        self, client, db, monkeypatch
    ):
        """SMTP raises → 200, DB row still saved, no crash (AI-fail-open
        ethos extended to SMTP per CLAUDE.md key locked decisions)."""
        from app import config

        monkeypatch.setattr(config.settings, "smtp_user", "bot@example.com")
        monkeypatch.setattr(config.settings, "smtp_password", "secret")
        monkeypatch.setattr(
            config.settings, "contact_email", "contactmehamakor.online@gmail.com"
        )

        class ExplodingSMTP:
            def __init__(self, *a, **k):
                raise OSError("SMTP server unreachable")

            def __enter__(self):
                raise OSError("SMTP server unreachable")

            def __exit__(self, *a):
                return False

        import smtplib
        monkeypatch.setattr(smtplib, "SMTP", ExplodingSMTP)

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
